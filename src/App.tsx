import { useEffect, useRef, useState } from 'react'
import { useStableEvent } from './utils/useStableEvent'
import { callPluginEndpoint, getPluginSettings, getPlugins, getProfiles, updateProfile } from './api/decaid/client'
import type { DecaidProfileRecord } from './api/decaid/types'
import { AppShell } from './app/AppShell'
import { FullscreenPrompt } from './components/FullscreenPrompt/FullscreenPrompt'
import { InteractionSound } from './components/InteractionSound/InteractionSound'
import { ValueAdjustmentProvider } from './components/ValueAdjustment/ValueAdjustmentProvider'
import { useBrewingData } from './features/brew/useBrewingData'
import { ProfileBuilderScreen } from './features/profiles/ProfileBuilderScreen'
import { deduplicateImportedProfileTitle, type ParsedProfileImport, type VisualizerImportResult, visualizerCredentialsConfigured, visualizerImportedProfileId } from './features/profiles/profileImports'
import { ProfilesPanel } from './features/profiles/ProfilesPanel'
import { InsightsScreen } from './features/insights/InsightsScreen'
import { InsightsHome } from './features/insights/InsightsHome'
import { useShotInsights } from './features/insights/useShotInsights'
import { defaultInsightsRoute, readInsightsRoute, writeInsightsRoute, type InsightsRoute } from './features/insights/insightsRoute'
import { DecaidUpdatePrompt } from './features/updates/DecaidUpdatePrompt'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { t, useLanguage } from './i18n/index.ts'
import { CoffeeEntry, CoffeeScreen, type CoffeeTab } from './features/beans/CoffeeScreen'
import { CHASSIS_TITLE, chassisFromMetadata, chassisMetadata, clampChassis, compileChassisProfile, type ChassisParams } from './domain/chassis'
import { presetById, type PresetId } from './domain/researchPresets'
import type { ApplyAction } from './features/insights/dialIn'
import './styles/index.css'
import './styles/cardSurfaces.css'
import './styles/lightMode.css'
import './styles/settingsLayout.css'
import './features/machine/drinkUtilityCards.css'
import './features/insights/insights.css'
import './styles/homeAnimations.css'
import '@fontsource-variable/inter'
import './styles/nordicAccents.css'
import './styles/nordic.css'

type AppPage = 'home' | 'profiles' | 'previous-pull' | 'profile-builder' | 'settings' | 'insights' | 'coffee'

const currentPage = (): AppPage => {
  const page = new URLSearchParams(window.location.search).get('page')
  return page === 'profiles' || page === 'previous-pull' || page === 'profile-builder' || page === 'settings' || page === 'insights' || page === 'coffee' ? page : 'home'
}

const requestedProfileId = () => new URLSearchParams(window.location.search).get('profileId') ?? undefined

