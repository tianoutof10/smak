import assert from 'node:assert/strict'
import test, { before } from 'node:test'
import { areas as englishAreas, en } from '../src/i18n/en/index.ts'
import { loadLanguage, dateFormatter, decimalSeparator, formatDecimal, formatNumber, localeFor, plural, pseudoLocalize, resolveLanguage, setActiveLanguage, t } from '../src/i18n/index.ts'
import { normalizeSmakPreferences } from '../src/features/settings/smakPreferences.ts'

before(() => loadLanguage('de'))

test('date formatters reuse identical explicit-zone options across history rows', () => {
  setActiveLanguage('en', ['en-US'])
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  assert.equal(dateFormatter(options), dateFormatter({ ...options }))
  assert.notEqual(dateFormatter(options), dateFormatter({ ...options, year: 'numeric' }))
  assert.notEqual(dateFormatter(options), dateFormatter({ ...options, timeZone: 'Europe/Berlin' }))
})

test('cached dates follow language and regional changes', () => {
  const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', timeZone: 'UTC' }
  const date = new Date('2026-03-18T12:00:00Z')
  setActiveLanguage('en', ['en-US'])
  const enUS = dateFormatter(options)
  setActiveLanguage('de', ['de-DE'])
  const deDE = dateFormatter(options)
  assert.equal(deDE.format(date), new Intl.DateTimeFormat('de-DE', options).format(date))
  assert.notEqual(deDE, enUS)
  setActiveLanguage('en', ['en-GB'])
  assert.equal(dateFormatter(options).format(date), new Intl.DateTimeFormat('en-GB', options).format(date))
  assert.notEqual(dateFormatter(options), enUS)
  setActiveLanguage('en', ['en-US'])
})

test('implicit device timezones are not cached and can follow Android timezone changes', () => {
  const options: Intl.DateTimeFormatOptions = { month: 'long' }
  assert.notEqual(dateFormatter(options), dateFormatter(options))
})

test('every area keeps its keys under its own prefix, so merged catalogs cannot overwrite each other', () => {
  const seen = new Set<string>()
  for (const [area, catalog] of Object.entries(englishAreas)) {
    for (const key of Object.keys(catalog)) {
      assert.ok(key.startsWith(`${area}.`), `${key} belongs in the ${area} area`)
      assert.ok(!seen.has(key), `duplicate key ${key}`)
      seen.add(key)
    }
  }
  assert.equal(seen.size, Object.keys(en).length)
})

test('auto follows the first supported device language and falls back to English', () => {
  assert.equal(resolveLanguage('auto', ['de-DE', 'en-US']), 'de')
  assert.equal(resolveLanguage('auto', ['de-CH']), 'de')
  assert.equal(resolveLanguage('auto', ['fr-FR', 'de-AT']), 'fr')
  assert.equal(resolveLanguage('auto', ['es-ES', 'de-AT']), 'es')
  assert.equal(resolveLanguage('auto', ['es-ES']), 'es')
  assert.equal(resolveLanguage('auto', ['ja-JP', 'de-AT']), 'de')
  assert.equal(resolveLanguage('auto', ['ja-JP']), 'en')
  assert.equal(resolveLanguage('auto', []), 'en')
  assert.equal(resolveLanguage('en', ['de-DE']), 'en')
  assert.equal(resolveLanguage('de', ['en-US']), 'de')
  assert.equal(localeFor('de', ['de-CH', 'en-US']), 'de-CH')
  assert.equal(localeFor('de', ['en-US']), 'de-DE')
  assert.equal(localeFor('en', ['de-DE']), 'en-US')
})

test('the language preference defaults to auto and rejects unknown values', () => {
  assert.equal(normalizeSmakPreferences(undefined).language, 'auto')
  assert.equal(normalizeSmakPreferences({ language: 'de' }).language, 'de')
  assert.equal(normalizeSmakPreferences({ language: 'fr' }).language, 'fr')
  assert.equal(normalizeSmakPreferences({ language: 'es' }).language, 'es')
  assert.equal(normalizeSmakPreferences({ language: 'not-a-locale' }).language, 'auto')
})

test('German uses the decimal comma without changing toFixed rounding; English output is unchanged', () => {
  setActiveLanguage('en', ['en-US'])
  assert.equal(formatDecimal(36.25, 1), (36.25).toFixed(1))
  assert.equal(formatDecimal(9.5), '10')
  assert.equal(formatNumber(1234), '1,234')
  setActiveLanguage('de', ['de-DE'])
  assert.equal(decimalSeparator(), ',')
  assert.equal(formatDecimal(36.5, 1), '36,5')
  assert.equal(formatDecimal(-0.04, 1), '-0,0')
  assert.equal(formatNumber(1234), '1.234')
  setActiveLanguage('de', ['de-CH'])
  assert.equal(formatDecimal(36.5, 1), '36.5')
  setActiveLanguage('en', ['en-US'])
})

test('messages switch language at runtime and fill placeholders', () => {
  setActiveLanguage('de', ['de-DE'])
  assert.equal(t('common.metric.flow'), 'Durchfluss')
  assert.equal(t('common.language.auto', { language: 'Deutsch' }), 'Wie Gerät (Deutsch)')
  setActiveLanguage('en', ['en-US'])
  assert.equal(t('common.metric.flow'), 'Flow')
  assert.equal(typeof plural, 'function')
})

test('pseudo localisation keeps placeholders intact and makes text longer', () => {
  const pseudo = pseudoLocalize('Stage {n} of {total}')
  assert.match(pseudo, /\{n\}/)
  assert.match(pseudo, /\{total\}/)
  assert.ok(pseudo.length > 'Stage {n} of {total}'.length * 1.3)
})

test('dot-decimal model values are shown with the locale separator without changing English', async () => {
  const { localizeDecimalText } = await import('../src/i18n/index.ts')
  setActiveLanguage('en', ['en-US'])
  assert.equal(localizeDecimalText('14.5'), '14.5')
  setActiveLanguage('de', ['de-DE'])
  assert.equal(localizeDecimalText('14.5'), '14,5')
  assert.equal(localizeDecimalText('1:2.1'), '1:2,1')
  assert.equal(localizeDecimalText('—'), '—')
  assert.equal(localizeDecimalText('42'), '42')
  setActiveLanguage('en', ['en-US'])
})

test('insight period labels keep the English order and use German day-month order', async () => {
  const { insightPeriods } = await import('../src/features/insights/insightClock.ts')
  const windows: [{ start: string; end: string }, { start: string; end: string }] = [{ start: '2026-09-12', end: '2026-09-19' }, { start: '2026-09-05', end: '2026-09-12' }]
  setActiveLanguage('en', ['en-US'])
  assert.deepEqual(insightPeriods(...windows), ['12–18 Sep', '5–11 Sep'])
  setActiveLanguage('de', ['de-DE'])
  assert.deepEqual(insightPeriods(...windows), ['12.–18. Sept.', '5.–11. Sept.'])
  setActiveLanguage('en', ['en-US'])
})
