import { useEffect, useMemo, useRef, useState } from 'react'
import type { LiveShotPoint } from '../../domain/brewing'
import { daysOffRoast } from '../../domain/beans'
import type { ChassisParams } from '../../domain/chassis'
import { analysisOverridesForGear, nextGrindSetting } from '../../domain/gear'
import { restState } from '../../domain/rest'
import { analyseShot, type ShotAnalysis, type ShotFinding } from '../../domain/shotAnalysis'
import { paceAgainstBaseline, shotPace, type PaceReading } from '../../domain/shotPace'
import { paceHistory } from './paceHistory'
import { formatDecimal, t } from '../../i18n/index.ts'
import { TasteSquare, type TastePoint } from '../../components/TasteSquare/TasteSquare'
import { activeBean, coffeeUpdates, useCoffeeLibrary } from '../beans/coffeeLibrary'
import { journeyFor, recipeFromEntry, targetFor } from '../beans/dialJourney'
import { adviceApplyAction, extractionYieldPct, measuredPoint, palateDisagrees, recommendNextShot, TASTE_ZONES, type ApplyAction, type Finish } from './dialIn'
import { applySummary, stepText } from './dialInText'
import { learnedResponse, sizeFromHistory } from './learnedResponse'
import './shotDialIn.css'

export interface ShotDialInPanelProps {
  points: LiveShotPoint[]
  /** Stable per pull, used to keep one tasting per shot. Falls back to shotId. */
  shotKey?: string
  shotId?: string
  profileId?: string
  profileName?: string
  dose?: number
  yieldGrams?: number
  grindSetting?: string
  temperatureC?: number
  chassis?: ChassisParams
  /** One-tap Apply. Present only where the change targets the active profile. */
  onApply?: (action: ApplyAction) => Promise<boolean>
  onAddTurbo?: () => void
  onClose: () => void
}

const seconds = (milliseconds: number) => `${formatDecimal(milliseconds / 1000, 1)} s`
const percent = (fraction: number) => String(Math.round(fraction * 100))
const reading = (value: number | undefined, digits = 1) => value === undefined || !Number.isFinite(value) ? '—' : formatDecimal(value, digits)

function FindingRow({ finding }: { finding: ShotFinding }) {
  if (finding.kind === 'chokedFlow') return <li className="dial-in-finding dial-in-finding--choked">
    <strong>{t('insights.dialIn.choked.title', { time: seconds(finding.atMs) })}</strong>
    <span>{t('insights.dialIn.choked.detail', { pressure: reading(finding.meanPressure), flow: reading(finding.meanFlow), seconds: Math.round(finding.durationMs / 1000) })}</span>
  </li>
  return <li className={`dial-in-finding dial-in-finding--drop dial-in-finding--${finding.severity}`}>
    <strong>{t('insights.dialIn.drop.title', { time: seconds(finding.atMs) })}</strong>
    <span>{t('insights.dialIn.drop.detail', { pct: percent(finding.dropFraction), pressure: reading(finding.pressure), flow: reading(finding.flow) })}</span>
    <span className="dial-in-finding__hint">{finding.phase === 'early' ? t('insights.dialIn.drop.early') : t('insights.dialIn.drop.late')}</span>
  </li>
}

