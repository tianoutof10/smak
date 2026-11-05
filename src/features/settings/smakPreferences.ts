import { useEffect, useState } from 'react'
import type { TemperatureUnit } from '../../domain/temperature'
import { isLanguage, resolveLanguage, setActiveLanguage, type LanguagePreference } from '../../i18n/index.ts'
import type { ClockFormat } from '../sleep/deviceTime'

export type ChartLineWeight = 'fine' | 'standard' | 'bold'
/** Live-pull layout: full telemetry chart, or the calm yield ring. */
export type LiveView = 'chart' | 'calm'
/** Home: today's coffee and recipe, or the full machine dashboard. */
export type HomeView = 'today' | 'machine'

export interface SmakPreferences {
  theme: 'nordic' | 'dark' | 'light'
  completionSoundEnabled: boolean
  animationsEnabled: boolean
  waterWarningLevelMl: number
  waterCriticalLevelMl: number
  chartLineWeight: ChartLineWeight
  temperatureUnit: TemperatureUnit
  clockFormat: ClockFormat
  screensaverBrightness: number
  screensaverScreenOffDelaySeconds: number
  language: LanguagePreference
  liveView: LiveView
  homeView: HomeView
}

export const SMAK_PREFERENCES_KEY = 'smak.preferences.v1'
const preferenceEvent = 'smak:preferences-changed'

export const DEFAULT_SMAK_PREFERENCES: SmakPreferences = {
  theme: 'nordic',
  completionSoundEnabled: true,
  animationsEnabled: true,
  waterWarningLevelMl: 426,
  waterCriticalLevelMl: 300,
  chartLineWeight: 'fine',
  temperatureUnit: 'C',
  clockFormat: 'device',
  screensaverBrightness: 7,
  screensaverScreenOffDelaySeconds: 0,
  language: 'auto',
  liveView: 'calm',
  homeView: 'today',
}

const finiteRange = (value: unknown, fallback: number) => {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.round(Math.max(0, Math.min(2_000, number))) : fallback
}

export function normalizeSmakPreferences(value: unknown): SmakPreferences {
  const candidate = value && typeof value === 'object' ? value as Partial<SmakPreferences> : {}
  const critical = finiteRange(candidate.waterCriticalLevelMl, DEFAULT_SMAK_PREFERENCES.waterCriticalLevelMl)
  const warning = Math.max(critical + 1, finiteRange(candidate.waterWarningLevelMl, DEFAULT_SMAK_PREFERENCES.waterWarningLevelMl))
  const chartLineWeight = candidate.chartLineWeight === 'standard' || candidate.chartLineWeight === 'bold'
    ? candidate.chartLineWeight
    : 'fine'
  const temperatureUnit = candidate.temperatureUnit === 'F' ? 'F' : 'C'
  return {
    // Nordic (warm dark) is the default; Dark and Light (Beta) remain explicit choices.
    // Light stays opt-in: device appearance never enables it.
    theme: candidate.theme === 'light' ? 'light' : candidate.theme === 'dark' ? 'dark' : 'nordic',
    completionSoundEnabled: candidate.completionSoundEnabled !== false,
    animationsEnabled: candidate.animationsEnabled !== false,
    screensaverBrightness: typeof candidate.screensaverBrightness === 'number' && Number.isFinite(candidate.screensaverBrightness)
      ? Math.round(Math.max(0, Math.min(100, candidate.screensaverBrightness)))
      : DEFAULT_SMAK_PREFERENCES.screensaverBrightness,
    screensaverScreenOffDelaySeconds: typeof candidate.screensaverScreenOffDelaySeconds === 'number' && Number.isFinite(candidate.screensaverScreenOffDelaySeconds)
      ? Math.round(Math.max(0, Math.min(3_600, candidate.screensaverScreenOffDelaySeconds)))
      : DEFAULT_SMAK_PREFERENCES.screensaverScreenOffDelaySeconds,
    waterWarningLevelMl: Math.min(2_000, warning),
    waterCriticalLevelMl: Math.min(1_999, critical),
    chartLineWeight,
    temperatureUnit,
    clockFormat: candidate.clockFormat === '12h' || candidate.clockFormat === '24h' ? candidate.clockFormat : 'device',
    language: isLanguage(candidate.language) ? candidate.language : 'auto',
    // The morning view is the default (brief: "This is the default view").
    liveView: candidate.liveView === 'chart' ? 'chart' : 'calm',
    homeView: candidate.homeView === 'machine' ? 'machine' : 'today',
  }
}

export function readSmakPreferences() {
  if (typeof window === 'undefined') return DEFAULT_SMAK_PREFERENCES
  try {
    const stored = window.localStorage.getItem(SMAK_PREFERENCES_KEY)
    return normalizeSmakPreferences(stored ? JSON.parse(stored) : undefined)
  } catch {
    return DEFAULT_SMAK_PREFERENCES
  }
}

export function applySmakPreferences(preferences = readSmakPreferences()) {
  setActiveLanguage(resolveLanguage(preferences.language))
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.chartLineWeight = preferences.chartLineWeight
    document.documentElement.dataset.theme = preferences.theme
    document.documentElement.dataset.animations = preferences.animationsEnabled ? 'on' : 'off'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', preferences.theme === 'light' ? '#f4f5ef' : preferences.theme === 'nordic' ? '#131313' : '#171717')
  }
  return preferences
}

export function writeSmakPreferences(patch: Partial<SmakPreferences>) {
  const next = normalizeSmakPreferences({ ...readSmakPreferences(), ...patch })
  try {
    window.localStorage.setItem(SMAK_PREFERENCES_KEY, JSON.stringify(next))
  } catch {
    // The current session can still use the selection when storage is unavailable.
  }
  applySmakPreferences(next)
  window.dispatchEvent(new CustomEvent(preferenceEvent, { detail: next }))
  return next
}

export function useSmakPreferences() {
  const [preferences, setPreferences] = useState(readSmakPreferences)
  useEffect(() => {
    const onPreference = (event: Event) => setPreferences((event as CustomEvent<SmakPreferences>).detail ?? readSmakPreferences())
    const onStorage = (event: StorageEvent) => {
      if (event.key === SMAK_PREFERENCES_KEY || event.key === null) setPreferences(applySmakPreferences())
    }
    window.addEventListener(preferenceEvent, onPreference)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(preferenceEvent, onPreference)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return {
    preferences,
    updatePreferences: writeSmakPreferences,
    resetPreferences: () => writeSmakPreferences(DEFAULT_SMAK_PREFERENCES),
  }
}
