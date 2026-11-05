import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DEFAULT_SMAK_PREFERENCES, normalizeSmakPreferences } from '../src/features/settings/smakPreferences.ts'

test('Smak preferences preserve the released defaults', () => {
  assert.deepEqual(normalizeSmakPreferences(undefined), DEFAULT_SMAK_PREFERENCES)
})

test('screensaver brightness defaults to 7 but preserves user choices across the full range', () => {
  assert.equal(normalizeSmakPreferences({}).screensaverBrightness, 7)
  for (const value of [0, 3, 7, 45, 100]) {
    assert.equal(normalizeSmakPreferences({ screensaverBrightness: value }).screensaverBrightness, value)
  }
  assert.equal(normalizeSmakPreferences({ screensaverBrightness: NaN }).screensaverBrightness, 7)
  assert.equal(normalizeSmakPreferences({ screensaverBrightness: 120 }).screensaverBrightness, 100)
  const source = readFileSync(new URL('../src/features/brew/useBrewingData.ts', import.meta.url), 'utf8')
  assert.match(source, /displayBrightness.dim\(readSmakPreferences\(\).screensaverBrightness\)/)
})

test('screensaver screen-off delay defaults to disabled, clamps to the hour and rounds', () => {
  assert.equal(normalizeSmakPreferences({}).screensaverScreenOffDelaySeconds, 0)
  for (const value of [15, 300, 3_600]) {
    assert.equal(normalizeSmakPreferences({ screensaverScreenOffDelaySeconds: value }).screensaverScreenOffDelaySeconds, value)
  }
  assert.equal(normalizeSmakPreferences({ screensaverScreenOffDelaySeconds: NaN }).screensaverScreenOffDelaySeconds, 0)
  assert.equal(normalizeSmakPreferences({ screensaverScreenOffDelaySeconds: 9_000 }).screensaverScreenOffDelaySeconds, 3_600)
  assert.equal(normalizeSmakPreferences({ screensaverScreenOffDelaySeconds: -5 }).screensaverScreenOffDelaySeconds, 0)
  assert.equal(normalizeSmakPreferences({ screensaverScreenOffDelaySeconds: 90.6 }).screensaverScreenOffDelaySeconds, 91)
})

test('water warning preferences remain ordered and within the reservoir control range', () => {
  assert.deepEqual(normalizeSmakPreferences({ waterCriticalLevelMl: 500, waterWarningLevelMl: 100 }), {
    theme: 'nordic',
    completionSoundEnabled: true,
    animationsEnabled: true,
    waterCriticalLevelMl: 500,
    waterWarningLevelMl: 501,
    chartLineWeight: 'fine',
    temperatureUnit: 'C',
    clockFormat: 'device',
    screensaverBrightness: 7,
    screensaverScreenOffDelaySeconds: 0,
    language: 'auto',
    liveView: 'calm',
    homeView: 'today',
  })
  const maximum = normalizeSmakPreferences({ waterCriticalLevelMl: 9_000, waterWarningLevelMl: 9_000 })
  assert.equal(maximum.waterCriticalLevelMl, 1_999)
  assert.equal(maximum.waterWarningLevelMl, 2_000)
})

test('settings are routed inside Smak and expose real preference controls', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const screen = readFileSync(new URL('../src/features/settings/SettingsScreen.tsx', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8')
  assert.match(app, /navigate\('settings'\)/)
  assert.match(screen, /completionSoundEnabled/)
  assert.match(screen, /waterWarningLevelMl/)
  assert.match(screen, /chartLineWeight/)
  assert.match(screen, /temperatureUnit/)
  assert.match(styles, /data-chart-line-weight="bold"/)
})

test('unified settings use Decaid domains instead of delegating to a second settings page', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const screen = readFileSync(new URL('../src/features/settings/SettingsScreen.tsx', import.meta.url), 'utf8')
  const state = readFileSync(new URL('../src/features/settings/useUnifiedSettings.ts', import.meta.url), 'utf8')
  const client = readFileSync(new URL('../src/api/decaid/client.ts', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8')

  assert.doesNotMatch(app, /getDecaidSettingsUrl/)
  assert.doesNotMatch(screen, /Open Decaid controls/)
  assert.match(state, /getSettings\(\), getMachineSettings\(\), getAdvancedMachineSettings\(\), getWorkflow\(\), getDisplayState\(\)/)
  assert.match(state, /if \(Object\.keys\(rea\)\.length\) await updateSettings\(rea\)/)
  assert.match(state, /if \(Object\.keys\(machine\)\.length\) await updateMachineSettings\(machine\)/)
  assert.match(state, /if \(Object\.keys\(workflow\)\.length\) await hotWaterSettings\.save\(workflow\)/)
  assert.match(client, /body\.usb = patch\.usb \? 'enable' : 'disable'/)
  assert.match(client, /getMachineSettings = \(\) => getJson<DecaidMachineSettings>\('\/machine\/settings', 20000\)/)
  assert.doesNotMatch(screen, /label="Stop using scale"/)
  const brewing = readFileSync(new URL('../src/features/brew/useBrewingData.ts', import.meta.url), 'utf8')
  assert.match(brewing, /const patch = hotWaterWeightStoppingPatch\(current\)/)
  assert.match(screen, /scalePowerMode/)
  assert.match(screen, /sleepTimeoutMinutes/)
  assert.match(screen, /automaticUpdateCheck/)
  assert.match(screen, /SETTINGS_PROTOCOL/)
  assert.match(screen, /useValueAdjustment\(\)/)
  assert.match(screen, /className="settings-number-value"/)
  assert.match(screen, /suggestionKey: key/)
  assert.match(screen, /settings\.draft\.workflow\.rinseData/)
  assert.match(screen, /label=\{t\('settings\.prepare\.espressoYield'\)\}/)
  assert.match(screen, /label=\{t\('settings\.prepare\.hotWaterYield'\)\}/)
  assert.match(screen, /label=\{t\('common\.metric\.volume'\)\} hint=\{t\('settings\.prepare\.volumeHint'\)\}/)
  assert.match(screen, /startRoutine\('descaling'/)
  assert.match(screen, /startRoutine\('airPurge'/)
  assert.match(client, /'descaling' \| 'airPurge'/)
  assert.match(styles, /flex:0 0 38px/)
  assert.match(styles, /\.settings-brand button\{width:42px;height:42px;aspect-ratio:1;[^}]*flex:0 0 42px;[^}]*border-radius:50%/)
  assert.match(styles, /\.settings-toggle span\{width:18px;height:18px;border-radius:50%\}/)
  assert.doesNotMatch(screen, /patchMachine\(\{ flushTemp \}\)/)
})

test('immediate settings actions preserve unrelated unsaved drafts', () => {
  const state = readFileSync(new URL('../src/features/settings/useUnifiedSettings.ts', import.meta.url), 'utf8')
  assert.match(state, /Refresh only the domain changed by this immediate action/)
  assert.match(state, /scanForDevices\(\), refreshDevices/)
  assert.match(state, /enablePlugin\(id, next\), refreshPlugins/)
  assert.match(state, /createWakeSchedule\(schedule\), refreshPresence/)
  assert.match(state, /presence: \{\s*\.\.\.current\.presence,\s*schedules: presence\.schedules/s)
})

test('the live view preference defaults to the morning view and accepts only known layouts', () => {
  assert.equal(DEFAULT_SMAK_PREFERENCES.liveView, 'calm')
  assert.equal(normalizeSmakPreferences({ liveView: 'chart' }).liveView, 'chart')
  assert.equal(normalizeSmakPreferences({ liveView: 'ring' }).liveView, 'calm')
})