export default function App() {
  // Re-render the whole shell when the display language changes; texts are resolved at render time.
  useLanguage()
  const data = useBrewingData()
  const [importedProfileRecord, setImportedProfileRecord] = useState<DecaidProfileRecord | undefined>()
  const [, setPage] = useState(0)
  const page = data.utilityOperation ? 'home' : currentPage()
  const utilityOperationKind = data.utilityOperation?.kind
  const insights = useShotInsights(!data.liveBrew.visible && !data.utilityOperation && !data.sleepScreenActive && ['home', 'insights', 'previous-pull'].includes(page), data.model.previousShot?.id ?? '')
  const insightsRoute = readInsightsRoute(new URLSearchParams(window.location.search))
  const navigateInsights = (next: InsightsRoute, replace = false) => {
    const url = writeInsightsRoute(new URL(window.location.href), next)
    window.history[replace ? 'replaceState' : 'pushState']({ page: 'insights' }, '', url)
    setPage(value => value + 1)
  }
  const openInsights = useStableEvent(() => navigateInsights({ ...defaultInsightsRoute }))
  const openLatestInsight = useStableEvent((id: string) => navigateInsights({ ...defaultInsightsRoute, section: 'history', days: 0, beverage: 'all', shotId: id }))

  useEffect(() => {
    const handlePopState = () => setPage(value => value + 1)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!utilityOperationKind || currentPage() === 'home') return
    const url = new URL(window.location.href)
    url.searchParams.delete('page')
    window.history.replaceState({ page: 'home' }, '', url)
  }, [utilityOperationKind])

  const navigate = (nextPage: AppPage, profileId?: string) => {
    const url = new URL(window.location.href)
    if (nextPage === 'home') url.searchParams.delete('page')
    else url.searchParams.set('page', nextPage)
    if (profileId) url.searchParams.set('profileId', profileId)
    else url.searchParams.delete('profileId')
    window.history.pushState({ page: nextPage }, '', url)
    setPage(value => value + 1)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }

  const startProfileFromScratch = () => {
    setImportedProfileRecord(undefined)
    navigate('profile-builder')
  }

  const editImportedProfile = ({ profile, metadata }: ParsedProfileImport) => {
    const existingTitles = data.allProfiles.map((item) => item.category ? `${item.category} / ${item.name}` : item.name)
    const title = deduplicateImportedProfileTitle(profile, existingTitles)
    setImportedProfileRecord({ profile: { ...profile, title }, metadata: { ...metadata, smakSource: 'imported' }, visibility: 'visible', isDefault: true })
    navigate('profile-builder')
  }

  const checkVisualizerImport = async () => {
    try {
      const [plugins, settings] = await Promise.all([getPlugins(), getPluginSettings('visualizer.reaplugin')])
      const plugin = plugins.find((candidate) => candidate.id === 'visualizer.reaplugin')
      if (!plugin?.loaded) return { ready: false, message: t('shell.app.visualizerPluginDisabled') }
      if (!visualizerCredentialsConfigured(settings)) return { ready: false, message: t('shell.app.visualizerSignInRequired') }
      return { ready: true }
    } catch {
      return { ready: false, message: t('shell.app.visualizerUnavailable') }
    }
  }

  const importFromVisualizer = async (shareCode: string) => {
    const before = await getProfiles()
    const beforeIds = new Set(before.map((record) => record.id).filter((id): id is string => Boolean(id)))
    const result = await callPluginEndpoint<VisualizerImportResult>('visualizer.reaplugin', 'import', { shareCode })
    if (result.success === false) throw new Error(t('shell.app.visualizerImportFailed'))

    const after = await getProfiles()
    const reportedId = visualizerImportedProfileId(result)
    let imported = reportedId ? after.find((record) => record.id === reportedId) : undefined
    imported ??= after.find((record) => record.id && !beforeIds.has(record.id))
    if (!imported?.profile) throw new Error(t('shell.app.visualizerImportMissing'))

    const existingTitles = before.map((record) => record.profile?.title).filter((title): title is string => Boolean(title?.trim()))
    const uniqueTitle = deduplicateImportedProfileTitle(imported.profile, existingTitles)
    if (uniqueTitle !== imported.profile.title && imported.id) {
      imported = await updateProfile(imported.id, { ...imported.profile, title: uniqueTitle }, imported.metadata)
    }

    const url = new URL(window.location.href)
    url.searchParams.set('page', 'profiles')
    if (imported.id) url.searchParams.set('profileId', imported.id)
    else url.searchParams.delete('profileId')
    window.location.assign(url)
  }

  // --- Coffee, presets, Living Profile and one-tap Apply -------------------
  const profileTitle = (profile: { name: string; category?: string }) => profile.category ? `${profile.category} / ${profile.name}` : profile.name
  const activeProfileId = data.model.activeProfileId
  const activeChassis = activeProfileId ? chassisFromMetadata(data.profileRecordForEditing(activeProfileId)?.metadata) : undefined
  const pendingSelectId = useRef<string | null>(null)
  const [selectCheck, setSelectCheck] = useState(0)
  const { allProfiles, selectProfile } = data
  useEffect(() => {
    // A newly created profile can only be selected once the library state includes it.
    const id = pendingSelectId.current
    if (!id || !allProfiles.some(profile => profile.id === id)) return
    pendingSelectId.current = null
    void selectProfile(id)
  }, [allProfiles, selectProfile, selectCheck])

  const applyChassis = async (params: ChassisParams) => {
    const targetId = activeChassis ? activeProfileId : data.allProfiles.find(profile => chassisFromMetadata(data.profileRecordForEditing(profile.id)?.metadata))?.id
    const record = targetId ? data.profileRecordForEditing(targetId) : undefined
    const notes = record?.profile?.notes || presetById('living')!.profile.notes || ''
    const profile = compileChassisProfile(params, record?.profile?.title || CHASSIS_TITLE, notes)
    const saved = await data.saveProfileDraft(profile, targetId, Boolean(targetId && record?.isDefault === false), { ...(record?.metadata ?? {}), ...chassisMetadata(params) })
    if (!saved?.id) return false
    if (saved.id !== activeProfileId) {
      pendingSelectId.current = saved.id
      setSelectCheck(value => value + 1)
    }
    return true
  }
  const applyAdvice = async (action: ApplyAction) => {
    if (action.kind === 'chassis') return applyChassis(clampChassis(action.params))
    if (!activeProfileId) return false
    for (const change of action.changes) await data.updateProfileSetting(activeProfileId, change.setting, change.value)
    return true
  }
  const addPreset = async (id: PresetId) => {
    const preset = presetById(id)
    if (!preset) return false
    if (data.allProfiles.some(profile => profileTitle(profile) === preset.profile.title)) return true
    const saved = await data.saveProfileDraft(preset.profile, undefined, false, preset.metadata)
    return Boolean(saved?.id)
  }
  const openCoffee = (tab?: CoffeeTab) => {
    const url = new URL(window.location.href)
    url.searchParams.set('page', 'coffee')
    url.searchParams.delete('profileId')
    if (tab) url.searchParams.set('tab', tab)
    else url.searchParams.delete('tab')
    window.history.pushState({ page: 'coffee' }, '', url)
    setPage(value => value + 1)
  }
  const openTurboPreset = () => { data.dismissLiveBrew(); openCoffee('presets') }
  const activeDose = Number(data.model.profiles.find(profile => profile.id === activeProfileId)?.dose)
  const activeYield = Number(data.model.profiles.find(profile => profile.id === activeProfileId)?.targetYield)
  const setActiveYield = (grams: number) => applyAdvice(activeChassis ? { kind: 'chassis', params: { ...activeChassis, targetWeight: grams } } : { kind: 'profileSettings', changes: [{ setting: 'targetYield', value: grams }] })

  let screen
  const profileId = requestedProfileId()
  const editingRecord = profileId ? data.profileRecordForEditing(profileId) : undefined
  const builderRecord = editingRecord ?? importedProfileRecord
  const creatingProfile = page === 'profile-builder' && !profileId
  if (page === 'profile-builder' && (creatingProfile || builderRecord) && !data.liveBrew.visible) screen = <ProfileBuilderScreen key={editingRecord?.id ?? (importedProfileRecord ? 'imported-profile' : 'new-profile')} initialRecord={builderRecord} existingTitles={data.allProfiles.map((profile) => profile.category ? `${profile.category} / ${profile.name}` : profile.name)} knownCategories={data.allProfiles.map((profile) => profile.category).filter((category): category is string => Boolean(category))} knownVersions={data.allProfiles.map((profile) => profile.version).filter((version): version is string => Boolean(version))} onSave={data.saveProfileDraft} onSaved={(created) => { setImportedProfileRecord(undefined); navigate('profiles', created.id) }} onClose={() => { setImportedProfileRecord(undefined); navigate('profiles', profileId) }} />
  else if (page === 'coffee' && !data.liveBrew.visible) screen = <CoffeeScreen key={new URLSearchParams(window.location.search).get('tab') ?? 'beans'} initialTab={(new URLSearchParams(window.location.search).get('tab') as CoffeeTab | null) ?? 'beans'} existingProfileTitles={data.allProfiles.map(profileTitle)} connected={data.connection === 'connected' || data.connection === 'fixture'} doseGrams={Number.isFinite(activeDose) && activeDose > 0 ? activeDose : undefined} targetYield={Number.isFinite(activeYield) && activeYield > 0 ? activeYield : undefined} onSetYield={setActiveYield} onAddPreset={addPreset} onApplyStartingRecipe={applyChassis} onClose={() => navigate('home')} />
  else if (page === 'settings' && !data.liveBrew.visible) screen = <SettingsScreen model={data.model} connection={data.connection} machineConnection={data.machineConnection} scale={data.scale} onClose={() => navigate('home')} />
  else if (page === 'profiles' && !data.liveBrew.visible) screen = <ProfilesPanel profiles={data.allProfiles} favoriteProfileSlots={data.favoriteProfileSlots} activeProfileId={data.model.activeProfileId} initialProfileId={profileId} onViewProfile={(id) => navigate('profiles', id)} editingEnabled profileEditMode={(selectedProfileId) => data.profileRecordForEditing(selectedProfileId)?.isDefault === false ? 'edit' : 'copy'} canDeleteProfile={data.profileCanBeDeleted} onDeleteProfile={async id => { await data.deleteSavedProfile(id); if (requestedProfileId() === id) { const url = new URL(window.location.href); url.searchParams.delete('profileId'); window.history.replaceState({ page: 'profiles' }, '', url); setPage(value => value + 1) } }} feedback={data.settingFeedback} onSelectProfile={async (selectedProfileId) => { const selected = await data.selectProfile(selectedProfileId); if (selected) navigate('home'); return selected }} onSetFavoriteSlot={data.setFavoriteProfileSlot} onRemoveFavorite={data.removeFavoriteProfile} onStartProfile={startProfileFromScratch} onImportProfile={editImportedProfile} onCheckVisualizer={checkVisualizerImport} onImportVisualizer={importFromVisualizer} onOpenSettings={() => navigate('settings')} onEditProfile={(selectedProfileId) => navigate('profile-builder', selectedProfileId)} onClose={() => navigate('home')} />
  else if ((page === 'insights' || page === 'previous-pull') && !data.liveBrew.visible && !data.sleepScreenActive) screen = <InsightsScreen data={insights} route={insightsRoute} navigate={navigateInsights} onClose={() => navigate('home')} />
  else screen = <AppShell historyEntry={<InsightsHome data={insights} onOpen={openInsights} onLatest={openLatestInsight}/>} coffeeEntry={<CoffeeEntry onOpen={() => openCoffee()} />} activeChassis={activeChassis} onApplyAdvice={applyAdvice} onAddTurbo={openTurboPreset} onOpenCoffee={openCoffee} {...data} onSleep={data.toggleSleep} onWake={data.wakeMachine} onStopEspresso={data.stopEspresso} onSkipBrewStage={data.skipBrewStage} onStartDemoBrew={data.startDemoBrew} onPrepareCleaning={data.prepareCleaningSequence} onCancelCleaning={data.cancelCleaningSequence} onDismissLiveBrew={data.dismissLiveBrew} onSearchScale={data.searchForScale} onConnectScale={data.connectToScale} onDismissScalePicker={data.dismissScalePicker} onTareScale={data.tareConnectedScale} onUpdateMachineSetting={data.updateMachineSetting} onUpdateProfileSetting={data.updateProfileSetting} onSelectProfile={data.selectProfile} onOpenSettings={() => navigate('settings')} onManageProfiles={() => navigate('profiles')} onOpenPreviousShot={() => navigate('previous-pull')} />

  const immersiveUiDeferred = data.liveBrew.visible || Boolean(data.utilityOperation) || data.sleepScreenActive
  return <ValueAdjustmentProvider><InteractionSound /><FullscreenPrompt defer={immersiveUiDeferred} />{screen}<DecaidUpdatePrompt defer={immersiveUiDeferred} /></ValueAdjustmentProvider>
}
