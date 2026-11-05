import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import builderCategoryChevron from '../../assets/figma/builder-category-chevron.svg'
import builderCardClose from '../../assets/figma/builder-card-close.svg'
import builderCoffeeSource from '../../assets/figma/builder-coffee-source.svg'
import builderCoffeeSourceMuted from '../../assets/figma/builder-coffee-source-muted.svg'
import builderStageDelete from '../../assets/figma/builder-stage-delete.svg'
import builderStageDrag from '../../assets/figma/builder-stage-drag.svg'
import builderStageDuplicate from '../../assets/figma/builder-stage-duplicate.svg'
import builderStageNumber from '../../assets/figma/builder-stage-number.svg'
import builderStepPlus from '../../assets/figma/builder-step-plus.svg'
import builderTransitionFast from '../../assets/figma/builder-transition-fast.svg'
import builderTransitionFastActive from '../../assets/figma/builder-transition-fast-active.svg'
import builderTransitionSmooth from '../../assets/figma/builder-transition-smooth.svg'
import builderTransitionSmoothActive from '../../assets/figma/builder-transition-smooth-active.svg'
import builderValueChevron from '../../assets/figma/builder-value-chevron.svg'
import builderWaterSource from '../../assets/figma/builder-water-source.svg'
import builderWaterSourceActive from '../../assets/figma/builder-water-source-active.svg'
import skipNext from '../../assets/figma/skip-next.svg'
import { useValueAdjustment } from '../../components/ValueAdjustment/ValueAdjustmentContext'
import type { DecaidProfile, DecaidProfileRecord } from '../../api/decaid/types'
import type { ProfileTargetPoint } from '../../domain/brewing'
import { formatTemperatureValue, temperatureBoundToDisplay, temperatureFromDisplay, temperatureStepToDisplay, temperatureUnitLabel, type TemperatureUnit } from '../../domain/temperature'
import { VALUE_ADJUSTMENTS } from '../../domain/valueAdjustments'
import { ChartLegend } from '../brew/ChartLegend'
import { ChartStageMarkers } from '../brew/ChartStageMarkers'
import type { ChartStageMarker } from '../brew/ChartStageMarkers'
import { applyBuilderLimiterTolerance, builderPumpMemory, builderTargetPoints, createDefaultProfileDraft, duplicateBuilderStage, moveBuilderStage, nextBuilderStage, profileDraftFromDecaidProfile, profileDraftToDecaidProfile, profileMaximumDurationMs, stageIndexAfterMove, switchBuilderPump, volumeCountStartAfterDelete } from './profileBuilderModel'
import type { BuilderExitType, BuilderStage, ProfileDraft } from './profileBuilderModel'
import { nextBuilderStepperValue } from './profileBuilderStepper'
import type { BuilderStepperDirection } from './profileBuilderStepper'
import { issueSummary, validateProfileDraft } from './profileBuilderValidation'
import type { ProfileBuilderIssue } from './profileBuilderValidation'
import { useSmakPreferences } from '../settings/smakPreferences'
import { formatDecimal, plural, t } from '../../i18n/index.ts'

const CHART_WIDTH = 1090
const CHART_HEIGHT = 290
const PLOT_TOP = 58
const PLOT_BOTTOM = 282

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const formatValue = (value: number | null | undefined) => value === null || value === undefined || value <= 0 ? '-' : Number.isInteger(value) ? String(value) : formatDecimal(value, 1)
const beverageTypeLabel = (type: ProfileDraft['beverageType']) => t(`builder.beverageType.${type}`)

