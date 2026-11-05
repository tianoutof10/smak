import { useState, type ReactNode } from 'react'
import { useStableEvent } from '../utils/useStableEvent'
import cleaning from '../assets/figma/cleaning-profile.svg'
import logo from '../assets/figma/decent-logo.png'
import settings from '../assets/figma/settings-glyph.svg'
import sleep from '../assets/figma/sleep-glyph.svg'
import utilityCollapse from '../assets/figma/utility-collapse.svg'
import utilityExpand from '../assets/figma/utility-expand.svg'
import { StatusPill } from '../components/StatusPill/StatusPill'
import { FullscreenToggle } from '../components/FullscreenToggle/FullscreenToggle'
import { LayoutDiagnostics } from '../components/LayoutDiagnostics/LayoutDiagnostics'
import { isCleaningProfile } from '../api/decaid/adapters'
import type { AvailableScale, BrewProfile, BrewingScreenModel, DataConnection, EditableMachineSetting, EditableProfileSetting, LiveBrewState, LiveUtilityOperation, PreviousShotStatus, ScaleConnection, SettingFeedback } from '../domain/brewing'
import { t } from '../i18n/index.ts'
import { BrewingPanel } from '../features/brew/BrewingPanel'
import { LiveBrewingScreen } from '../features/brew/LiveBrewingScreen'
import { CleaningSequencePicker } from '../features/cleaning/CleaningSequencePicker'
import { HistoryPanel } from '../features/history/HistoryPanel'
import { MachineUtilityCard } from '../features/machine/MachineUtilityCard'
import { LiveUtilityOperationOverlay } from '../features/machine/LiveUtilityOperationOverlay'
import { ScaleDevicePicker } from '../features/machine/ScaleDevicePicker'
import { SleepWakeScreen } from '../features/sleep/SleepWakeScreen'
import type { ChassisParams } from '../domain/chassis'
import type { ApplyAction } from '../features/insights/dialIn'
import { TodayHome } from '../features/home/TodayHome'
import type { CoffeeTab } from '../features/beans/CoffeeScreen'
import { useSmakPreferences } from '../features/settings/smakPreferences'

interface AppShellProps {
  historyEntry?: ReactNode
  coffeeEntry?: ReactNode
  activeChassis?: ChassisParams
  onApplyAdvice?: (action: ApplyAction) => Promise<boolean>
  onAddTurbo?: () => void
  onOpenCoffee?: (tab?: CoffeeTab) => void
  model: BrewingScreenModel
  allProfiles: BrewProfile[]
  liveBrew: LiveBrewState
  utilityOperation: LiveUtilityOperation | null
  previousShotStatus: PreviousShotStatus
  connection: DataConnection
  machineConnection: DataConnection
  demoPullEnabled: boolean
  heatingSeconds: number | null
  sleepPending: boolean
  sleepScreenActive: boolean
  machineActionError: string | null
  settingFeedback: SettingFeedback | null
  settingsDisabled: boolean
  scale: ScaleConnection
  availableScales: AvailableScale[]
  scaleConnectPendingId: string | null
  scaleTarePending: boolean
  scaleTareDisabled?: boolean
  brewStopPending: boolean
  brewSkipPending: boolean
  cleaningStartPending: boolean
  cleaningPreparedProfileId: string | null
  onSleep: () => void
  onWake: () => void
  onStopEspresso: () => void
  onSkipBrewStage: () => Promise<boolean>
  onPrepareCleaning: (profileId: string) => Promise<boolean>
  onCancelCleaning: () => Promise<boolean>
  onDismissLiveBrew: () => void
  onSearchScale: () => void
  onConnectScale: (deviceId: string) => void
  onDismissScalePicker: () => void
  onTareScale: () => void
  onUpdateMachineSetting: (setting: EditableMachineSetting, value: number) => void
  onUpdateProfileSetting: (profileId: string, setting: EditableProfileSetting, value: number) => void
  onSelectProfile: (profileId: string) => Promise<boolean>
  onStartDemoBrew: (profileId: string) => void
  onOpenSettings: () => void
  onManageProfiles: () => void
  onOpenPreviousShot: () => void
}

