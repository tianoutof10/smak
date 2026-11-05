import { useCallback, useEffect, useMemo, useState } from 'react'
import { displayBrightness } from './displayBrightness'
import { hotWaterSettings } from '../brew/hotWaterSettings'
import { t } from '../../i18n/index.ts'
import {
  connectDevice,
  createWakeSchedule,
  deleteWakeSchedule,
  disconnectDevice,
  enablePlugin,
  forgetDevice,
  getAdvancedMachineSettings,
  getDecaidInfo,
  getDevices,
  getDisplayState,
  getMachineCapabilities,
  getMachineSettings,
  getPlugins,
  getPresenceSettings,
  getSettings,
  getWorkflow,
  scanForDevices,
  updateAdvancedMachineSettings,
  updateMachineSettings,
  updatePresenceSettings,
  updateSettings,
  updateWakeSchedule,
  type DecaidPluginManifest,
} from '../../api/decaid/client'
import type {
  DecaidAdvancedMachineSettings,
  DecaidDevice,
  DecaidInfo,
  DecaidMachineSettings,
  DecaidSettings,
  DecaidWorkflow,
  DisplayState,
  MachineCapabilities,
  PresenceSettings,
} from '../../api/decaid/types'
import {
  normalizeAdvancedMachineSettings,
  normalizeDisplaySettings,
  normalizeMachineSettings,
  normalizePresenceSettings,
  normalizeReaSettings,
  normalizeWorkflowSettings,
} from './settingsProtocol'

export interface UnifiedSettingsSnapshot {
  rea: DecaidSettings
  machine: DecaidMachineSettings
  advanced: DecaidAdvancedMachineSettings
  workflow: DecaidWorkflow
  display: DisplayState
  presence: PresenceSettings
  devices: DecaidDevice[]
  plugins: DecaidPluginManifest[]
  info: DecaidInfo
  capabilities: MachineCapabilities
}

export const UNIFIED_SETTINGS_SAVED_EVENT = 'smak:unified-settings-saved'

const emptySnapshot = (): UnifiedSettingsSnapshot => ({
  rea: {}, machine: {}, advanced: {}, workflow: {}, display: {}, presence: {}, devices: [], plugins: [], info: {}, capabilities: {},
})

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

const changedFields = <T extends object>(before: T, after: T) => Object.fromEntries(
  Object.entries(after).filter(([key, value]) => !same(value, (before as Record<string, unknown>)[key])),
) as Partial<T>

const settledValue = <T,>(result: PromiseSettledResult<T>, fallback: T) => result.status === 'fulfilled' ? result.value : fallback
const settledNormalized = <T,>(result: PromiseSettledResult<T>, fallback: T, normalize: (value: T) => T) => (
  result.status === 'fulfilled' ? normalize(result.value) : fallback
)

