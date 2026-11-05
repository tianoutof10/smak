import { useEffect, useMemo, useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import { formatDecimal, t } from '../../i18n/index.ts'
import { displayedShotName, displayedStageName } from '../../i18n/dataLabels.ts'
import { analyseStageMoveOn } from './stageMoveOn'
import { liveShotFlowRate, liveShotYield, type BrewingScreenModel, type LiveBrewState } from '../../domain/brewing'
import type { BrewStageSelection } from './LiveBrewStages'
import type { ChartSeries } from './chartSeries'
import { toggleDimmedChartSeries } from './chartSeries'
import { stageFocusedChartView } from './chartFocus'
import { LiveBrewStages } from './LiveBrewStages'
import { LiveShotChart } from './LiveShotChart'
import type { ChassisParams } from '../../domain/chassis'
import { analysisOverridesForGear } from '../../domain/gear'
import { isSoakStage } from '../../domain/researchPresets'
import { analyseShot } from '../../domain/shotAnalysis'
import { shotPace } from '../../domain/shotPace'
import { recordPace } from '../insights/paceHistory'
import { activeBean, grindReferenceFor, useCoffeeLibrary } from '../beans/coffeeLibrary'
import type { ApplyAction } from '../insights/dialIn'
import { ShotDialInPanel } from '../insights/ShotDialInPanel'
import { useSmakPreferences, type LiveView } from '../settings/smakPreferences'
import { CalmLiveView } from './CalmLiveView'

interface LiveBrewingScreenProps {
  model: BrewingScreenModel
  liveBrew: LiveBrewState
  stopPending: boolean
  skipPending: boolean
  actionError: string | null
  /** Living Profile parameters when the active profile is the adaptive chassis. */
  activeChassis?: ChassisParams
  onStop: () => void
  onSkipStage: () => Promise<boolean>
  onDismiss: () => void
  onApplyAdvice?: (action: ApplyAction) => Promise<boolean>
  onAddTurbo?: () => void
}

/**
 * Pulls shorter than this (aborted starts, flushes) don't trigger the tasting
 * prompt. Tian's history had 7.7 s and 9.3 s flushes logged as shots; 15 s
 * clears them while still catching a Turbo shot.
 */
const TASTING_PROMPT_MIN_MS = 15_000
/** A pull that stopped well short of its target (choked, aborted) isn't tasted or used for the pace baseline. */
const TASTING_MIN_YIELD_SHARE = 0.6
const SWIPE_DISTANCE_PX = 60

const timedLabel = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function LiveBrewingScreen({ model, liveBrew, stopPending, skipPending, actionError, activeChassis, onStop, onSkipStage, onDismiss, onApplyAdvice, onAddTurbo }: LiveBrewingScreenProps) {
  const reasons = useMemo(() => analyseStageMoveOn(liveBrew.points, liveBrew.profileSteps, {
    active: liveBrew.active, evidence: liveBrew.stageEvidence, telemetryStartedAt: liveBrew.telemetryStartedAt, stopReason: liveBrew.stopReason,
  }), [liveBrew.points, liveBrew.profileSteps, liveBrew.active, liveBrew.stageEvidence, liveBrew.telemetryStartedAt, liveBrew.stopReason])
  const [dimmedSeries, setDimmedSeries] = useState<ChartSeries[]>([])
  const [stageSelection, setStageSelection] = useState<{ shotStartedAt: number | undefined; stage: BrewStageSelection } | null>(null)
  const { preferences } = useSmakPreferences()
  const { library, source } = useCoffeeLibrary()
  // Per-shot view choice (swipe or button); the saved preference is only the starting view.
  const [viewOverride, setViewOverride] = useState<{ startedAt: number | undefined; view: LiveView } | null>(null)
  const [promptDismissedFor, setPromptDismissedFor] = useState<number | null>(null)
  const [promptRequestedFor, setPromptRequestedFor] = useState<number | null>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const overrides = useMemo(() => analysisOverridesForGear(library.gear), [library.gear])
  const analysis = useMemo(() => liveBrew.kind === 'cleaning' ? undefined : analyseShot(liveBrew.points, overrides), [liveBrew.kind, liveBrew.points, overrides])
  const profile = model.profiles.find((candidate) => candidate.id === model.activeProfileId) ?? model.profiles[0]
  // Every finished, full-length pull feeds this profile's pace baseline (tasted or not).
  const finishedFull = (() => {
    if (liveBrew.active || liveBrew.kind === 'cleaning' || !liveBrew.points.length || !profile) return false
    const elapsed = liveBrew.points.at(-1)?.elapsedMs ?? 0
    const target = liveBrew.targetYield ?? Number(profile.targetYield)
    const final = liveShotYield(liveBrew.scaleWeight, liveBrew.points)
    return elapsed >= TASTING_PROMPT_MIN_MS && (!Number.isFinite(target) || target <= 0 || (final ?? 0) >= target * TASTING_MIN_YIELD_SHARE)
  })()
  const paceProfileId = profile?.id
  useEffect(() => {
    if (!finishedFull || !paceProfileId) return
    const reading = shotPace(liveBrew.points, analysis)
    if (reading) recordPace(source, paceProfileId, `live:${liveBrew.startedAt ?? 0}`, reading.gramsPerSecond)
  }, [finishedFull, paceProfileId, liveBrew.points, liveBrew.startedAt, analysis, source])
  if (!profile && !liveBrew.profileName) return null

  const profileName = liveBrew.profileName ? displayedShotName({ profileName: liveBrew.profileName, profileNameFallback: liveBrew.profileNameFallback }) : profile?.name ?? t('brew.liveScreen.espressoFallbackName')
  const isCleaning = liveBrew.kind === 'cleaning'
  const profileTargetYield = Number(profile?.targetYield)
  const targetYield = liveBrew.targetYield ?? (Number.isFinite(profileTargetYield) ? profileTargetYield : undefined)
  const weight = liveShotYield(liveBrew.scaleWeight, liveBrew.points)
  const flowRate = liveShotFlowRate(liveBrew.points)
  const displayPoints = weight !== undefined && liveBrew.points.length > 0
    ? liveBrew.points.map((point, index) => index === liveBrew.points.length - 1 ? { ...point, weight } : point)
    : liveBrew.points
  const chartElapsedMs = liveBrew.active
    ? liveBrew.elapsedMs
    : liveBrew.points.at(-1)?.elapsedMs ?? liveBrew.elapsedMs
  const selectedStage = !liveBrew.active && stageSelection && stageSelection.shotStartedAt === liveBrew.startedAt ? stageSelection.stage : null
  const chartView = stageFocusedChartView(displayPoints, chartElapsedMs, liveBrew.active ? null : selectedStage)
  const view = viewOverride && viewOverride.startedAt === liveBrew.startedAt ? viewOverride.view : preferences.liveView
  const calm = view === 'calm' && liveBrew.active && !isCleaning
  const shotKey = liveBrew.startedAt ?? 0
  const dialInAvailable = !liveBrew.active && !isCleaning && liveBrew.points.length > 0
  // The tasting prompt appears by itself once a real shot ends, as the brief asks.
  const shortOfTarget = targetYield !== undefined && targetYield > 0 && weight !== undefined && weight < targetYield * TASTING_MIN_YIELD_SHARE
  const autoPrompt = dialInAvailable && chartElapsedMs >= TASTING_PROMPT_MIN_MS && !shortOfTarget && promptDismissedFor !== shotKey
  const dialInOpen = dialInAvailable && (autoPrompt || promptRequestedFor === shotKey)
  // The recorded shot this pull became: local `live:` ID first, Decaid's ID once persisted.
  const previous = model.previousShot
  const previousMatchesPull = previous && (previous.id === `live:${liveBrew.startedAt}` || (previous.telemetryStartedAt !== undefined && previous.telemetryStartedAt === liveBrew.telemetryStartedAt))
  const recordedShotId = previousMatchesPull ? previous.id : undefined
  const profileDose = Number(profile?.dose)
  const profileTemperature = Number(profile?.temperature)
  const bean = activeBean(library)
  const grindSetting = grindReferenceFor(library, bean?.id, profile?.id, profile?.grindSetting)
  const lastPoint = liveBrew.points.at(-1)
  const soaking = liveBrew.active && isSoakStage(lastPoint) && (lastPoint?.pressure ?? 0) > 0.3
  const liveFinding = liveBrew.active ? analysis?.findings.at(-1) : undefined
  const setView = (next: LiveView) => setViewOverride({ startedAt: liveBrew.startedAt, view: next })
  const onTouchStart = (event: TouchEvent) => { swipeStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY } }
  const onTouchEnd = (event: TouchEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || !liveBrew.active || isCleaning) return
    const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y
    if (Math.abs(dy) < SWIPE_DISTANCE_PX || Math.abs(dy) < Math.abs(dx) * 2) return
    setView(dy < 0 ? 'chart' : 'calm')
  }
  const closePrompt = () => { setPromptDismissedFor(shotKey); setPromptRequestedFor(null) }

  return <main className="live-brew-screen" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    {actionError && <div className="system-messages"><div className="system-message system-message--error" role="alert">{actionError}</div></div>}
    <header className="live-pull-header">
      <h1>{profileName}</h1>
      <div className="live-pull-header__controls">
        <div className={`live-pull-header__metrics metric-scale--medium${isCleaning ? ' live-pull-header__metrics--single' : ' live-pull-header__metrics--live'}`} aria-live="polite">
          <div><span>{t('brew.liveScreen.timerLabel')}</span><strong>{timedLabel(liveBrew.elapsedMs)}</strong></div>
          {!isCleaning && <>
            <i aria-hidden="true" />
            <div><span>{t('brew.metric.yield')}</span><strong>{weight !== undefined ? formatDecimal(weight, 1) : '—'}<small>g</small>{targetYield !== undefined && <> <em>/</em> {formatDecimal(targetYield, Number.isInteger(targetYield) ? 0 : 1)}<small>g</small></>}</strong></div>
            <i aria-hidden="true" />
            <div><span>{t('brew.metric.flowRate')}</span><strong>{flowRate !== undefined ? formatDecimal(flowRate, 1) : '—'}<small>g/s</small></strong></div>
          </>}
        </div>
        <div className="live-pull-header__actions">
          {liveBrew.active && !isCleaning && <button className="live-pull-action live-pull-action--view" type="button" aria-label={view === 'calm' ? t('brew.liveScreen.chartViewAriaLabel') : t('brew.liveScreen.calmViewAriaLabel')} onClick={() => setView(view === 'calm' ? 'chart' : 'calm')}>{view === 'calm' ? t('brew.liveScreen.chartView') : t('brew.liveScreen.calmView')}</button>}
          {dialInAvailable && <button className="live-pull-action live-pull-action--dial" type="button" aria-label={t('insights.dialIn.openAriaLabel')} onClick={() => setPromptRequestedFor(shotKey)}>{t('insights.dialIn.open')}</button>}
          {liveBrew.active
            ? <button className="live-pull-action live-pull-action--stop" type="button" disabled={stopPending} onClick={onStop}>{stopPending ? t('brew.liveScreen.stopping') : t('brew.liveScreen.stop')}</button>
            : <button className="live-pull-action live-pull-action--close" type="button" onClick={onDismiss} aria-label={t('brew.liveScreen.closeAriaLabel')}>{t('brew.liveScreen.close')}</button>}
        </div>
      </div>
    </header>
    {calm ? <CalmLiveView weight={weight} targetYield={targetYield} elapsedMs={liveBrew.elapsedMs} stageName={lastPoint ? displayedStageName(lastPoint) : undefined} soaking={soaking} bean={bean} finding={liveFinding} ariaLabel={t('brew.liveScreen.runningAriaLabel', { name: profileName })} /> : <>
    <section className="live-pull-chart-panel" aria-label={t('brew.liveScreen.runningAriaLabel', { name: profileName })}>
      <LiveShotChart points={chartView.points} contextPoints={chartView.contextPoints} elapsedMs={chartView.elapsedMs} startMs={chartView.startMs} fitDuration={!liveBrew.active} showWeight={!isCleaning} legendFilterEnabled={!liveBrew.active} dimmedSeries={dimmedSeries} onToggleSeries={(series) => setDimmedSeries((current) => toggleDimmedChartSeries(current, series))} findings={analysis?.findings} />
    </section>
    <LiveBrewStages key={liveBrew.startedAt ?? 'pending'} reasons={reasons} points={displayPoints} elapsedMs={liveBrew.elapsedMs} active={liveBrew.active} finalYield={weight} showYield={!isCleaning} skipPending={skipPending} selectedStageKey={selectedStage?.key} onStageSelect={liveBrew.active ? undefined : (stage) => setStageSelection(stage ? { shotStartedAt: liveBrew.startedAt, stage } : null)} onSkipStage={onSkipStage} />
    </>}
    {dialInOpen && <ShotDialInPanel points={liveBrew.points} shotKey={`live:${shotKey}`} shotId={recordedShotId} profileId={profile?.id} profileName={profileName} dose={Number.isFinite(profileDose) && profileDose > 0 ? profileDose : undefined} yieldGrams={weight} grindSetting={grindSetting} temperatureC={Number.isFinite(profileTemperature) ? profileTemperature : undefined} chassis={activeChassis} onApply={onApplyAdvice} onAddTurbo={onAddTurbo} onClose={closePrompt} />}
  </main>
}