const utilityLayoutStorageKey = 'smak.utility-layout-collapsed.v1'

const initialUtilityLayout = () => {
  try {
    return window.localStorage.getItem(utilityLayoutStorageKey) === 'true'
  } catch {
    return false
  }
}

export function AppShell({ historyEntry, coffeeEntry, activeChassis, onApplyAdvice, onAddTurbo, onOpenCoffee, model, allProfiles, liveBrew, utilityOperation, previousShotStatus, connection, machineConnection, demoPullEnabled, heatingSeconds, sleepPending, sleepScreenActive, machineActionError, settingFeedback, settingsDisabled, scale, availableScales, scaleConnectPendingId, scaleTarePending, scaleTareDisabled = false, brewStopPending, brewSkipPending, cleaningStartPending, cleaningPreparedProfileId, onSleep, onWake, onStopEspresso, onSkipBrewStage, onPrepareCleaning, onCancelCleaning, onDismissLiveBrew, onSearchScale, onConnectScale, onDismissScalePicker, onTareScale, onUpdateMachineSetting, onUpdateProfileSetting, onSelectProfile, onStartDemoBrew, onOpenSettings, onManageProfiles, onOpenPreviousShot }: AppShellProps) {
  const [utilitiesCollapsed, setUtilitiesCollapsed] = useState(initialUtilityLayout)
  const [utilityLayoutHasChanged, setUtilityLayoutHasChanged] = useState(false)
  const [cleaningPickerOpen, setCleaningPickerOpen] = useState(false)
  const { preferences, updatePreferences } = useSmakPreferences()
  const today = preferences.homeView === 'today' && Boolean(onOpenCoffee)
  const updateSetting = useStableEvent(onUpdateMachineSetting)
  const updateProfile = useStableEvent(onUpdateProfileSetting)
  const selectProfile = useStableEvent(onSelectProfile)
  const startDemo = useStableEvent(onStartDemoBrew)
  const manageProfiles = useStableEvent(onManageProfiles)
  const searchScale = useStableEvent(onSearchScale)
  const tareScale = useStableEvent(onTareScale)
  const cleaningProfiles = allProfiles.filter(isCleaningProfile).slice(0, 8)
  const sleepLabel = model.readiness === 'sleeping' ? t('shell.appShell.wake') : t('shell.appShell.sleep')
  const toggleUtilityLayout = useStableEvent(() => {
    setUtilityLayoutHasChanged(true)
    setUtilitiesCollapsed((collapsed) => {
      const nextCollapsed = !collapsed
      try {
        window.localStorage.setItem(utilityLayoutStorageKey, String(nextCollapsed))
      } catch {
        // Preference persistence is optional; the current session still updates.
      }
      return nextCollapsed
    })
  })
  const dismissCleaningPicker = async () => {
    if (await onCancelCleaning()) setCleaningPickerOpen(false)
  }
  if (sleepScreenActive) return <SleepWakeScreen onWake={onWake} />
  if (liveBrew.visible && !utilityOperation) return <LiveBrewingScreen model={model} liveBrew={liveBrew} stopPending={brewStopPending} skipPending={brewSkipPending} actionError={machineActionError} activeChassis={activeChassis} onApplyAdvice={onApplyAdvice} onAddTurbo={onAddTurbo} onStop={onStopEspresso} onSkipStage={onSkipBrewStage} onDismiss={onDismissLiveBrew} />
  const viewSwitch = onOpenCoffee ? <div className="home-view-switch" role="group" aria-label={t('shell.today.viewSwitch')}><button type="button" aria-pressed={today} onClick={() => updatePreferences({ homeView: 'today' })}>{t('shell.today.viewToday')}</button><button type="button" aria-pressed={!today} onClick={() => updatePreferences({ homeView: 'machine' })}>{t('shell.today.viewMachine')}</button></div> : null
  return <main className={`app-shell${today ? ' app-shell--today' : ''}${utilitiesCollapsed ? ' app-shell--utilities-collapsed' : ''}${utilityLayoutHasChanged ? ' app-shell--utility-layout-transitioned' : ''}`}>
    <LayoutDiagnostics />
    <header className="topbar"><div className="topbar__brand">{!today && <button className="utility-layout-toggle" type="button" aria-label={utilitiesCollapsed ? t('shell.appShell.expandUtilityPanels') : t('shell.appShell.minimizeUtilityPanels')} aria-controls="machine-utilities" aria-expanded={!utilitiesCollapsed} title={utilitiesCollapsed ? t('shell.appShell.expandUtilityPanels') : t('shell.appShell.minimizeUtilityPanels')} onClick={toggleUtilityLayout}><img src={utilitiesCollapsed ? utilityExpand : utilityCollapse} alt="" /></button>}<div className="topbar__logo" aria-label="Decent"><img className="logo" src={logo} alt="" /></div>{viewSwitch}</div><nav aria-label={t('shell.appShell.machineControls')}><button className={sleepPending ? 'control-button control-button--pending' : 'control-button'} type="button" aria-label={sleepPending ? t('shell.appShell.requestInProgress', { label: sleepLabel }) : sleepLabel} title={sleepLabel} disabled={sleepPending} onClick={onSleep}><img src={sleep} alt="" /></button><button className="control-button control-button--cleaning" type="button" aria-label={t('shell.appShell.cleaningSequences')} title={t('shell.appShell.cleaning')} onClick={() => setCleaningPickerOpen(true)}><img src={cleaning} alt="" /></button><button className="control-button" type="button" aria-label={t('shell.appShell.settings')} title={t('shell.appShell.settings')} onClick={onOpenSettings}><img src={settings} alt="" /></button><FullscreenToggle /><StatusPill status={model.readiness} connection={connection} machineConnection={machineConnection} heatingSeconds={heatingSeconds} /></nav></header>
    {(machineActionError || settingFeedback) && <div className="system-messages">
      {machineActionError && <div className="system-message system-message--error" role="alert">{machineActionError}</div>}
      {settingFeedback && <div className={`system-message system-message--${settingFeedback.status}`} role={settingFeedback.status === 'error' ? 'alert' : 'status'} aria-live="polite">{settingFeedback.message}</div>}
    </div>}
    {today ? <TodayHome model={model} heatingSeconds={heatingSeconds} scale={scale} demoMode={demoPullEnabled} onStartDemoBrew={startDemo} onOpenCoffee={onOpenCoffee!} onManageProfiles={manageProfiles} onShowMachine={() => updatePreferences({ homeView: 'machine' })} onApplyAdvice={onApplyAdvice} /> : <div className="dashboard"><aside className="utilities" id="machine-utilities">{model.utilities.map((utility) => <MachineUtilityCard key={utility.id} utility={utility} compact={utilitiesCollapsed} scale={utility.id === 'scale' ? scale : undefined} scaleTarePending={utility.id === 'scale' && scaleTarePending} scaleTareDisabled={utility.id === 'scale' && scaleTareDisabled} onExpand={utility.id === 'tank' ? undefined : toggleUtilityLayout} onSearchScale={utility.id === 'scale' ? searchScale : undefined} onTareScale={utility.id === 'scale' ? tareScale : undefined} settingsDisabled={settingsDisabled} onUpdateSetting={updateSetting} />)}</aside><div className="primary"><BrewingPanel profiles={model.profiles} activeProfileId={model.activeProfileId} settingsDisabled={settingsDisabled} demoMode={demoPullEnabled} onUpdateProfile={updateProfile} onSelectProfile={selectProfile} onStartDemoBrew={startDemo} onManageProfiles={manageProfiles} footerExtra={coffeeEntry} />{historyEntry ?? <HistoryPanel shot={model.previousShot} status={previousShotStatus} onOpen={onOpenPreviousShot} />}</div></div>}
    {utilityOperation && <LiveUtilityOperationOverlay operation={utilityOperation} />}
    <ScaleDevicePicker devices={availableScales} pendingDeviceId={scaleConnectPendingId} onSelect={onConnectScale} onDismiss={onDismissScalePicker} />
    {cleaningPickerOpen && <CleaningSequencePicker profiles={cleaningProfiles} pending={cleaningStartPending} preparedProfileId={cleaningPreparedProfileId} onPrepare={onPrepareCleaning} onDismiss={dismissCleaningPicker} />}
  </main>
}