export function useUnifiedSettings(enabled: boolean) {
  const [baseline, setBaseline] = useState<UnifiedSettingsSnapshot>(emptySnapshot)
  const [draft, setDraft] = useState<UnifiedSettingsSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(enabled)
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Decoupled from `message`'s text on purpose: the status banner used to style itself by matching
  // English substrings in the (now translatable) message, e.g. `message.includes('could not')`.
  // That broke as soon as messages were localised, and it also missed genuine errors whose text
  // didn't contain those words. Every catch block below sets this explicitly instead.
  const [messageError, setMessageError] = useState(false)
  const [unavailable, setUnavailable] = useState<string[]>([])

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setMessage(null)
    setMessageError(false)
    const names = ['Decaid', 'machine', 'advanced machine', 'workflow', 'display', 'presence', 'devices', 'plugins', 'system', 'capabilities']
    const results = await Promise.allSettled([
      getSettings(), getMachineSettings(), getAdvancedMachineSettings(), getWorkflow(), getDisplayState(),
      getPresenceSettings(), getDevices(), getPlugins(), getDecaidInfo(), getMachineCapabilities(),
    ])
    const next: UnifiedSettingsSnapshot = {
      rea: settledNormalized(results[0], {}, normalizeReaSettings),
      machine: settledNormalized(results[1], {}, normalizeMachineSettings),
      advanced: settledNormalized(results[2], {}, normalizeAdvancedMachineSettings),
      workflow: settledNormalized(results[3], {}, normalizeWorkflowSettings),
      display: settledNormalized(results[4], {}, normalizeDisplaySettings),
      presence: settledNormalized(results[5], {}, normalizePresenceSettings),
      devices: settledValue(results[6], []),
      plugins: settledValue(results[7], []),
      info: settledValue(results[8], {}),
      capabilities: settledValue(results[9], {}),
    }
    setUnavailable(results.flatMap((result, index) => result.status === 'rejected' ? [names[index]] : []))
    setBaseline(next)
    setDraft(next)
    setLoading(false)
    return next
  }, [enabled])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void reload() }, 0)
    return () => window.clearTimeout(loadTimer)
  }, [reload])

  const dirty = useMemo(() => !same(baseline, draft), [baseline, draft])
  const reset = () => { setDraft(baseline); setMessage(null); setMessageError(false) }
  const patchRea = (patch: Partial<DecaidSettings>) => setDraft((current) => ({ ...current, rea: { ...current.rea, ...patch } }))
  const patchMachine = (patch: Partial<DecaidMachineSettings>) => setDraft((current) => ({ ...current, machine: { ...current.machine, ...patch } }))
  const patchAdvanced = (patch: Partial<DecaidAdvancedMachineSettings>) => setDraft((current) => ({ ...current, advanced: { ...current.advanced, ...patch } }))
  const patchPresence = (patch: Partial<PresenceSettings>) => setDraft((current) => ({ ...current, presence: { ...current.presence, ...patch } }))
  const patchDisplay = (patch: Partial<DisplayState>) => setDraft((current) => ({ ...current, display: { ...current.display, ...patch } }))
  const patchWorkflow = (section: 'steamSettings' | 'hotWaterData' | 'rinseData', patch: Record<string, number>) => setDraft((current) => ({
    ...current,
    workflow: { ...current.workflow, [section]: { ...current.workflow[section], ...patch } },
  }))

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setMessage(null)
    setMessageError(false)
    try {
      const rea = changedFields(baseline.rea, draft.rea)
      const machine = changedFields(baseline.machine, draft.machine)
      const advanced = changedFields(baseline.advanced, draft.advanced)
      const presenceChanges = changedFields(baseline.presence, draft.presence)
      // Decaid's presence write endpoint accepts only these two fields. Wake
      // schedules and keep-awake-until have their own endpoints.
      const presence: Partial<PresenceSettings> = {}
      if ('userPresenceEnabled' in presenceChanges) presence.userPresenceEnabled = presenceChanges.userPresenceEnabled
      if ('sleepTimeoutMinutes' in presenceChanges) presence.sleepTimeoutMinutes = presenceChanges.sleepTimeoutMinutes
      const workflow = changedFields(baseline.workflow, draft.workflow)
      // Do not republish unchanged targets over a newer choice on another device.
      if (workflow.hotWaterData) workflow.hotWaterData = changedFields(baseline.workflow.hotWaterData ?? {}, draft.workflow.hotWaterData ?? {})
      const requestedBrightness = draft.display.requestedBrightness ?? draft.display.brightness
      const oldBrightness = baseline.display.requestedBrightness ?? baseline.display.brightness

      // Streamline and Decaid both treat these as separate persistence domains.
      // Keep the writes ordered so workflow and machine writes never race each other.
      if (Object.keys(rea).length) await updateSettings(rea)
      if (Object.keys(machine).length) await updateMachineSettings(machine)
      if (Object.keys(advanced).length) await updateAdvancedMachineSettings(advanced)
      if (Object.keys(workflow).length) await hotWaterSettings.save(workflow)
      if (Object.keys(presence).length) await updatePresenceSettings(presence)
      if (requestedBrightness !== undefined && requestedBrightness !== oldBrightness) await displayBrightness.choose(requestedBrightness)
      const refreshed = await reload()
      window.dispatchEvent(new CustomEvent(UNIFIED_SETTINGS_SAVED_EVENT, { detail: refreshed }))
      setMessage(t('settings.message.saved'))
      setMessageError(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('settings.message.saveFailed'))
      setMessageError(true)
    } finally {
      setSaving(false)
    }
  }

  const refreshDevices = async () => {
    const devices = await getDevices()
    setBaseline((current) => ({ ...current, devices }))
    setDraft((current) => ({ ...current, devices }))
  }

  const refreshPlugins = async () => {
    const plugins = await getPlugins()
    setBaseline((current) => ({ ...current, plugins }))
    setDraft((current) => ({ ...current, plugins }))
  }

  const refreshPresence = async () => {
    const presence = normalizePresenceSettings(await getPresenceSettings())
    setBaseline((current) => ({ ...current, presence }))
    setDraft((current) => ({
      ...current,
      presence: {
        ...current.presence,
        schedules: presence.schedules,
        keepAwakeUntil: presence.keepAwakeUntil,
      },
    }))
  }

  const runAction = async (
    key: string,
    action: () => Promise<unknown>,
    refresh: () => Promise<void>,
    success: string,
  ) => {
    if (acting) return
    setActing(key)
    setMessage(null)
    setMessageError(false)
    try {
      await action()
      // Refresh only the domain changed by this immediate action. A full
      // reload here would silently discard drafts in every other section.
      await refresh()
      setMessage(success)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('settings.message.actionFailed'))
      setMessageError(true)
    } finally {
      setActing(null)
    }
  }

  return {
    draft, loading, saving, acting, dirty, message, messageError, unavailable,
    reload, reset, save, patchRea, patchMachine, patchAdvanced, patchPresence, patchDisplay, patchWorkflow,
    scan: () => runAction('scan', () => scanForDevices(), refreshDevices, t('settings.message.scanComplete')),
    connect: (id: string) => runAction(`connect:${id}`, () => connectDevice(id), refreshDevices, t('settings.message.deviceConnected')),
    disconnect: (id: string) => runAction(`disconnect:${id}`, () => disconnectDevice(id), refreshDevices, t('settings.message.deviceDisconnected')),
    forget: (id: string) => runAction(`forget:${id}`, () => forgetDevice(id), refreshDevices, t('settings.message.deviceForgotten')),
    togglePlugin: (id: string, next: boolean) => runAction(`plugin:${id}`, () => enablePlugin(id, next), refreshPlugins, next ? t('settings.message.pluginEnabled') : t('settings.message.pluginDisabled')),
    createSchedule: (schedule: Parameters<typeof createWakeSchedule>[0]) => runAction('schedule:new', () => createWakeSchedule(schedule), refreshPresence, t('settings.message.scheduleAdded')),
    updateSchedule: (id: string, patch: Parameters<typeof updateWakeSchedule>[1]) => runAction(`schedule:${id}`, () => updateWakeSchedule(id, patch), refreshPresence, t('settings.message.scheduleUpdated')),
    deleteSchedule: (id: string) => runAction(`schedule:${id}`, () => deleteWakeSchedule(id), refreshPresence, t('settings.message.scheduleRemoved')),
  }
}
