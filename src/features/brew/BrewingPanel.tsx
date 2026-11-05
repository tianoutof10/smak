import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { t, useLanguage } from '../../i18n/index.ts'
import { Metric } from '../../components/Metric/Metric'
import type { BrewProfile, EditableProfileSetting } from '../../domain/brewing'
import { formatTemperatureValue, temperatureBoundToDisplay, temperatureFromDisplay, temperatureStepToDisplay, temperatureUnitLabel } from '../../domain/temperature'
import type { FixedValueSuggestion } from '../../domain/valueAdjustments'
import { VALUE_ADJUSTMENTS } from '../../domain/valueAdjustments'
import { doseToYieldRatio } from './brewRatio'
import { DEMO_PROFILE_LONG_PRESS_MS } from './demoBrew'
import { ProfileTargetChart } from './ProfileTargetChart'
import { createFramePublisher, profileCardMotion, profileCardPosition, projectedProfileSteps, wrappedProfileOffset } from './profileCarouselMotion'
import { useSmakPreferences } from '../settings/smakPreferences'

interface CarouselDrag {
  pointerId: number
  startX: number
  lastX: number
  lastAt: number
  velocity: number
  stride: number
  moved: boolean
}

function BrewingPanelComponent({ profiles, activeProfileId, settingsDisabled, demoMode = false, onUpdateProfile, onSelectProfile, onStartDemoBrew, onManageProfiles, footerExtra }: { footerExtra?: ReactNode; profiles: BrewProfile[]; activeProfileId?: string; settingsDisabled?: boolean; demoMode?: boolean; onUpdateProfile: (profileId: string, setting: EditableProfileSetting, value: number) => void; onSelectProfile: (profileId: string) => Promise<boolean>; onStartDemoBrew?: (profileId: string) => void; onManageProfiles: () => void }) {
  useLanguage()
  const { preferences } = useSmakPreferences()
  const temperatureUnit = preferences.temperatureUnit
  const selectedIndex = profiles.findIndex((profile) => profile.id === activeProfileId)
  const fallbackIndex = profiles.findIndex((profile) => profile.id === 'adaptive-v2')
  const initialIndex = Math.max(0, selectedIndex >= 0 ? selectedIndex : fallbackIndex)
  const [optimisticProfileId, setOptimisticProfileId] = useState<string | null>(null)
  const optimisticIndex = profiles.findIndex((profile) => profile.id === optimisticProfileId)
  const activeIndex = optimisticIndex >= 0 ? optimisticIndex : initialIndex
  const [dragProgress, setDragProgress] = useState(0)
  const carousel = useRef<HTMLDivElement>(null)
  const dragFrame = useRef<ReturnType<typeof createFramePublisher> | null>(null)
  const pointerStart = useRef<CarouselDrag | null>(null)
  const demoHold = useRef<{ pointerId: number; timeout: number; triggered: boolean } | null>(null)
  const suppressClick = useRef(false)
  const selectionRequest = useRef(0)
  const activeProfile = profiles[activeIndex] ?? profiles[0]
  const ratio = doseToYieldRatio(activeProfile.dose, activeProfile.targetYield)
  const doseValue = Number(activeProfile.dose)
  const effectiveDose = Number.isFinite(doseValue) && doseValue >= 0 ? doseValue : VALUE_ADJUSTMENTS.dose.defaultValue
  const yieldValueHint = effectiveDose > 0
    ? (targetYield: number) => doseToYieldRatio(effectiveDose, targetYield)
    : undefined
  const fixedYieldSuggestions: readonly FixedValueSuggestion[] = [
    { label: t('brew.panel.doseSuggestion.ristretto'), detail: '1:1', value: effectiveDose },
    { label: t('brew.panel.doseSuggestion.espresso'), detail: '1:2', value: effectiveDose * 2 },
    { label: t('brew.panel.doseSuggestion.lungo'), detail: '1:3', value: effectiveDose * 3 },
    { label: t('brew.panel.doseSuggestion.lungoPlus'), detail: '1:4', value: effectiveDose * 4 },
  ]

  const cancelDemoHold = () => {
    if (demoHold.current) window.clearTimeout(demoHold.current.timeout)
    demoHold.current = null
  }

  useEffect(() => {
    const publisher = createFramePublisher(setDragProgress, callback => window.requestAnimationFrame(callback), id => window.cancelAnimationFrame(id))
    dragFrame.current = publisher
    return () => {
      if (demoHold.current) window.clearTimeout(demoHold.current.timeout)
      publisher.cancel()
      dragFrame.current = null
    }
  }, [])

  useLayoutEffect(() => {
    const element = carousel.current
    if (!element) return
    // Percentage translations use the card's width, but spacing uses the carousel's width.
    // Observe that width outside pointermove, including utility-panel expansion and rotation.
    const setWidth = (width: number) => element.style.setProperty('--profile-carousel-width', `${width}px`)
    setWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const editProfileSetting = (setting: EditableProfileSetting, valueHint?: (value: number) => string | undefined, fixedSuggestions?: readonly FixedValueSuggestion[]) => {
    const definition = VALUE_ADJUSTMENTS[setting]
    const isTemperature = setting === 'temperature'
    return {
      title: definition.title,
      min: isTemperature ? temperatureBoundToDisplay(definition.min, temperatureUnit) : definition.min,
      max: isTemperature ? temperatureBoundToDisplay(definition.max, temperatureUnit) : definition.max,
      step: isTemperature ? temperatureStepToDisplay(definition.step, temperatureUnit) : definition.step,
      mode: definition.mode,
      initialValue: 'defaultValue' in definition ? definition.defaultValue : undefined,
      suggestionKey: setting,
      presets: isTemperature ? definition.suggestions.map((value) => temperatureBoundToDisplay(value, temperatureUnit)) : definition.suggestions,
      fixedSuggestions,
      valueHint,
      disabled: settingsDisabled,
      onSave: (value: number) => onUpdateProfile(activeProfile.id, setting, isTemperature ? temperatureFromDisplay(value, temperatureUnit) : value),
    }
  }

  const selectIndex = async (index: number) => {
    const profile = profiles[index]
    if (!profile) return
    if (profile.id === activeProfileId) {
      setOptimisticProfileId(null)
      return
    }
    setOptimisticProfileId(profile.id)
    const request = ++selectionRequest.current
    await onSelectProfile(profile.id)
    if (request === selectionRequest.current) setOptimisticProfileId(null)
  }

  const selectRelative = (direction: number) => {
    void selectIndex((activeIndex + direction + profiles.length) % profiles.length)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) {
      cancelDemoHold()
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const width = event.currentTarget.getBoundingClientRect().width
    pointerStart.current = { pointerId: event.pointerId, startX: event.clientX, lastX: event.clientX, lastAt: event.timeStamp, velocity: 0, stride: Math.max(84, width * 0.215), moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    const pressedProfileId = (event.target as Element).closest<HTMLButtonElement>('.profile-card')?.dataset.profileId
    if (demoMode && onStartDemoBrew && pressedProfileId === activeProfile.id) {
      const hold = { pointerId: event.pointerId, timeout: 0, triggered: false }
      hold.timeout = window.setTimeout(() => {
        if (demoHold.current !== hold || pointerStart.current?.moved) return
        hold.triggered = true
        suppressClick.current = true
        onStartDemoBrew(activeProfile.id)
      }, DEMO_PROFILE_LONG_PRESS_MS)
      demoHold.current = hold
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = pointerStart.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const elapsed = Math.max(1, event.timeStamp - gesture.lastAt)
    const instantaneousVelocity = (event.clientX - gesture.lastX) / elapsed
    gesture.velocity = gesture.velocity * 0.65 + instantaneousVelocity * 0.35
    gesture.lastX = event.clientX
    gesture.lastAt = event.timeStamp
    const distance = event.clientX - gesture.startX
    if (Math.abs(distance) >= 8) {
      gesture.moved = true
      cancelDemoHold()
    }
    const maximumProgress = Math.max(1, profiles.length - 1)
    dragFrame.current?.schedule(Math.max(-maximumProgress, Math.min(maximumProgress, distance / gesture.stride)))
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = pointerStart.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const distance = event.clientX - gesture.startX
    const demoTriggered = demoHold.current?.triggered === true
    cancelDemoHold()
    pointerStart.current = null
    dragFrame.current?.cancel()
    setDragProgress(0)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (demoTriggered) {
      suppressClick.current = true
      return
    }
    if (gesture.moved) {
      suppressClick.current = true
      const steps = projectedProfileSteps(distance, gesture.velocity, gesture.stride, profiles.length)
      if (steps !== 0) void selectIndex((activeIndex + steps + profiles.length) % profiles.length)
    }
  }

  const cancelPointerGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerStart.current?.pointerId !== event.pointerId) return
    cancelDemoHold()
    pointerStart.current = null
    dragFrame.current?.cancel()
    setDragProgress(0)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') selectRelative(1)
    if (event.key === 'ArrowLeft') selectRelative(-1)
  }

  return <section className="brew-panel">
    <div ref={carousel} className={`profile-carousel${dragProgress !== 0 ? ' profile-carousel--dragging' : ''}`} aria-label={t('brew.panel.carouselAriaLabel')} aria-roledescription={t('common.accessibility.carousel')} tabIndex={0} onKeyDown={handleKeyDown} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={cancelPointerGesture} onContextMenu={demoMode ? (event) => event.preventDefault() : undefined}>
      {profiles.map((profile, index) => {
        const offset = wrappedProfileOffset(index, activeIndex - dragProgress, profiles.length)
        const position = profileCardPosition(offset)
        const motion = profileCardMotion(offset)
        const style = {
          '--profile-free-x': motion.xPercent / 100,
          '--profile-free-scale': motion.scale,
          '--profile-free-opacity': motion.opacity,
          zIndex: motion.zIndex,
        } as CSSProperties
        const graphVisible = Math.abs(offset) < 1.5
        const isActive = index === activeIndex
        const profileAriaLabel = isActive && demoMode
          ? t('brew.panel.profileAriaLabelSelectedDemo', { name: profile.name })
          : isActive
            ? t('brew.panel.profileAriaLabelSelected', { name: profile.name })
            : t('brew.panel.profileAriaLabel', { name: profile.name })
        return <button key={profile.id} className={`profile-card profile-card--free profile-card--${position}`} style={style} type="button" data-profile-id={profile.id} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } void selectIndex(index) }} aria-current={index === activeIndex ? 'true' : undefined} aria-label={profileAriaLabel}>
          <h1>{profile.name}</h1>
          {graphVisible && <ProfileTargetChart profileName={profile.name} points={profile.targetPoints} />}
        </button>
      })}
    </div>
    {footerExtra
      ? <div className="brew-panel__footer">{footerExtra}<button className="manage-profiles" type="button" onClick={onManageProfiles}>{t('brew.panel.seeAllProfiles')}</button></div>
      : <button className="manage-profiles" type="button" onClick={onManageProfiles}>{t('brew.panel.seeAllProfiles')}</button>}
    <div className="brew-metrics" aria-live="polite">
      <Metric metric={{ label: t('brew.panel.metricTemp'), value: formatTemperatureValue(activeProfile.temperature, temperatureUnit), unit: temperatureUnitLabel(temperatureUnit) }} edit={editProfileSetting('temperature')} />
      <Metric metric={{ label: t('brew.metric.grindSize'), value: activeProfile.grindSetting }} edit={editProfileSetting('grindSetting')} />
      <Metric metric={{ label: t('brew.metric.dose'), value: activeProfile.dose, unit: 'g' }} edit={editProfileSetting('dose')} />
      <Metric metric={{ label: t('brew.metric.yield'), value: activeProfile.targetYield, unit: Number.isFinite(Number(activeProfile.targetYield)) ? 'g' : undefined, subtext: ratio, subtextVariant: 'pill' }} reserveSubtext edit={editProfileSetting('targetYield', yieldValueHint, fixedYieldSuggestions)} />
    </div>
  </section>
}

export const BrewingPanel = memo(BrewingPanelComponent)
