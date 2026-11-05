import assert from 'node:assert/strict'
import test, { before } from 'node:test'
import { en } from '../src/i18n/en/index.ts'
import { LANGUAGES, languageRegistry, isLanguage, matchLanguage } from '../src/i18n/registry.ts'
import { activeLanguage, activeLocaleTag, loadLanguage, setActiveLanguage, t, pluralTemplate, formatDecimal, localizeDecimalText, parseLocalizedNumber } from '../src/i18n/index.ts'
import { translationStatus, validateCatalog } from '../src/i18n/validation.ts'
import { normalizeSmakPreferences } from '../src/features/settings/smakPreferences.ts'
import { displayedShotName, displayedStageName, reconcileGeneratedLabels } from '../src/i18n/dataLabels.ts'
import { shotToDomain } from '../src/api/decaid/adapters.ts'
import { historyProfileName, normalizeShot, shotRecipeLabel } from '../src/features/insights/historyData.ts'
import { stageReasonParts } from '../src/features/brew/stageReasonLabels.ts'
import { analyseStageMoveOn, reconcileStageReasons } from '../src/features/brew/stageMoveOn.ts'
import { interfaceLiterals } from '../scripts/i18nAudit.ts'
import type { PreviousShot } from '../src/domain/brewing.ts'
import type { ShotRecord } from '../src/api/decaid/types.ts'

before(() => loadLanguage('de'))

test('the registry resolves region and script variants without adding language-specific branches', () => {
  const registry = { en: { locale: 'en-US' }, 'pt-BR': { locale: 'pt-BR' }, 'pt-PT': { locale: 'pt-PT' }, 'zh-Hans': { locale: 'zh-CN' }, 'zh-Hant': { locale: 'zh-TW' } }
  assert.equal(matchLanguage('en-GB', registry), 'en')
  assert.equal(matchLanguage('pt-PT', registry), 'pt-PT')
  assert.equal(matchLanguage('pt-BR', registry), 'pt-BR')
  assert.equal(matchLanguage('zh-TW', registry), 'zh-Hant')
  assert.equal(matchLanguage('zh-CN', registry), 'zh-Hans')
  assert.equal(matchLanguage('ar-EG', registry), undefined)
})

test('every registered language shares validation and preference handling', async () => {
  for (const language of LANGUAGES) {
    assert.equal(isLanguage(language), true)
    assert.equal(normalizeSmakPreferences({ language }).language, language)
    assert.deepEqual(validateCatalog(en, await languageRegistry[language].load(), languageRegistry[language].locale), [])
  }
  assert.equal(isLanguage('constructor'), false)
})

test('English or translation edits need explicit review; missing/obsolete tokens are distinguished', () => {
  const source = { greeting: 'Hello {name}', count: { one: '{count} item', other: '{count} items' } }
  const target = { greeting: 'Hallo {name}' }
  const reviewed = { greeting: { source: source.greeting, translation: target.greeting } }
  assert.deepEqual(translationStatus(source, target, reviewed).map(s => s.status), ['current', 'missing'])
  assert.equal(translationStatus({ ...source, greeting: 'Welcome {name}' }, target, reviewed)[0].status, 'needs review')
  assert.equal(translationStatus(source, { greeting: 'Guten Tag {name}' }, reviewed)[0].status, 'needs review')
  assert.match(validateCatalog(source, { obsolete: 'x' }, 'de')[0], /unknown/)
})

test('checks each plural branch and rich-text marker, not the union of placeholders', () => {
  const source = { count: { one: '{count} {name}', other: '{count} {name}' }, help: 'Press %ICON%' }
  const errors = validateCatalog(source, { count: { one: '{count}', other: '{count} {name}' }, help: 'Drücken' }, 'de')
  assert.ok(errors.some(error => error.includes('count.one')))
  assert.ok(errors.some(error => error.includes('help')))
  assert.deepEqual(validateCatalog(source, {}, 'de'), [])
})

test('a third-language catalog supports Arabic plural categories without changing feature code', () => {
  const entry = { zero: 'zero', one: 'one', two: 'two', few: 'few', many: 'many', other: 'other' }
  assert.deepEqual([0, 1, 2, 3, 11, 100].map(n => pluralTemplate(entry, n, 'ar-EG')), ['zero', 'one', 'two', 'few', 'many', 'other'])
  assert.ok(validateCatalog({ count: { one: 'one', other: 'other' } }, { count: { one: 'one', other: 'other' } }, 'ar').some(error => error.includes('.few')))
  assert.equal(pluralTemplate({ other: 'fallback' }, 3, 'ar'), 'fallback')
})

test('regional decimals, negative zero, ratios and input remain separate from canonical stored data', async () => {
  await setActiveLanguage('de', ['de-DE'])
  assert.equal(formatDecimal(-0.04, 1), '-0,0')
  assert.equal(localizeDecimalText('1234.50'), '1234,50')
  assert.equal(localizeDecimalText('1:2.1'), '1:2,1')
  assert.equal(localizeDecimalText('Profile 1.2'), 'Profile 1.2')
  assert.equal(shotRecipeLabel({ dose: 18.5, yield: 36.5, duration: 25.5 }), '18,5 → 36,5 g • 25,5s')
  assert.equal(parseLocalizedNumber('18,5'), 18.5)
  for (const input of ['1.234,5', '1,234.5', '', '1 234', '18.5', '1,2,3']) assert.ok(Number.isNaN(parseLocalizedNumber(input)), input)
  assert.equal(parseLocalizedNumber('١٨٫٥', 'ar-EG'), 18.5)
  assert.equal(parseLocalizedNumber('۱۸٫۵', 'fa-IR'), 18.5)
  assert.equal(parseLocalizedNumber('18.5', 'de-CH'), 18.5)
  await setActiveLanguage('de', ['de-CH'])
  assert.equal(formatDecimal(18.5, 1), '18.5')
  assert.equal(activeLocaleTag(), 'de-CH')
  await setActiveLanguage('en', ['en-US'])
})