function PuckSummary({ analysis, ratio, pace }: { analysis: ShotAnalysis; ratio?: number; pace?: PaceReading }) {
  const metrics: Array<{ label: string; value: string }> = []
  if (analysis.firstDropsMs !== undefined) metrics.push({ label: t('insights.dialIn.metric.firstDrops'), value: seconds(analysis.firstDropsMs) })
  if (ratio !== undefined) metrics.push({ label: t('insights.dialIn.metric.ratio'), value: t('insights.dialIn.ratioValue', { ratio: formatDecimal(ratio, 1) }) })
  if (pace) metrics.push({ label: pace.baseline ? t('insights.dialIn.metric.paceForYou', { usual: formatDecimal(pace.baseline.medianGramsPerSecond, 1) }) : t('insights.dialIn.metric.pace'), value: t(`insights.dialIn.pace.${pace.pace}`, { rate: formatDecimal(pace.gramsPerSecond, 1) }) })
  if (analysis.peakResistance !== undefined) metrics.push({ label: t('insights.dialIn.metric.peakResistance'), value: reading(analysis.peakResistance, 2) })
  if (analysis.resistanceDecline !== undefined) metrics.push({ label: t('insights.dialIn.metric.resistanceFell'), value: `${percent(analysis.resistanceDecline)}%` })
  if (analysis.breakdown) metrics.push({ label: t('insights.dialIn.metric.breakdown'), value: t(`insights.dialIn.breakdown.${analysis.breakdown}`) })
  return <>
    {!analysis.analysable && <p className="dial-in-muted">{t('insights.dialIn.notAnalysable')}</p>}
    {analysis.analysable && analysis.findings.length === 0 && <p className="dial-in-clean">{t('insights.dialIn.clean')}</p>}
    {analysis.findings.length > 0 && <ul className="dial-in-findings">{analysis.findings.map(finding => <FindingRow key={`${finding.kind}:${finding.atMs}`} finding={finding} />)}</ul>}
    {metrics.length > 0 && <dl className="dial-in-metrics">{metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>}
    {analysis.analysable && <p className="dial-in-muted">{t('insights.dialIn.method')}</p>}
  </>
}

function Segmented<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: Array<{ value: Value; label: string }>; onChange: (value: Value) => void }) {
  return <div className="dial-segmented" role="radiogroup" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? 'is-selected' : undefined} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>
}

type ApplyState = 'idle' | 'applying' | 'applied' | 'failed'