const pathFor = (points: ProfileTargetPoint[], key: 'pressure' | 'flow' | 'temperature', maximumDurationMs: number, minimum: number, maximum: number) => points.reduce((path, point, index) => {
  const x = point.elapsedMs / maximumDurationMs * CHART_WIDTH
  const value = point[key] ?? minimum
  const y = PLOT_BOTTOM - clamp((value - minimum) / (maximum - minimum), 0, 1) * (PLOT_BOTTOM - PLOT_TOP)
  return `${path}${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
}, '')

function BuilderChart({ draft, activeStage }: { draft: ProfileDraft; activeStage: number | null }) {
  const points = builderTargetPoints(draft.stages)
  const maximumDurationMs = Math.max(1, profileMaximumDurationMs(draft.stages))
  const stageStart = activeStage === null ? 0 : profileMaximumDurationMs(draft.stages.slice(0, activeStage))
  const stageEnd = activeStage === null ? maximumDurationMs : stageStart + profileMaximumDurationMs(draft.stages.slice(activeStage, activeStage + 1))
  const clipX = stageStart / maximumDurationMs * CHART_WIDTH
  const clipWidth = Math.max(1, (stageEnd - stageStart) / maximumDurationMs * CHART_WIDTH)
  const pressurePath = pathFor(points, 'pressure', maximumDurationMs, 0, 12)
  const flowPath = pathFor(points, 'flow', maximumDurationMs, 0, 12)
  const temperaturePath = pathFor(points, 'temperature', maximumDurationMs, 70, 100)
  const stageMarkers = draft.stages.reduce<ChartStageMarker[]>((markers, stage) => {
    const startMs = markers.at(-1)?.endMs ?? 0
    return [...markers, { key: stage.id, name: stage.name, startMs, endMs: startMs + profileMaximumDurationMs([stage]) }]
  }, [])
  const stageBoundaries = stageMarkers.slice(0, -1).map((stage) => stage.endMs)

  return <section className={`pb-chart${activeStage === null ? '' : ' is-focused'}`} aria-label={t('builder.chart.preview')}>
    <ChartLegend mode="profile" showWeight={false} className="pb-chart__legend" />
    <div className="pb-chart__axis" aria-hidden="true">
      <span>bar / ml/s</span>
      {[12, 9, 6, 3, 0].map((value) => <i key={value} style={{ top: `${(PLOT_TOP + (12 - value) / 12 * (PLOT_BOTTOM - PLOT_TOP)) / CHART_HEIGHT * 100}%` }}>{value}</i>)}
    </div>
    <ChartStageMarkers stages={stageMarkers} highlightedKey={activeStage === null ? undefined : draft.stages[activeStage]?.id} xForElapsedMs={(elapsedMs) => elapsedMs / maximumDurationMs * CHART_WIDTH} plotLeft={0} plotRight={CHART_WIDTH} />
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={t('builder.chart.svgLabel')}>
      <defs><clipPath id="pb-active-stage"><rect x={clipX} y="0" width={clipWidth} height={CHART_HEIGHT} /></clipPath></defs>
      {[12, 9, 6, 3, 0].map((value) => {
        const y = PLOT_TOP + (12 - value) / 12 * (PLOT_BOTTOM - PLOT_TOP)
        return <line key={value} className="pb-chart__tick" x1="0" x2="10" y1={y} y2={y} />
      })}
      {stageBoundaries.map((elapsedMs) => <line key={`stage-boundary-${elapsedMs}`} className="pb-chart__stage-separator" x1={elapsedMs / maximumDurationMs * CHART_WIDTH} x2={elapsedMs / maximumDurationMs * CHART_WIDTH} y1={PLOT_TOP} y2={PLOT_BOTTOM} />)}
      {activeStage !== null && <>
        <rect className="pb-chart__focus" x={clipX} y={PLOT_TOP} width={clipWidth} height={PLOT_BOTTOM - PLOT_TOP} />
      </>}
      <path className={`pb-chart__line pb-chart__line--pressure${activeStage === null ? '' : ' pb-chart__line--muted'}`} d={pressurePath} />
      <path className={`pb-chart__line pb-chart__line--flow${activeStage === null ? '' : ' pb-chart__line--muted'}`} d={flowPath} />
      <path className={`pb-chart__line pb-chart__line--temperature${activeStage === null ? '' : ' pb-chart__line--muted'}`} d={temperaturePath} />
      {activeStage !== null && <g clipPath="url(#pb-active-stage)">
          <path className="pb-chart__line pb-chart__line--pressure" d={pressurePath} />
          <path className="pb-chart__line pb-chart__line--flow" d={flowPath} />
          <path className="pb-chart__line pb-chart__line--temperature" d={temperaturePath} />
        </g>}
    </svg>
  </section>
}

function SegmentControl({ value, onChange }: { value: BuilderStage['pump']; onChange: (value: BuilderStage['pump']) => void }) {
  return <div className="pb-segmented pb-segmented--pump" role="group" aria-label={t('builder.segment.stageControl')}>
    <button type="button" className={value === 'pressure' ? 'is-selected is-pressure' : ''} onClick={() => onChange('pressure')}>{t('builder.axis.pressure')}</button>
    <button type="button" className={value === 'flow' ? 'is-selected is-flow' : ''} onClick={() => onChange('flow')}>{t('builder.axis.flow')}</button>
  </div>
}

function TransitionControl({ value, onChange }: { value: BuilderStage['transition']; onChange: (value: BuilderStage['transition']) => void }) {
  return <div className="pb-segmented pb-segmented--choice" role="group" aria-label={t('builder.transition.groupLabel')}>
    <button type="button" className={value === 'fast' ? 'is-selected' : ''} onClick={() => onChange('fast')}><img src={value === 'fast' ? builderTransitionFastActive : builderTransitionFast} alt="" />{t('builder.transition.fast')}</button>
    <button type="button" className={value === 'smooth' ? 'is-selected' : ''} onClick={() => onChange('smooth')}><img src={value === 'smooth' ? builderTransitionSmoothActive : builderTransitionSmooth} alt="" />{t('builder.transition.smooth')}</button>
  </div>
}

function SensorControl({ value, onChange }: { value: BuilderStage['sensor']; onChange: (value: BuilderStage['sensor']) => void }) {
  return <div className="pb-segmented pb-segmented--choice" role="group" aria-label={t('builder.sensor.groupLabel')}>
    <button type="button" className={value === 'coffee' ? 'is-selected' : ''} onClick={() => onChange('coffee')}><img src={value === 'coffee' ? builderCoffeeSource : builderCoffeeSourceMuted} alt="" />{t('builder.sensor.coffee')}</button>
    <button type="button" className={value === 'water' ? 'is-selected' : ''} onClick={() => onChange('water')}><img src={value === 'water' ? builderWaterSourceActive : builderWaterSource} alt="" />{t('builder.sensor.water')}</button>
  </div>
}

function Stepper({ label, value, unit, step, min = 0, max = 1000, disabled = false, onChange, onOpen }: {
  label: string
  value?: number | null
  unit: string
  step: number
  min?: number
  max?: number
  disabled?: boolean
  onChange: (value: number | undefined) => void
  onOpen?: () => void
}) {
  const enabled = !disabled && typeof value === 'number' && value > 0
  const valueRef = useRef(value)
  const holdTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const repeatTimer = useRef<ReturnType<typeof window.setInterval> | null>(null)
  const press = useRef<{ pointerId: number; held: boolean } | null>(null)
  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    if (repeatTimer.current !== null) window.clearInterval(repeatTimer.current)
  }, [])

  const change = (direction: BuilderStepperDirection, wholeUnit: boolean) => {
    const next = nextBuilderStepperValue(valueRef.current, direction, step, min, max, wholeUnit)
    valueRef.current = next
    onChange(next)
  }
  const clearPressTimers = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    if (repeatTimer.current !== null) window.clearInterval(repeatTimer.current)
    holdTimer.current = null
    repeatTimer.current = null
  }
  const beginPress = (event: ReactPointerEvent<HTMLButtonElement>, direction: BuilderStepperDirection) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    clearPressTimers()
    press.current = { pointerId: event.pointerId, held: false }
    holdTimer.current = window.setTimeout(() => {
      if (!press.current || press.current.pointerId !== event.pointerId) return
      press.current.held = true
      change(direction, true)
      repeatTimer.current = window.setInterval(() => change(direction, true), 160)
    }, 420)
  }
  const endPress = (event: ReactPointerEvent<HTMLButtonElement>, direction: BuilderStepperDirection, cancelled = false) => {
    if (!press.current || press.current.pointerId !== event.pointerId) return
    event.preventDefault()
    const held = press.current.held
    clearPressTimers()
    press.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!held && !cancelled) change(direction, false)
  }
  return <div className={`pb-stepper${disabled ? ' is-disabled' : ''}`} aria-disabled={disabled} aria-label={t('builder.stepper.valueLabel', { label, value: formatValue(value), unit })}>
    <button
      type="button"
      disabled={!enabled}
      onClick={(event) => { if (event.detail === 0) change(-1, false) }}
      onPointerDown={(event) => beginPress(event, -1)}
      onPointerUp={(event) => endPress(event, -1)}
      onPointerCancel={(event) => endPress(event, -1, true)}
      onLostPointerCapture={(event) => endPress(event, -1, true)}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={t('builder.stepper.decreaseLabel', { label })}
    ><span className="pb-stepper__glyph" aria-hidden="true">−</span></button>
    <span
      className={onOpen && !disabled ? 'pb-stepper__value is-adjustable' : 'pb-stepper__value'}
      role={onOpen && !disabled ? 'button' : undefined}
      tabIndex={onOpen && !disabled ? 0 : undefined}
      onClick={onOpen && !disabled ? (event) => { event.stopPropagation(); onOpen() } : undefined}
      onKeyDown={onOpen && !disabled ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        onOpen()
      } : undefined}
      aria-label={onOpen && !disabled ? t('builder.stepper.openFullscreenLabel', { label }) : undefined}
    ><span className="pb-stepper__reading">{formatValue(value)}{unit && <small>{unit}</small>}</span></span>
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => { if (event.detail === 0) change(1, false) }}
      onPointerDown={(event) => beginPress(event, 1)}
      onPointerUp={(event) => endPress(event, 1)}
      onPointerCancel={(event) => endPress(event, 1, true)}
      onLostPointerCapture={(event) => endPress(event, 1, true)}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={t('builder.stepper.increaseLabel', { label })}
    ><span className="pb-stepper__glyph" aria-hidden="true">+</span></button>
  </div>
}

function EditableChoice({ id, label, value, options, placeholder, onChange, inline = false }: {
  id: string
  label: string
  value?: string | null
  options: string[]
  placeholder: string
  onChange: (value: string | undefined) => void
  inline?: boolean
}) {
  const listId = `profile-builder-${id}-choices`
  const visibleLength = Math.min(Math.max((value?.trim() || placeholder).length + 0.75, 3), 30)
  return <label className={`pb-editable-choice${inline ? ' pb-editable-choice--inline' : ''}`} data-builder-field={id}>
    {!inline && <span>{label}</span>}
    <span className="pb-editable-choice__control">
      <input
        list={listId}
        value={value ?? ''}
        style={{ width: `${visibleLength}ch` }}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value.trimStart() || undefined)}
        onBlur={(event) => onChange(event.target.value.trim() || undefined)}
      />
      <img src={builderCategoryChevron} alt="" />
    </span>
    <datalist id={listId}>{options.map((option) => <option key={option} value={option} />)}</datalist>
  </label>
}

function SettingsMetric({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <div className={`pb-settings-metric${className ? ` ${className}` : ''}`}>
    <span>{label}</span>
    {children}
    {hint && <small className="pb-settings-metric__hint">{hint}</small>}
  </div>
}

function ExitControl({ type, stage, onChange }: { type: BuilderExitType; stage: BuilderStage; onChange: (patch: Partial<BuilderStage>) => void }) {
  const openAdjustment = useValueAdjustment()
  const value = stage.exit?.type === type ? stage.exit.value : undefined
  const label = type === 'flow' ? t('builder.exit.moveOnFlow') : t('builder.exit.moveOnPressure')
  const conditionLabel = type === 'flow' ? t('builder.exit.moveOnFlowConditionLabel') : t('builder.exit.moveOnPressureConditionLabel')
  const comparisonLabel = type === 'flow' ? t('builder.axis.flow') : t('builder.axis.pressure')
  const [condition, setCondition] = useState<'over' | 'under'>(() => stage.exit?.type === type ? stage.exit.condition : 'over')
  const selectedCondition = stage.exit?.type === type ? stage.exit.condition : condition
  const changeCondition = (next: 'over' | 'under') => {
    setCondition(next)
    if (stage.exit?.type === type) onChange({ exit: { ...stage.exit, condition: next } })
  }
  const definition = type === 'flow' ? VALUE_ADJUSTMENTS.builderFlow : VALUE_ADJUSTMENTS.builderPressure
  const unit = type === 'flow' ? 'ml/s' : 'bar'
  const openThresholdAdjustment = () => openAdjustment({
    label,
    value: value ?? 0,
    unit,
    ...definition,
    suggestionKey: type === 'flow' ? 'builderFlow' : 'builderPressure',
    selectedVariantId: selectedCondition,
    variants: (['over', 'under'] as const).map((variantCondition) => ({
      id: variantCondition,
      label: `${comparisonLabel} ${variantCondition === 'over' ? '>' : '<'}`,
      value: value ?? 0,
      unit,
      ...definition,
      suggestionKey: type === 'flow' ? 'builderFlow' as const : 'builderPressure' as const,
    })),
    onSave: (next, variantId) => {
      const nextCondition = variantId === 'under' ? 'under' : 'over'
      setCondition(nextCondition)
      onChange({ exit: { type, condition: nextCondition, value: next } })
    },
  })
  return <div className="pb-condition">
    <div className="pb-condition__comparison" role="group" aria-label={conditionLabel}>
      <button type="button" className={selectedCondition === 'over' ? 'is-selected' : ''} onClick={() => changeCondition('over')}>{comparisonLabel} &gt;</button>
      <button type="button" className={selectedCondition === 'under' ? 'is-selected' : ''} onClick={() => changeCondition('under')}>{comparisonLabel} &lt;</button>
    </div>
    <Stepper label={label} value={value} unit={unit} step={0.1} max={definition.max} onOpen={openThresholdAdjustment} onChange={(next) => onChange({ exit: next === undefined ? undefined : { type, condition: selectedCondition, value: next } })} />
  </div>
}

function StageDragHandle({ onPointerDown, onPointerMove, onPointerUp }: {
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  return <button
    type="button"
    className="pb-stage__drag-handle"
    aria-label={t('builder.stage.dragHandle')}
    onClick={(event) => event.stopPropagation()}
    onPointerDown={(event) => { event.stopPropagation(); onPointerDown(event) }}
    onPointerMove={(event) => { event.stopPropagation(); onPointerMove(event) }}
    onPointerUp={(event) => { event.stopPropagation(); onPointerUp(event) }}
    onPointerCancel={(event) => { event.stopPropagation(); onPointerUp(event) }}
    onLostPointerCapture={(event) => { event.stopPropagation(); onPointerUp(event) }}
  ><img src={builderStageDrag} alt="" /></button>
}

function StageEditorCard({ stage, index, active, isLastStage, limiterTolerances, temperatureUnit, onActivate, onChange, onDuplicate, onDelete, canDelete, dragging, issues, panelRequest, onDragStart, onDragMove, onDragEnd, cardRef }: {
  stage: BuilderStage
  index: number
  active: boolean
  isLastStage: boolean
  limiterTolerances: Record<BuilderExitType, number>
  temperatureUnit: TemperatureUnit
  onActivate: () => void
  onChange: (patch: Partial<BuilderStage>) => void
  onDuplicate: () => void
  onDelete: () => void
  canDelete: boolean
  dragging: boolean
  issues: ProfileBuilderIssue[]
  panelRequest?: { panel: 'target' | 'conditions'; token: number }
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onDragMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onDragEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void
  cardRef: (element: HTMLElement | null) => void
}) {
  const openAdjustment = useValueAdjustment()
  const [activePanel, setActivePanel] = useState<'target' | 'conditions'>(panelRequest?.panel ?? 'target')
  const issueSeverity = issues.some((issue) => issue.severity === 'error') ? 'error' : issues.length ? 'warning' : undefined
  const fieldSeverity = (field: string) => issues.some((issue) => issue.field === field && issue.severity === 'error')
    ? 'error'
    : issues.some((issue) => issue.field === field) ? 'warning' : undefined
  const pumpMemory = useRef(builderPumpMemory(stage))
  const setPump = (pump: BuilderStage['pump']) => {
    const switched = switchBuilderPump(stage, pump, pumpMemory.current)
    pumpMemory.current = switched.memory
    onChange(switched.patch)
  }
  const setTarget = (target: number | undefined) => {
    const value = target ?? 0
    pumpMemory.current[stage.pump] = value
    onChange({ target: value })
  }
  const setLimiter = (value: number | undefined) => {
    const limiterType = stage.pump === 'pressure' ? 'flow' : 'pressure'
    if (value !== undefined) pumpMemory.current[limiterType] = value
    onChange({ limiter: value === undefined ? undefined : { type: limiterType, value, range: stage.limiter?.range ?? limiterTolerances[limiterType] } })
  }
  const limiterLabel = stage.pump === 'pressure' ? t('builder.stage.maxFlowLabel') : t('builder.stage.maxPressureLabel')
  const limiterUnit = stage.pump === 'pressure' ? 'ml/s' : 'bar'
  const limiterValue = stage.limiter?.value
  const targetUnit = stage.pump === 'pressure' ? 'bar' : 'ml/s'
  const openTargetAdjustment = () => {
    const pressure = VALUE_ADJUSTMENTS.builderPressure
    const flow = VALUE_ADJUSTMENTS.builderFlow
    const variants = (['pressure', 'flow'] as const).map((pump) => {
      const definition = pump === 'pressure' ? pressure : flow
      return {
        id: pump,
        label: pump === 'pressure' ? t('builder.axis.pressure') : t('builder.axis.flow'),
        value: pumpMemory.current[pump] ?? (pump === 'pressure' ? 9 : 2),
        unit: pump === 'pressure' ? 'bar' : 'ml/s',
        ...definition,
        suggestionKey: pump === 'pressure' ? 'builderPressure' as const : 'builderFlow' as const,
      }
    })
    const definition = stage.pump === 'pressure' ? pressure : flow
    openAdjustment({
      label: t('builder.segment.stageControl'),
      value: stage.target,
      unit: targetUnit,
      ...definition,
      suggestionKey: stage.pump === 'pressure' ? 'builderPressure' : 'builderFlow',
      selectedVariantId: stage.pump,
      variants,
      onSave: (target, variantId) => {
        const pump = variantId === 'flow' ? 'flow' : 'pressure'
        if (pump === stage.pump) {
          setTarget(target)
          return
        }
        const switched = switchBuilderPump(stage, pump, pumpMemory.current)
        switched.memory[pump] = target
        pumpMemory.current = switched.memory
        onChange({ ...switched.patch, target })
      },
    })
  }
  const openTemperatureAdjustment = () => openAdjustment({
    label: t('common.metric.temperature'),
    value: temperatureBoundToDisplay(stage.temperature, temperatureUnit),
    unit: temperatureUnitLabel(temperatureUnit),
    ...VALUE_ADJUSTMENTS.builderTemperature,
    min: temperatureBoundToDisplay(VALUE_ADJUSTMENTS.builderTemperature.min, temperatureUnit),
    max: temperatureBoundToDisplay(VALUE_ADJUSTMENTS.builderTemperature.max, temperatureUnit),
    step: temperatureStepToDisplay(VALUE_ADJUSTMENTS.builderTemperature.step, temperatureUnit),
    presets: VALUE_ADJUSTMENTS.builderTemperature.suggestions.map((value) => temperatureBoundToDisplay(value, temperatureUnit)),
    suggestionKey: 'builderTemperature',
    onSave: (temperature) => onChange({ temperature: temperatureFromDisplay(temperature, temperatureUnit) }),
  })
  const openLimiterAdjustment = () => {
    const definition = stage.pump === 'pressure' ? VALUE_ADJUSTMENTS.builderFlow : VALUE_ADJUSTMENTS.builderPressure
    openAdjustment({
      label: limiterLabel,
      value: limiterValue ?? 0,
      unit: limiterUnit,
      ...definition,
      suggestionKey: stage.pump === 'pressure' ? 'builderFlow' : 'builderPressure',
      onSave: setLimiter,
    })
  }
  const openDurationAdjustment = () => openAdjustment({
    label: t('builder.stage.maxTimeLabel'),
    value: stage.seconds,
    unit: 's',
    ...VALUE_ADJUSTMENTS.builderDuration,
    suggestionKey: 'builderDuration',
    onSave: (seconds) => onChange({ seconds }),
  })
  const openVolumeAdjustment = () => openAdjustment({
    label: t('builder.stage.moveOnVolumeLabel'),
    value: stage.volume,
    unit: 'ml',
    ...VALUE_ADJUSTMENTS.builderVolume,
    suggestionKey: 'builderVolume',
    onSave: (volume) => onChange({ volume }),
  })
  const openYieldAdjustment = () => openAdjustment({
    label: t('builder.stage.moveOnYieldLabel'),
    value: stage.weight ?? 0,
    unit: 'g',
    ...VALUE_ADJUSTMENTS.builderYield,
    suggestionKey: 'builderYield',
    onSave: (weight) => onChange({ weight }),
  })
  const stageNumber = index + 1
  const exitSummary = [
    t('builder.stage.secondsMax', { value: formatValue(stage.seconds) }),
    stage.exit?.value
      ? `${stage.exit.type === 'pressure' ? t('builder.axis.pressure') : t('builder.axis.flow')} ${stage.exit.condition === 'under' ? '<' : '>'} ${formatValue(stage.exit.value)} ${stage.exit.type === 'pressure' ? 'bar' : 'ml/s'}`
      : null,
    !isLastStage && stage.weight ? t('builder.stage.weightAtLeast', { value: formatValue(stage.weight) }) : null,
    stage.volume ? t('builder.stage.volumeAtLeast', { value: formatValue(stage.volume) }) : null,
  ].filter((condition): condition is string => Boolean(condition)).join(' / ')

  if (!active) return <article ref={cardRef} data-stage-id={stage.id} data-validation-severity={issueSeverity} className={`pb-stage is-collapsed${dragging ? ' is-dragging' : ''}`} role="button" tabIndex={0} onClick={onActivate} onKeyDown={(event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onActivate()
  }} aria-expanded="false" aria-label={t('builder.stage.openLabel', { n: index + 1, name: stage.name })}>
    <header className="pb-stage__summary-header">
      <StageDragHandle onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} />
      <b style={{ backgroundImage: `url(${builderStageNumber})` }}>{stageNumber}</b>
      <span><strong>{stage.name}</strong></span>
      <em>{formatValue(stage.seconds)}<small>s</small></em>
    </header>
    <span className="pb-stage__summary-metrics">
      <span><small>{stage.pump === 'pressure' ? t('builder.stage.pressureTargetLabel') : t('builder.stage.flowTargetLabel')}</small><strong>{formatValue(stage.target)} <em>{targetUnit}</em></strong>{typeof limiterValue === 'number' && limiterValue > 0 && <i>{t('builder.common.max')} {formatValue(limiterValue)} {limiterUnit}</i>}</span>
      <span><small>{stage.sensor === 'water' ? t('builder.stage.waterTemperatureLabel') : t('builder.stage.coffeeTemperatureLabel')}</small><strong>{formatTemperatureValue(stage.temperature, temperatureUnit)}<em className="temperature-unit">{temperatureUnitLabel(temperatureUnit)}</em></strong></span>
    </span>
    <span className="pb-stage__summary-exit"><small>{t('builder.stage.movesOnSummary')}</small><strong>{exitSummary}</strong></span>
  </article>

  return <article ref={cardRef} data-stage-id={stage.id} data-validation-severity={issueSeverity} className={`pb-stage is-active is-${activePanel}${dragging ? ' is-dragging' : ''}`} aria-expanded="true" aria-label={t('builder.stage.activeLabel', { n: index + 1, name: stage.name })}>
    <header className="pb-stage__active-header">
      <StageDragHandle onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} />
      <b style={{ backgroundImage: `url(${builderStageNumber})` }}>{stageNumber}</b>
      <div data-builder-field="name" data-validation-severity={fieldSeverity('name')}><input aria-label={t('builder.stage.nameFieldLabel', { n: index + 1 })} value={stage.name} onChange={(event) => onChange({ name: event.target.value })} /></div>
      <div className="pb-stage__tabs" role="tablist" aria-label={t('builder.stage.tabsLabel')}>
        <button type="button" role="tab" aria-selected={activePanel === 'target'} className={activePanel === 'target' ? 'is-selected' : ''} onClick={() => setActivePanel('target')}>{t('common.metric.target')}</button>
        <button type="button" role="tab" aria-selected={activePanel === 'conditions'} className={activePanel === 'conditions' ? 'is-selected' : ''} onClick={() => setActivePanel('conditions')}>{t('builder.stage.moveOnTab')}</button>
      </div>
      <div className="pb-stage__actions">
        <button type="button" onClick={onDuplicate} aria-label={t('builder.stage.duplicateLabel', { n: index + 1 })}><img src={builderStageDuplicate} alt="" /></button>
        <button type="button" disabled={!canDelete} onClick={onDelete} aria-label={t('builder.stage.deleteLabel', { n: index + 1 })}><img src={builderStageDelete} alt="" /></button>
      </div>
    </header>
    {activePanel === 'target' ? <section className="pb-stage__target-panel" role="tabpanel" aria-label={t('builder.stage.targetPanelLabel')}>
      <div className="pb-stage__target-main">
        <div className="pb-stage__target-control" data-builder-field="target" data-validation-severity={fieldSeverity('target') ?? fieldSeverity('pump')}>
          <SegmentControl value={stage.pump} onChange={setPump} />
          <Stepper label={stage.pump === 'pressure' ? t('builder.stage.pressureTargetAriaLabel') : t('builder.stage.flowTargetAriaLabel')} value={stage.target} unit={targetUnit} step={0.1} max={15.9} onOpen={openTargetAdjustment} onChange={setTarget} />
        </div>
        <div className="pb-stage__temperature-control" data-builder-field="temperature" data-validation-severity={fieldSeverity('temperature')}><small>{t('common.metric.temperature')}</small><Stepper label={t('common.metric.temperature')} value={temperatureBoundToDisplay(stage.temperature, temperatureUnit)} unit={temperatureUnitLabel(temperatureUnit)} step={temperatureStepToDisplay(0.5, temperatureUnit)} min={temperatureBoundToDisplay(0, temperatureUnit)} max={temperatureBoundToDisplay(127.5, temperatureUnit)} onOpen={openTemperatureAdjustment} onChange={(temperature) => onChange({ temperature: temperature === undefined ? 0 : temperatureFromDisplay(temperature, temperatureUnit) })} /></div>
        <div className="pb-stage__choice-control" data-builder-field="transition" data-validation-severity={fieldSeverity('transition')}><small>{t('builder.stage.transitionLabel')}</small><TransitionControl value={stage.transition} onChange={(transition) => onChange({ transition })} /></div>
        <div className="pb-stage__choice-control" data-builder-field="sensor" data-validation-severity={fieldSeverity('sensor')}><small>{t('builder.stage.measureFromLabel')}</small><SensorControl value={stage.sensor} onChange={(sensor) => onChange({ sensor })} /></div>
      </div>
      <aside className="pb-stage__limits">
        <div data-builder-field="limiter" data-validation-severity={fieldSeverity('limiter')}><small>{limiterLabel}</small><Stepper label={limiterLabel} value={limiterValue} unit={limiterUnit} step={0.1} max={15.9} onOpen={openLimiterAdjustment} onChange={setLimiter} /></div>
        <div data-builder-field="seconds" data-validation-severity={fieldSeverity('seconds')}><small>{t('builder.stage.maxTimeLabel')}</small><Stepper label={t('common.metric.duration')} value={stage.seconds} unit="s" step={1} min={0} max={127} onOpen={openDurationAdjustment} onChange={(seconds) => onChange({ seconds: seconds ?? 0 })} /></div>
      </aside>
    </section> : <section className="pb-stage__conditions-panel" role="tabpanel" aria-label={t('builder.stage.conditionsPanelLabel')}>
      <div className="pb-stage__conditions-controls">
        <div className="pb-condition-column" data-builder-field="exit" data-validation-severity={fieldSeverity('exit')}>
          <ExitControl type="flow" stage={stage} onChange={onChange} />
          <ExitControl type="pressure" stage={stage} onChange={onChange} />
        </div>
        <div className="pb-condition-column">
          <div className="pb-condition pb-condition--simple" data-builder-field="volume" data-validation-severity={fieldSeverity('volume')}>
            <small>{t('builder.stage.moveOnVolumeLabel')}</small>
            <Stepper label={t('builder.stage.moveOnVolumeLabel')} value={stage.volume > 0 ? stage.volume : undefined} unit="ml" step={1} max={1023} onOpen={openVolumeAdjustment} onChange={(volume) => onChange({ volume: volume ?? 0 })} />
          </div>
          <div className={`pb-condition pb-condition--simple${isLastStage ? ' is-disabled' : ''}`} data-builder-field="weight" data-validation-severity={fieldSeverity('weight')}>
            <small>{t('builder.stage.moveOnYieldLabel')}</small>
            <Stepper label={t('builder.stage.moveOnYieldLabel')} value={stage.weight} unit="g" step={0.1} disabled={isLastStage} onOpen={openYieldAdjustment} onChange={(weight) => onChange({ weight })} />
          </div>
        </div>
      </div>
      <p className="pb-stage__conditions-rule"><img src={skipNext} alt="" /><span>{t('builder.stage.conditionsHint')}</span></p>
    </section>}
  </article>
}

interface ProfileBuilderScreenProps {
  onClose: () => void
  initialRecord?: DecaidProfileRecord
  existingTitles?: string[]
  knownCategories?: string[]
  knownVersions?: string[]
  onSave?: (profile: DecaidProfile, sourceProfileId: string | undefined, overwriteSource: boolean, metadata?: Record<string, unknown> | null) => Promise<DecaidProfileRecord | null>
  onSaved?: (record: DecaidProfileRecord) => void
}

interface StageDragSession {
  pointerId: number
  stageId: string
  index: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  offsetX: number
  offsetY: number
  moved: boolean
  overlay: HTMLElement
  animationFrame: number | null
  cleanupTimer: number | null
  transitionEndHandler?: (event: TransitionEvent) => void
  ending: boolean
}

export function ProfileBuilderScreen({ onClose, initialRecord, existingTitles = [], knownCategories = [], knownVersions = [], onSave, onSaved }: ProfileBuilderScreenProps) {
  const { preferences } = useSmakPreferences()
  const openAdjustment = useValueAdjustment()
  const overwriteSource = initialRecord?.isDefault === false
  const [initialDraft] = useState(() => initialRecord?.profile?.steps?.length
    ? profileDraftFromDecaidProfile(initialRecord.profile, { mode: initialRecord.id ? 'edit' : 'import', sourceProfileId: initialRecord.id, sourceMetadata: initialRecord.metadata, existingTitles, copyName: Boolean(initialRecord.id) && !overwriteSource })
    : createDefaultProfileDraft())
  const [draft, setDraft] = useState(initialDraft)
  const [activeStage, setActiveStage] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [profileDetailsOpen, setProfileDetailsOpen] = useState(false)
  const [validationOpen, setValidationOpen] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [stagePanelRequest, setStagePanelRequest] = useState<{ stageId: string; panel: 'target' | 'conditions'; token: number } | null>(null)
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null)
  const stageStripRef = useRef<HTMLElement>(null)
  const stageCards = useRef(new Map<number, HTMLElement>())
  const stageDrag = useRef<StageDragSession | null>(null)
  const pendingStageDrop = useRef<StageDragSession | null>(null)
  const stagePanelRequestSequence = useRef(0)
  const categoryOptions = useMemo(() => Array.from(new Set([
    ...knownCategories,
    'Espresso',
    'Filter',
    'Pour over',
    'Tea',
    'Cleaning',
  ].map((value) => value.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right)), [knownCategories])
  const versionOptions = useMemo(() => Array.from(new Set([
    ...knownVersions,
    '2.1',
    '2.0',
    '1.0',
  ].map((value) => value.trim()).filter(Boolean))).sort((left, right) => right.localeCompare(left, undefined, { numeric: true })), [knownVersions])
  const validation = useMemo(() => validateProfileDraft(draft), [draft])
  const volumeFallbackActive = typeof draft.targetVolume === 'number' && draft.targetVolume > 0
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(initialDraft)
  const saveDisabled = saving || !validation.canSave || Boolean(initialRecord?.id) && !hasUnsavedChanges
  const profileFieldSeverity = (field: string) => validation.issues.some((issue) => !issue.stageId && issue.field === field && issue.severity === 'error')
    ? 'error'
    : validation.issues.some((issue) => !issue.stageId && issue.field === field) ? 'warning' : undefined

  const removeStageDragArtifacts = (drag: StageDragSession, updateSelection = true) => {
    if (drag.animationFrame !== null) cancelAnimationFrame(drag.animationFrame)
    drag.animationFrame = null
    if (drag.cleanupTimer !== null) window.clearTimeout(drag.cleanupTimer)
    drag.cleanupTimer = null
    if (drag.transitionEndHandler) drag.overlay.removeEventListener('transitionend', drag.transitionEndHandler)
    drag.transitionEndHandler = undefined
    drag.overlay.remove()
    if (stageDrag.current === drag) stageDrag.current = null
    if (pendingStageDrop.current === drag) pendingStageDrop.current = null
    if (!stageDrag.current && !pendingStageDrop.current) document.body.classList.remove('pb-is-stage-dragging')
    if (updateSelection) setDraggedStageId((current) => current === drag.stageId ? null : current)
  }
  const cancelStageDrag = (updateSelection = true) => {
    const active = stageDrag.current
    const pending = pendingStageDrop.current
    if (active) removeStageDragArtifacts(active, updateSelection)
    if (pending && pending !== active) removeStageDragArtifacts(pending, updateSelection)
  }

  useEffect(() => () => {
    cancelStageDrag(false)
    document.body.classList.remove('pb-is-stage-dragging')
  }, [])

  useEffect(() => {
    if (activeStage === null || draggedStageId) return
    const strip = stageStripRef.current
    const card = stageCards.current.get(activeStage)
    if (!strip || !card) return
    const alignActiveCard = () => {
      const inset = 24
      const cardLeft = card.offsetLeft
      const cardRight = cardLeft + card.offsetWidth
      const lastStage = draft.stages.length - 1
      const target = activeStage === 0
        ? cardLeft - inset
        : activeStage === lastStage
          ? cardRight - strip.clientWidth + inset
          : cardLeft + card.offsetWidth / 2 - strip.clientWidth / 2
      const maxScroll = Math.max(0, strip.scrollWidth - strip.clientWidth)
      strip.scrollTo({ left: clamp(target, 0, maxScroll), behavior: 'smooth' })
    }
    const animationFrame = requestAnimationFrame(alignActiveCard)
    const transitionFallback = window.setTimeout(alignActiveCard, 460)
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target === card && (event.propertyName === 'width' || event.propertyName === 'flex-basis')) alignActiveCard()
    }
    card.addEventListener('transitionend', handleTransitionEnd)
    window.addEventListener('resize', alignActiveCard)
    return () => {
      cancelAnimationFrame(animationFrame)
      window.clearTimeout(transitionFallback)
      card.removeEventListener('transitionend', handleTransitionEnd)
      window.removeEventListener('resize', alignActiveCard)
    }
  }, [activeStage, draft.stages.length, draggedStageId])

  const updateDraft = <Key extends keyof ProfileDraft>(key: Key, value: ProfileDraft[Key]) => setDraft((current) => ({
    ...current,
    [key]: value,
    importIssues: current.importIssues?.filter((issue) => issue.stageId || issue.field !== key),
  }))
  const updateStage = (index: number, patch: Partial<BuilderStage>) => setDraft((current) => {
    const stageId = current.stages[index]?.id
    const changedFields = new Set(Object.keys(patch))
    if (changedFields.has('pump')) changedFields.add('target')
    return {
      ...current,
      stages: current.stages.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage),
      importIssues: current.importIssues?.filter((issue) => issue.stageId !== stageId || !changedFields.has(issue.field)),
    }
  })
  const addStage = () => {
    const index = draft.stages.length
    updateDraft('stages', [...draft.stages, nextBuilderStage(index)])
    setActiveStage(index)
  }
  const duplicateStage = (index: number) => {
    setDraft((current) => {
      const stages = [...current.stages]
      stages.splice(index + 1, 0, duplicateBuilderStage(stages[index], index + 1))
      const targetVolumeCountStart = current.targetVolumeCountStart > index
        ? current.targetVolumeCountStart + 1
        : current.targetVolumeCountStart
      return { ...current, stages, targetVolumeCountStart }
    })
    setActiveStage(index + 1)
  }
  const deleteStage = (index: number) => {
    if (draft.stages.length <= 1) return
    setDraft((current) => {
      const removedStage = current.stages[index]
      const stages = current.stages.filter((_, stageIndex) => stageIndex !== index)
      const volumeFallbackActive = typeof current.targetVolume === 'number' && current.targetVolume > 0
      const targetVolumeCountStart = volumeCountStartAfterDelete(current.targetVolumeCountStart, index, stages.length, volumeFallbackActive)
      return {
        ...current,
        stages,
        targetVolumeCountStart,
        importIssues: current.importIssues?.filter((issue) => issue.stageId !== removedStage?.id),
      }
    })
    setActiveStage((current) => {
      if (current === null) return null
      if (current === index) return Math.min(index, draft.stages.length - 2)
      return current > index ? current - 1 : current
    })
  }
  const stageCardElements = () => Array.from(stageStripRef.current?.querySelectorAll<HTMLElement>('.pb-stage[data-stage-id]') ?? [])
  const stageCardById = (stageId: string) => stageCardElements().find((card) => card.dataset.stageId === stageId)
  const stageCardRects = () => new Map(stageCardElements().map((card) => [card.dataset.stageId ?? '', card.getBoundingClientRect()]))
  const animateReorderedStageCards = (before: Map<string, DOMRect>) => {
    requestAnimationFrame(() => {
      stageCardElements().forEach((card) => {
        if (card.dataset.stageId === stageDrag.current?.stageId) return
        const previous = before.get(card.dataset.stageId ?? '')
        if (!previous) return
        const current = card.getBoundingClientRect()
        const deltaX = previous.left - current.left
        if (Math.abs(deltaX) < 1) return
        card.animate([
          { transform: `translate3d(${deltaX}px, 0, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' })
      })
    })
  }
  const positionStageDragOverlay = (drag: StageDragSession) => {
    const strip = stageStripRef.current
    const x = drag.lastX - drag.offsetX
    const desiredY = drag.lastY - drag.offsetY
    const overlayHeight = drag.overlay.offsetHeight
    const scaleInset = overlayHeight * 0.0125
    const stripBounds = strip?.getBoundingClientRect()
    const minimumY = stripBounds ? stripBounds.top + scaleInset : desiredY
    const maximumY = stripBounds ? Math.max(minimumY, stripBounds.bottom - overlayHeight - scaleInset) : desiredY
    const y = clamp(desiredY, minimumY, maximumY)
    drag.overlay.style.setProperty('--pb-stage-drag-x', `${x}px`)
    drag.overlay.style.setProperty('--pb-stage-drag-y', `${y}px`)
  }
  const reorderStageAtPointer = (clientX: number) => {
    const drag = stageDrag.current
    const strip = stageStripRef.current
    if (!drag || !strip || !drag.moved) return
    const cards = stageCardElements()
    const otherCards = cards.filter((card) => card.dataset.stageId !== drag.stageId)
    let toIndex = otherCards.length
    for (let index = 0; index < otherCards.length; index += 1) {
      const bounds = otherCards[index].getBoundingClientRect()
      if (clientX < bounds.left + bounds.width / 2) {
        toIndex = index
        break
      }
    }
    toIndex = clamp(toIndex, 0, cards.length - 1)
    if (toIndex === drag.index) return
    const before = stageCardRects()
    const fromIndex = drag.index
    drag.index = toIndex
    const stageNumber = drag.overlay.querySelector<HTMLElement>('.pb-stage__summary-header>b, .pb-stage__active-header>b')
    if (stageNumber) stageNumber.textContent = String(toIndex + 1)
    setDraft((current) => {
      const referencedStage = current.stages[current.targetVolumeCountStart]
      const stages = moveBuilderStage(current.stages, fromIndex, toIndex)
      const remappedReference = referencedStage ? stages.findIndex((stage) => stage.id === referencedStage.id) : current.targetVolumeCountStart
      return { ...current, stages, targetVolumeCountStart: remappedReference }
    })
    setActiveStage((current) => stageIndexAfterMove(current, fromIndex, toIndex))
    animateReorderedStageCards(before)
  }
  const runStageDragFrame = () => {
    const drag = stageDrag.current
    const strip = stageStripRef.current
    if (!drag || !strip) return
    positionStageDragOverlay(drag)
    const bounds = strip.getBoundingClientRect()
    const edgeSize = 72
    let scrollAmount = 0
    if (drag.lastX < bounds.left + edgeSize) scrollAmount = -Math.ceil((bounds.left + edgeSize - drag.lastX) / 5)
    else if (drag.lastX > bounds.right - edgeSize) scrollAmount = Math.ceil((drag.lastX - (bounds.right - edgeSize)) / 5)
    if (scrollAmount !== 0) {
      const previousScrollLeft = strip.scrollLeft
      strip.scrollLeft += clamp(scrollAmount, -18, 18)
      if (strip.scrollLeft !== previousScrollLeft) reorderStageAtPointer(drag.lastX)
    }
    drag.animationFrame = requestAnimationFrame(runStageDragFrame)
  }
  const startStageDrag = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    cancelStageDrag()
    const stageId = draft.stages[index]?.id
    const card = event.currentTarget.closest<HTMLElement>('.pb-stage')
    if (!stageId || !card) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const bounds = card.getBoundingClientRect()
    const overlay = card.cloneNode(true) as HTMLElement
    overlay.classList.remove('is-dragging')
    overlay.classList.add('pb-stage-drag-overlay')
    overlay.removeAttribute('data-stage-id')
    overlay.setAttribute('aria-hidden', 'true')
    overlay.querySelectorAll<HTMLElement>('button,input').forEach((control) => control.setAttribute('tabindex', '-1'))
    const sourceInputs = card.querySelectorAll<HTMLInputElement>('input')
    overlay.querySelectorAll<HTMLInputElement>('input').forEach((input, inputIndex) => { input.value = sourceInputs[inputIndex]?.value ?? input.value })
    overlay.style.width = `${bounds.width}px`
    overlay.style.height = `${bounds.height}px`
    document.body.append(overlay)
    document.body.classList.add('pb-is-stage-dragging')
    stageDrag.current = {
      pointerId: event.pointerId,
      stageId,
      index,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      moved: false,
      overlay,
      animationFrame: null,
      cleanupTimer: null,
      ending: false,
    }
    positionStageDragOverlay(stageDrag.current)
    stageDrag.current.animationFrame = requestAnimationFrame(runStageDragFrame)
    setDraggedStageId(stageId)
  }
  const moveStageDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = stageDrag.current
    const strip = stageStripRef.current
    if (!drag || drag.pointerId !== event.pointerId || !strip) return
    event.preventDefault()
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return
    drag.moved = true
    drag.overlay.classList.add('has-moved')
    reorderStageAtPointer(event.clientX)
  }
  const finishStageDrag = (pointerId: number, captureTarget?: HTMLElement) => {
    const drag = stageDrag.current
    if (!drag || drag.pointerId !== pointerId || drag.ending) return
    drag.ending = true
    stageDrag.current = null
    if (captureTarget?.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId)
    if (drag.animationFrame !== null) cancelAnimationFrame(drag.animationFrame)
    drag.animationFrame = null
    const destination = stageCardById(drag.stageId)?.getBoundingClientRect()
    const removeOverlay = () => removeStageDragArtifacts(drag)
    if (!destination) {
      removeOverlay()
      return
    }
    pendingStageDrop.current = drag
    drag.overlay.classList.add('is-dropping')
    drag.overlay.style.setProperty('--pb-stage-drag-x', `${destination.left}px`)
    drag.overlay.style.setProperty('--pb-stage-drag-y', `${destination.top}px`)
    drag.transitionEndHandler = (transitionEvent) => {
      if (transitionEvent.target !== drag.overlay || transitionEvent.propertyName !== 'transform') return
      removeOverlay()
    }
    drag.overlay.addEventListener('transitionend', drag.transitionEndHandler)
    drag.cleanupTimer = window.setTimeout(removeOverlay, 280)
  }
  const endStageDrag = (event: ReactPointerEvent<HTMLButtonElement>) => finishStageDrag(event.pointerId, event.currentTarget)

  useEffect(() => {
    const finishPointerDrag = (event: PointerEvent) => finishStageDrag(event.pointerId)
    const cancelInterruptedDrag = () => cancelStageDrag()
    const handleVisibilityChange = () => { if (document.hidden) cancelInterruptedDrag() }
    window.addEventListener('pointerup', finishPointerDrag, true)
    window.addEventListener('pointercancel', finishPointerDrag, true)
    window.addEventListener('blur', cancelInterruptedDrag)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pointerup', finishPointerDrag, true)
      window.removeEventListener('pointercancel', finishPointerDrag, true)
      window.removeEventListener('blur', cancelInterruptedDrag)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])
  const cycleType = () => {
    const types: ProfileDraft['beverageType'][] = ['espresso', 'pourover', 'manual', 'cleaning', 'calibrate']
    const index = types.indexOf(draft.beverageType)
    updateDraft('beverageType', types[(index + 1) % types.length])
  }
  const editTargetYield = () => openAdjustment({
    label: t('builder.profile.endShotYield'),
    value: draft.targetWeight ?? 0,
    unit: 'g',
    ...VALUE_ADJUSTMENTS.targetYield,
    suggestionKey: 'targetYield',
    onSave: (targetWeight) => updateDraft('targetWeight', targetWeight > 0 ? targetWeight : undefined),
  })
  const limiterTolerance = (type: BuilderExitType) => draft.limiterTolerances[type]
  const updateLimiterTolerance = (type: BuilderExitType, range: number | undefined) => setDraft((current) => ({
    ...current,
    limiterTolerances: { ...current.limiterTolerances, [type]: range ?? 0 },
    stages: applyBuilderLimiterTolerance(current.stages, type, range ?? 0),
    importIssues: current.importIssues?.filter((issue) => issue.field !== 'limiter'),
  }))
  const openProfileMetric = ({ label, value, unit, definition, suggestionKey, onSave: save }: {
    label: string
    value: number
    unit: string
    definition: typeof VALUE_ADJUSTMENTS.builderFlow | typeof VALUE_ADJUSTMENTS.builderPressure | typeof VALUE_ADJUSTMENTS.builderTemperature | typeof VALUE_ADJUSTMENTS.builderVolume
    suggestionKey: 'builderFlow' | 'builderPressure' | 'builderTemperature' | 'builderVolume'
    onSave: (value: number) => void
  }) => openAdjustment({ label, value, unit, ...definition, suggestionKey, onSave: save })
  const saveProfile = async (allowWarnings = false) => {
    if (!onSave || saving || Boolean(initialRecord?.id) && !hasUnsavedChanges) return
    if (!validation.canSave) {
      setValidationOpen(true)
      return
    }
    if (validation.warnings.length && !allowWarnings) {
      setValidationOpen(true)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await onSave(profileDraftToDecaidProfile(draft), draft.sourceProfileId, overwriteSource, draft.sourceMetadata)
      if (saved) {
        if (onSaved) onSaved(saved)
        else onClose()
      }
      else setSaveError(t('builder.profile.saveFailed'))
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : t('builder.profile.saveFailed'))
    } finally {
      setSaving(false)
    }
  }
  const requestClose = () => {
    if (saving) return
    if (hasUnsavedChanges) {
      setDiscardConfirmOpen(true)
      return
    }
    onClose()
  }

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const preserveUnsavedDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preserveUnsavedDraft)
    return () => window.removeEventListener('beforeunload', preserveUnsavedDraft)
  }, [hasUnsavedChanges])

  const reviewIssue = (issue: ProfileBuilderIssue) => {
    setValidationOpen(false)
    setSaveError(null)
    if (!issue.stageId) {
      setActiveStage(null)
      setProfileDetailsOpen(true)
      requestAnimationFrame(() => {
        const selector = issue.field === 'title'
          ? '.pb-topbar__identity input'
          : `[data-builder-field="${issue.field}"] input, [data-builder-field="${issue.field}"] select, [data-builder-field="${issue.field}"] textarea, [data-builder-field="${issue.field}"] button`
        document.querySelector<HTMLElement>(selector)?.focus()
      })
      return
    }
    const stageIndex = draft.stages.findIndex((stage) => stage.id === issue.stageId)
    if (stageIndex < 0) return
    setProfileDetailsOpen(false)
    setActiveStage(stageIndex)
    stagePanelRequestSequence.current += 1
    setStagePanelRequest({ stageId: issue.stageId, panel: issue.panel === 'conditions' ? 'conditions' : 'target', token: stagePanelRequestSequence.current })
    window.setTimeout(() => {
      const card = document.querySelector<HTMLElement>(`.pb-stage[data-stage-id="${issue.stageId}"]`)
      const selectorField = issue.field === 'pump' ? 'target' : issue.field
      const field = card?.querySelector<HTMLElement>(`[data-builder-field="${selectorField}"]`)
      const control = field?.matches('input,button,select,textarea') ? field : field?.querySelector<HTMLElement>('input,button,select,textarea')
      control?.focus()
    }, 480)
  }
  const toggleStage = (index: number) => setActiveStage((current) => current === index ? null : index)
  const dismissActiveStageFromOutside = (event: ReactPointerEvent<HTMLElement>) => {
    if (activeStage === null || draggedStageId) return
    const target = event.target
    if (target instanceof Element && target.closest('.pb-stage')) return
    setActiveStage(null)
  }

  return <main className={`profile-builder-screen pb-screen${activeStage === null ? '' : ' has-active-stage'}${saving ? ' is-saving' : ''}`} aria-busy={saving} onPointerDownCapture={dismissActiveStageFromOutside}>
    {profileDetailsOpen && <button type="button" className="pb-profile-details-backdrop" aria-label={t('builder.profile.closeMoreSettings')} onClick={() => setProfileDetailsOpen(false)} />}
    <header className={`pb-topbar${profileDetailsOpen ? ' is-expanded' : ''}`}>
      <div className="pb-topbar__identity">
        <input aria-label={t('builder.profile.nameLabel')} data-builder-field="title" data-validation-severity={profileFieldSeverity('title')} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
        <div className="pb-topbar__identity-actions">
          {profileDetailsOpen
            ? <EditableChoice id="category" label={t('builder.profile.categoryLabel')} value={draft.category} options={categoryOptions} placeholder={t('builder.profile.categoryPlaceholder')} inline onChange={(category) => updateDraft('category', category)} />
            : <span className="pb-category-summary">{draft.category ?? t('builder.profile.uncategorized')}</span>}
          <button
            type="button"
            className={`pb-more-settings${profileDetailsOpen ? ' is-open' : ''}`}
            aria-expanded={profileDetailsOpen}
            aria-controls="profile-builder-details"
            onClick={() => {
              setActiveStage(null)
              setValidationOpen(false)
              setProfileDetailsOpen((current) => !current)
            }}
          ><span>{profileDetailsOpen ? t('builder.profile.lessSettings') : t('builder.profile.moreSettings')}</span><img src={builderCategoryChevron} alt="" /></button>
        </div>
      </div>
      <div className="pb-topbar__metadata">
        <button type="button" className="pb-meta" onClick={cycleType}><span>{t('builder.profile.typeLabel')} <img src={builderValueChevron} alt="" /></span><strong>{beverageTypeLabel(draft.beverageType)}</strong></button>
        <button type="button" className="pb-meta" onClick={editTargetYield}><span>{t('builder.profile.endShotYield')} <img src={builderValueChevron} alt="" /></span><strong>{formatValue(draft.targetWeight)} <small>g</small></strong></button>
      </div>
      <div className="pb-topbar__actions">
        <button className="pb-cancel" type="button" onClick={requestClose}>{t('builder.actions.cancel')}</button>
        <button className="pb-save" type="button" disabled={saveDisabled} onClick={() => void saveProfile()}>{saving ? t('builder.actions.saving') : t('builder.actions.save')}</button>
        {validation.issues.length > 0 && <button
          className={`pb-validation-indicator${validation.errors.length ? ' has-errors' : ' has-warnings'}`}
          type="button"
          aria-label={plural('builder.validation.issueCount', validation.issues.length)}
          aria-expanded={validationOpen}
          aria-controls="profile-builder-validation"
          onClick={() => {
            setProfileDetailsOpen(false)
            setValidationOpen((current) => !current)
          }}
        ><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3.2 22 20.6H2L12 3.2Z"/><path d="M12 8.3v6.2M12 17.9v.2"/></svg><span>{validation.issues.length}</span></button>}
      </div>
      {saveError && <p className="pb-save-error" role="alert">{saveError}</p>}
      {validationOpen && validation.issues.length > 0 && <section id="profile-builder-validation" className="pb-validation-panel" aria-label={t('builder.validation.panelLabel')}>
        <header>
          <div><h2>{validation.errors.length ? t('builder.validation.needsAttention') : t('builder.validation.reviewBeforeSaving')}</h2><p>{issueSummary(validation)}</p></div>
          <button type="button" onClick={() => setValidationOpen(false)} aria-label={t('builder.validation.closeLabel')}><img src={builderCardClose} alt="" /></button>
        </header>
        {validation.issues.length ? <div className="pb-validation-panel__issues">{validation.issues.map((issue) => <button type="button" key={issue.id} className={`is-${issue.severity}`} onClick={() => reviewIssue(issue)}>
          <i aria-hidden="true">{issue.severity === 'error' ? '!' : 'i'}</i>
          <span><strong>{issue.stageIndex === undefined || issue.stageIndex < 0 ? t('builder.validation.profileLabel') : t('builder.stage.numberLabel', { n: issue.stageIndex + 1 })}</strong><small>{issue.message}</small></span>
          <em aria-hidden="true">›</em>
        </button>)}</div> : <p className="pb-validation-panel__ready">{t('builder.validation.allValid')}</p>}
        {!validation.errors.length && validation.warnings.length > 0 && <footer><button type="button" disabled={saveDisabled} onClick={() => void saveProfile(true)}>{t('builder.actions.saveAnyway')}</button></footer>}
      </section>}
      {profileDetailsOpen && <section id="profile-builder-details" className="pb-profile-details" aria-label={t('builder.details.panelLabel')}>
        <div className="pb-profile-details__body">
          <div className="pb-profile-details__controls">
            <EditableChoice id="version" label={t('builder.details.versionLabel')} value={draft.version} options={versionOptions} placeholder={t('builder.details.versionPlaceholder')} onChange={(version) => updateDraft('version', version)} />
            <SettingsMetric label={t('builder.details.endShotVolumeLabel')} className="pb-settings-metric--volume">
              <Stepper label={t('builder.details.endShotVolumeFallbackLabel')} value={draft.targetVolume} unit="ml" step={1} max={1023} onOpen={() => openProfileMetric({ label: t('builder.details.endShotVolumeFallbackLabel'), value: draft.targetVolume ?? 0, unit: 'ml', definition: VALUE_ADJUSTMENTS.builderVolume, suggestionKey: 'builderVolume', onSave: (targetVolume) => updateDraft('targetVolume', targetVolume > 0 ? targetVolume : undefined) })} onChange={(targetVolume) => updateDraft('targetVolume', targetVolume)} />
            </SettingsMetric>
            <SettingsMetric label={t('builder.details.flowToleranceLabel')} hint={t('builder.details.limiterRangeHint')} className="pb-settings-metric--flow">
              <Stepper label={t('builder.details.flowToleranceLabel')} value={limiterTolerance('flow')} unit="ml/s" step={0.1} max={VALUE_ADJUSTMENTS.builderFlow.max} onOpen={() => openProfileMetric({ label: t('builder.details.flowToleranceLabel'), value: limiterTolerance('flow'), unit: 'ml/s', definition: VALUE_ADJUSTMENTS.builderFlow, suggestionKey: 'builderFlow', onSave: (range) => updateLimiterTolerance('flow', range) })} onChange={(range) => updateLimiterTolerance('flow', range)} />
            </SettingsMetric>
            <SettingsMetric label={t('builder.details.pressureToleranceLabel')} hint={t('builder.details.limiterRangeHint')} className="pb-settings-metric--pressure">
              <Stepper label={t('builder.details.pressureToleranceLabel')} value={limiterTolerance('pressure')} unit="bar" step={0.1} max={VALUE_ADJUSTMENTS.builderPressure.max} onOpen={() => openProfileMetric({ label: t('builder.details.pressureToleranceLabel'), value: limiterTolerance('pressure'), unit: 'bar', definition: VALUE_ADJUSTMENTS.builderPressure, suggestionKey: 'builderPressure', onSave: (range) => updateLimiterTolerance('pressure', range) })} onChange={(range) => updateLimiterTolerance('pressure', range)} />
            </SettingsMetric>
            {volumeFallbackActive && <label className="pb-profile-details__measure-from" data-builder-field="targetVolumeCountStart" data-validation-severity={profileFieldSeverity('targetVolumeCountStart')}>
              <span>{t('builder.details.volumeStartLabel')}</span>
              <select value={draft.targetVolumeCountStart >= 0 && draft.targetVolumeCountStart < draft.stages.length ? draft.targetVolumeCountStart : ''} onChange={(event) => updateDraft('targetVolumeCountStart', Number(event.target.value))}>
                <option value="" disabled>{t('builder.details.chooseStage')}</option>
                {draft.stages.map((stage, index) => <option key={stage.id} value={index}>{index + 1}. {stage.name.trim() || t('builder.stage.numberLabel', { n: index + 1 })}</option>)}
              </select>
            </label>}
          </div>
          <div className="pb-profile-details__copy">
            <label className="pb-profile-details__author" data-builder-field="author" data-validation-severity={profileFieldSeverity('author')}>
              <span>{t('builder.details.authorLabel')}</span>
              <input value={draft.author} placeholder={t('builder.details.authorPlaceholder')} readOnly aria-describedby="profile-builder-author-help" />
              <small id="profile-builder-author-help">{t('builder.details.authorHint')}</small>
            </label>
            <label className="pb-profile-details__notes" data-builder-field="notes" data-validation-severity={profileFieldSeverity('notes')}>
              <span>{t('builder.details.descriptionLabel')}</span>
              <textarea value={draft.notes} placeholder={t('builder.details.descriptionPlaceholder')} onChange={(event) => updateDraft('notes', event.target.value)} />
            </label>
          </div>
        </div>
      </section>}
    </header>
    <BuilderChart draft={draft} activeStage={activeStage} />
    <section ref={stageStripRef} className="pb-stage-strip" aria-label={t('builder.stage.stripLabel')}>
      {draft.stages.map((stage, index) => <StageEditorCard
        key={`${stage.id}-${stagePanelRequest?.stageId === stage.id ? stagePanelRequest.token : 0}`}
        cardRef={(element) => { if (element) stageCards.current.set(index, element); else stageCards.current.delete(index) }}
        stage={stage}
        index={index}
        active={index === activeStage}
        isLastStage={index === draft.stages.length - 1}
        limiterTolerances={draft.limiterTolerances}
        temperatureUnit={preferences.temperatureUnit}
        dragging={stage.id === draggedStageId}
        issues={validation.issues.filter((issue) => issue.stageId === stage.id)}
        panelRequest={stagePanelRequest?.stageId === stage.id ? stagePanelRequest : undefined}
        canDelete={draft.stages.length > 1}
        onActivate={() => toggleStage(index)}
        onChange={(patch) => updateStage(index, patch)}
        onDuplicate={() => duplicateStage(index)}
        onDelete={() => deleteStage(index)}
        onDragStart={(event) => startStageDrag(index, event)}
        onDragMove={moveStageDrag}
        onDragEnd={endStageDrag}
      />)}
      <button className="pb-add-stage" type="button" aria-label={t('builder.stage.addStage')} onClick={addStage}>
        <span><img src={builderStepPlus} alt="" /></span>
        <strong>{t('builder.stage.addStage')}</strong>
      </button>
    </section>
    {discardConfirmOpen && <div className="pb-discard-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setDiscardConfirmOpen(false) }}>
      <section className="pb-discard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pb-discard-title" aria-describedby="pb-discard-copy">
        <h2 id="pb-discard-title">{t('builder.discard.title')}</h2>
        <p id="pb-discard-copy">{t('builder.discard.body')}</p>
        <div>
          <button type="button" onClick={() => setDiscardConfirmOpen(false)}>{t('builder.discard.keepEditing')}</button>
          <button className="pb-discard-dialog__discard" type="button" onClick={onClose}>{t('builder.discard.discard')}</button>
        </div>
      </section>
    </div>}
  </main>
}