test('new history labels remain language-neutral; user-authored names are never translated', async () => {
  const raw: ShotRecord = { id: 'test', timestamp: '2026-09-19T08:00:00Z', workflow: { profile: { beverage_type: 'espresso', steps: [{ name: '' }] } }, measurements: [
    { machine: { timestamp: '2026-09-19T08:00:00Z', profileFrame: 0, state: { state: 'espresso', substate: 'pouring' } } },
  ] }
  await setActiveLanguage('de', ['de-DE'])
  const detail = shotToDomain(raw)
  assert.equal(detail.profileName, 'Previous pull')
  assert.equal(displayedShotName(detail), 'Letzter Bezug')
  const serialized = JSON.stringify(detail)
  await setActiveLanguage('en', ['en-US'])
  assert.equal(displayedShotName(detail), 'Previous pull')
  assert.equal(displayedStageName(detail.points![0]), 'Extraction')
  assert.equal(JSON.stringify(detail), serialized)
  const authored = { ...detail, profileName: 'Letzter Bezug', profileNameFallback: undefined }
  assert.equal(displayedShotName(authored), 'Letzter Bezug')
  const record = normalizeShot(raw, 'UTC')!
  await setActiveLanguage('de', ['de-DE'])
  assert.equal(historyProfileName(record), 'Unbekanntes Profil')
  assert.equal(historyProfileName({ ...record, profileNameMissing: false, signature: '{"workflow":{"name":"Unknown profile"}}' }), 'Unknown profile')
  await setActiveLanguage('en', ['en-US'])
})

test('legacy cached labels require recipe evidence before repair', () => {
  const detail: PreviousShot = { profileName: 'Letzter Bezug', totalYield: '36', totalTime: '25', points: [{ elapsedMs: 0, stageIndex: 0, stageName: 'Phase 1' }] }
  assert.equal(reconcileGeneratedLabels(detail), detail)
  const repaired = reconcileGeneratedLabels(detail, JSON.stringify({ workflow: { profile: { steps: [{ name: '' }] } } }))
  assert.equal(repaired.profileNameFallback, 'previousPull')
  assert.equal(repaired.points![0].stageNameFallback, 'stageNumber')
  assert.equal(reconcileGeneratedLabels(detail, JSON.stringify({ workflow: { name: 'Letzter Bezug', profile: { steps: [{ name: 'Phase 1' }] } } })), detail)
})

test('structured stage reasons ignore English wording and old evidence is upgraded without re-inference', async () => {
  const points = [{ elapsedMs: 0, stageIndex: 0, pressure: 8 }, { elapsedMs: 500, stageIndex: 1, pressure: 1 }]
  const analysis = analyseStageMoveOn(points, [{ exit: { type: 'pressure', condition: 'over', value: 7 } }])
  const reason = analysis.reasons['0:0']
  assert.deepEqual(reason.conditions, [{ code: 'sensor', sensor: 'pressure', comparison: 'over', threshold: 7 }])
  await setActiveLanguage('de', ['de-DE'])
  assert.equal(stageReasonParts({ ...reason, label: 'English wording can change freely' })[0].text, 'Druck >7 bar erreicht')
  const old: PreviousShot = { profileName: 'Test', totalYield: '36', totalTime: '25', stageReasons: { version: 3, reasons: { boundary: { label: 'Manually advanced', kind: 'advance', source: 'recorded' } } } }
  const migrated = reconcileStageReasons(old)
  assert.deepEqual(migrated.stageReasons!.reasons.boundary.conditions, [{ code: 'manualAdvance' }])
  assert.equal(migrated.stageReasons!.reasons.boundary.source, 'recorded')
  await setActiveLanguage('en', ['en-US'])
})

test('interface literal audit catches new labels, including accessibility text', () => {
  const result = interfaceLiterals('Example.tsx', '<button aria-label="Delete profile">Delete</button>')
  assert.deepEqual(result.map(r => r.text), ['Delete profile', 'Delete'])
  assert.deepEqual(interfaceLiterals('Example.tsx', '<button aria-label={t("common.delete")}>{t("common.delete")}</button>'), [])
})

test('failed lazy loads keep English available, retry successfully and cannot overwrite a newer choice', async () => {
  const original = languageRegistry.de.load
  try {
    languageRegistry.de.load = () => Promise.reject(new Error('offline'))
    const fresh = await import('../src/i18n/index.ts?load-failure')
    await fresh.setActiveLanguage('de', ['de-DE'])
    assert.equal(fresh.t('common.metric.flow'), 'Flow')
    languageRegistry.de.load = original
    await fresh.setActiveLanguage('de', ['de-DE'])
    assert.equal(fresh.t('common.metric.flow'), 'Durchfluss')
    const race = await import('../src/i18n/index.ts?load-race')
    const german = race.setActiveLanguage('de', ['de-DE'])
    await race.setActiveLanguage('en', ['en-US'])
    await german
    assert.equal(race.activeLanguage(), 'en')
    assert.equal(race.t('common.metric.flow'), 'Flow')
  } finally { languageRegistry.de.load = original }
  assert.equal(activeLanguage(), 'en')
  assert.equal(t('common.metric.flow'), 'Flow')
})