export function ShotDialInPanel({ points, shotKey, shotId, profileId, profileName, dose, yieldGrams, grindSetting: profileGrind, temperatureC, chassis, onApply, onAddTurbo, onClose }: ShotDialInPanelProps) {
  const { library, update, source } = useCoffeeLibrary()
  const gear = library.gear
  const bean = activeBean(library)
  const key = shotKey ?? shotId
  // Nothing loaded: offer the bags used most recently, so the tasting lands on the right coffee.
  const recentBeans = bean ? [] : library.beans.filter(candidate => !candidate.archivedAt).sort((left, right) => (right.lastUsedAt ?? right.createdAt).localeCompare(left.lastUsedAt ?? left.createdAt)).slice(0, 3)
  const overrides = useMemo(() => analysisOverridesForGear(gear), [gear])
  const analysis = useMemo(() => analyseShot(points, overrides), [points, overrides])
  const pace = useMemo(() => paceAgainstBaseline(shotPace(points, analysis), paceHistory(source, profileId, key)), [points, analysis, source, profileId, key])
  const peakPressureBar = useMemo(() => points.reduce<number | undefined>((peak, point) => typeof point.pressure === 'number' && Number.isFinite(point.pressure) ? Math.max(peak ?? 0, point.pressure) : peak, undefined), [points])
  const journey = journeyFor(library, bean?.id)
  const stored = key ? journey.entries.find(entry => entry.key === key) : undefined
  const [point, setPoint] = useState<TastePoint | undefined>(stored ? { extraction: stored.extraction, strength: stored.strength } : undefined)
  const [finish, setFinish] = useState<Finish>(stored?.finish ?? 'clean')
  // The grind this shot was actually pulled at: confirmed here, so the bag's memory stays honest.
  const [grindSetting, setGrindSetting] = useState<string | undefined>(stored?.grindSetting ?? profileGrind)
  const [milk, setMilk] = useState<boolean>(stored?.milk ?? bean?.forMilk === true)
  const [tds, setTds] = useState(stored?.tdsPct !== undefined ? String(stored.tdsPct) : '')
  const [touched, setTouched] = useState(false)
  const [applyState, setApplyState] = useState<ApplyState>('idle')
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tdsPct = Number(tds.replace(',', '.'))
  const validTds = tds.trim() !== '' && Number.isFinite(tdsPct) && tdsPct > 0 && tdsPct < 25 ? tdsPct : undefined
  const extractionPct = extractionYieldPct(validTds, yieldGrams, dose)
  const measured = validTds !== undefined && extractionPct !== undefined ? measuredPoint(validTds, extractionPct) : undefined
  const rest = restState(bean)
  const beanId = bean?.id
  const persistableId = shotId && !shotId.startsWith('live:') ? shotId : undefined

  // Record the tasting against the loaded bag, shortly after the last change (dragging writes once).
  const storedAt = stored?.at
  const beanAgeDays = daysOffRoast(bean)
  const paceKind = pace?.pace
  useEffect(() => {
    if (!touched || !point || !beanId || !key) return
    const timer = window.setTimeout(() => update(current => coffeeUpdates.recordTasting(current, beanId, {
      key, at: storedAt ?? new Date().toISOString(), extraction: point.extraction, strength: point.strength, finish, milk: milk || undefined,
      dose, yield: yieldGrams === undefined ? undefined : Math.round(yieldGrams * 10) / 10, grindSetting, temperatureC, profileId, profileName,
      tdsPct: validTds, pace: paceKind, beanAgeDays,
    })), 350)
    return () => window.clearTimeout(timer)
  }, [touched, point, finish, milk, validTds, beanId, key, storedAt, dose, yieldGrams, grindSetting, temperatureC, profileId, profileName, paceKind, beanAgeDays, update])
  useEffect(() => {
    if (!touched || !persistableId || !beanId || library.shotBeans[persistableId]?.beanId === beanId) return
    update(current => coffeeUpdates.linkShot(current, persistableId, { beanId, profileId, grindSetting }))
  }, [touched, persistableId, beanId, profileId, grindSetting, library.shotBeans, update])
  // Remember "for milk" on the bag: most people drink a coffee one way.
  const toggleMilk = (next: boolean) => {
    setMilk(next); setTouched(true); setApplyState('idle')
    if (beanId) update(current => coffeeUpdates.updateBean(current, beanId, { forMilk: next || undefined }))
  }

  const note = point ? { extraction: point.extraction, strength: point.strength, finish, milk } : undefined
  const context = { dose, yield: yieldGrams, grindSetting, temperatureC, peakPressureBar, gear, chassis, pace: pace?.pace, rest: rest?.phase }
  const allEntries = Object.values(library.dialLog).flat()
  const bagHistory = journey.entries.filter(entry => entry.key !== key)
  const allHistory = allEntries.filter(entry => entry.key !== key)
  const responses = { grind: learnedResponse(bagHistory, allHistory, 'grind'), yield: learnedResponse(bagHistory, allHistory, 'yield') }
  const sized = note ? sizeFromHistory(recommendNextShot(note, analysis, context), note.extraction, context, responses) : undefined
  const advice = sized?.advice
  const action = adviceApplyAction(advice)
  const ratio = dose && yieldGrams ? yieldGrams / dose : undefined
  const earlier = journey.entries.filter(entry => entry.key !== key)
  const shotNumber = earlier.length + 1
  const onTargetPair = journey.status === 'dialedIn' && journey.entries.at(-1)?.key === key
  const pinned = beanId ? library.pinned[beanId] : undefined
  const pinnedThis = Boolean(pinned && stored && pinned.pinnedAt >= stored.at && pinned.grindSetting === stored.grindSetting && pinned.yield === stored.yield)
  const grindNumber = grindSetting !== undefined && Number.isFinite(Number(grindSetting.replace(',', '.'))) && grindSetting.trim() !== '' ? Number(grindSetting.replace(',', '.')) : undefined
  const changeGrind = (direction: 1 | -1) => {
    const next = nextGrindSetting(grindSetting, direction, gear)
    if (next === undefined) return
    const text = String(next)
    setGrindSetting(text); setApplyState('idle')
    if (point) setTouched(true)
    if (beanId && profileId) update(current => coffeeUpdates.rememberGrind(current, beanId, profileId, text))
  }
  const choose = (next: TastePoint) => { setPoint(next); setTouched(true); setApplyState('idle') }
  const apply = async () => {
    if (!action || !onApply) return
    setApplyState('applying')
    setApplyState(await onApply(action).catch(() => false) ? 'applied' : 'failed')
  }
  const pin = () => {
    const entry = journey.entries.find(item => item.key === key) ?? stored
    if (!beanId || !entry) return
    update(current => {
      const next = coffeeUpdates.pinRecipe(current, beanId, recipeFromEntry(entry))
      return entry.profileId && entry.grindSetting ? coffeeUpdates.rememberGrind(next, beanId, entry.profileId, entry.grindSetting) : next
    })
  }
  const subtitle = bean ? t('insights.dialIn.subtitleShot', { bean: bean.name, shot: shotNumber }) : t('insights.dialIn.subtitleNoBean')

  return <div className="dial-in-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="dial-sheet" role="dialog" aria-modal="true" aria-labelledby="dial-in-title">
      <header className="dial-sheet__header">
        <div><h2 id="dial-in-title">{t('insights.dialIn.howWasIt')}</h2><p>{subtitle}</p></div>
        <button ref={closeRef} className="dial-button dial-button--quiet" type="button" onClick={onClose}>{t('insights.dialIn.close')}</button>
      </header>
      <div className="dial-sheet__body">
        <section className="dial-sheet__taste" aria-label={t('insights.dialIn.tasteHeading')}>
          {!bean && recentBeans.length > 0 && <div className="dial-bean-pick">
            <p className="dial-eyebrow">{t('insights.dialIn.whichCoffee')}</p>
            <div>{recentBeans.map(candidate => <button key={candidate.id} type="button" className="dial-button" onClick={() => update(current => coffeeUpdates.loadBean(current, candidate.id))}>{candidate.name}</button>)}</div>
          </div>}
          <TasteSquare value={point} onChange={choose} path={earlier.map(entry => ({ extraction: entry.extraction, strength: entry.strength }))} measured={measured} targetStrength={targetFor(milk).strength} targetRadius={TASTE_ZONES.centre} />
          <div className="dial-grind">
            <span id="dial-grind-label">{t('insights.dialIn.grindUsed')}</span>
            <div className="dial-stepper" role="group" aria-labelledby="dial-grind-label">
              <button type="button" aria-label={t('insights.dialIn.grindFinerAria')} disabled={grindNumber === undefined} onClick={() => changeGrind(-1)}>−</button>
              <output aria-live="polite">{grindSetting ?? '—'}</output>
              <button type="button" aria-label={t('insights.dialIn.grindCoarserAria')} disabled={grindNumber === undefined} onClick={() => changeGrind(1)}>+</button>
            </div>
          </div>
          <div className="dial-sheet__controls">
            <Segmented<Finish> label={t('insights.taste.finish')} value={finish} onChange={value => { setFinish(value); setTouched(true); setApplyState('idle') }} options={[{ value: 'clean', label: t('insights.taste.clean') }, { value: 'drying', label: t('insights.taste.drying') }]} />
            <label className="dial-switch"><input type="checkbox" checked={milk} onChange={event => toggleMilk(event.target.checked)} /><span aria-hidden="true" /><b>{t('insights.taste.withMilk')}</b></label>
          </div>
        </section>
        <section className="dial-sheet__next" aria-live="polite">
          {!advice && <div className="dial-prompt">
            <p className="dial-eyebrow">{t('insights.dialIn.tasteHeading')}</p>
            <p className="dial-prompt__lead">{t('insights.taste.prompt')}</p>
            <p className="dial-muted">{t('insights.taste.promptDetail')}</p>
          </div>}
          {advice && <div className="dial-next">
            <p className="dial-eyebrow">{advice.primary.kind === 'keep' ? t('insights.dialIn.onTarget') : t('insights.dialIn.nextHeading')}</p>
            <p className="dial-next__step">{stepText(advice.primary)}</p>
            {action && onApply && <div className="dial-next__apply">
              <button className="dial-button dial-button--primary" type="button" disabled={applyState === 'applying' || applyState === 'applied'} onClick={() => void apply()}>
                {applyState === 'applying' ? t('insights.dialIn.apply.applying') : applyState === 'applied' ? t('insights.dialIn.apply.applied') : t('insights.dialIn.apply.button')}
              </button>
              <span>{applyState === 'failed' ? t('insights.dialIn.apply.failed') : applySummary(action)}</span>
            </div>}
            <p className="dial-next__why">{t(`insights.dialIn.reason.${advice.reason}`, { ratio: advice.ratio === undefined ? '—' : t('insights.dialIn.ratioValue', { ratio: formatDecimal(advice.ratio, 1) }), rate: pace ? formatDecimal(pace.gramsPerSecond, 1) : '—', days: rest?.days ?? '—' })}</p>
            {sized?.learned && <p className="dial-next__note">{t(sized.learned.lever === 'grind' ? (sized.learned.scope === 'bag' ? 'insights.dialIn.learned.grindBag' : 'insights.dialIn.learned.grindAll') : (sized.learned.scope === 'bag' ? 'insights.dialIn.learned.yieldBag' : 'insights.dialIn.learned.yieldAll'), { count: sized.learned.samples, effect: formatDecimal(Math.abs(sized.learned.slope) * (sized.learned.lever === 'grind' ? (gear.grindStepSize ?? 1) : 1), 2) })}</p>}
            {advice.confidence === 'tentative' && advice.primary.kind !== 'keep' && <p className="dial-next__note">{t('insights.dialIn.tentative')}</p>}
            {advice.milk && advice.primary.kind !== 'keep' && <p className="dial-next__note">{t('insights.dialIn.milkTarget')}</p>}
            {advice.secondary && <p className="dial-next__more"><span>{advice.primary.kind === 'puckPrep' ? t('insights.dialIn.thenAfterPrep') : t('insights.dialIn.then')}</span>{stepText(advice.secondary)}</p>}
            {advice.alternative && <p className="dial-next__more"><span>{t('insights.dialIn.orInstead')}</span>{stepText(advice.alternative)}{advice.alternative.kind === 'tryTurbo' && onAddTurbo && <> <button className="dial-link" type="button" onClick={onAddTurbo}>{t('insights.dialIn.openPresets')}</button></>}</p>}
            <p className="dial-muted">{advice.basis === 'both' ? t('insights.dialIn.basis.both') : t('insights.dialIn.basis.taste')}</p>
          </div>}
          {advice?.primary.kind === 'keep' && bean && <div className={`dial-stop${onTargetPair ? ' dial-stop--done' : ''}`}>
            <p className="dial-stop__lead">{onTargetPair ? t('insights.dialIn.stop.dialedIn') : t('insights.dialIn.stop.onceMore')}</p>
            <p className="dial-muted">{onTargetPair ? t('insights.dialIn.stop.dialedInDetail', { bean: bean.name }) : t('insights.dialIn.stop.onceMoreDetail')}</p>
            {stored && <div className="dial-next__apply">
              <button className="dial-button dial-button--primary" type="button" disabled={pinnedThis} onClick={pin}>{pinnedThis ? t('insights.dialIn.pin.pinned') : t('insights.dialIn.pin.button')}</button>
              <span>{t('insights.dialIn.pin.detail', { bean: bean.name })}</span>
            </div>}
          </div>}
          <details className="dial-fold">
            <summary>{t('insights.dialIn.refractometer')}{extractionPct !== undefined && <em>{t('insights.dialIn.eyValue', { ey: formatDecimal(extractionPct, 1) })}</em>}</summary>
            <div className="dial-fold__body">
              <label className="dial-field"><span>{t('insights.dialIn.tds')}</span><input type="number" inputMode="decimal" step="0.01" min="0" max="25" placeholder="9.50" value={tds} onChange={event => { setTds(event.target.value); setTouched(true) }} /></label>
              {extractionPct !== undefined
                ? <p className="dial-muted">{t('insights.dialIn.eyDetail', { ey: formatDecimal(extractionPct, 1), tds: formatDecimal(validTds!, 2) })}</p>
                : <p className="dial-muted">{t('insights.dialIn.tdsHint')}</p>}
              {measured && point && palateDisagrees(point, measured) && <p className="dial-next__note">{t('insights.dialIn.palateDisagrees')}</p>}
            </div>
          </details>
          <details className="dial-fold" open={analysis.findings.length > 0}>
            <summary>{t('insights.dialIn.puckHeading')}{analysis.findings.length > 0 && <em className="dial-fold__flag">{t('insights.dialIn.findingCount', { count: analysis.findings.length })}</em>}</summary>
            <div className="dial-fold__body"><PuckSummary analysis={analysis} ratio={ratio} pace={pace} /></div>
          </details>
        </section>
      </div>
    </aside>
  </div>
}
