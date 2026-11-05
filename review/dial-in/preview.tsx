import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LiveBrewingScreen } from '../../src/features/brew/LiveBrewingScreen'
import { PreviousShotScreen } from '../../src/features/history/PreviousShotScreen'
import { writeSmakPreferences } from '../../src/features/settings/smakPreferences'
import { CoffeeScreen } from '../../src/features/beans/CoffeeScreen'
import { coffeeUpdates, readCoffeeLibrary } from '../../src/features/beans/coffeeLibrary'
import { getDecaidEndpoints } from '../../src/api/decaid/config'
import { brewingFixture } from '../../src/fixtures/brewingFixture'
import type { LiveBrewState, LiveShotPoint, PreviousShot } from '../../src/domain/brewing'
import '../../src/styles/index.css'
import '../../src/styles/cardSurfaces.css'
import '../../src/styles/lightMode.css'
import './preview.css'
import '@fontsource-variable/inter'
import '../../src/styles/nordicAccents.css'
import '../../src/styles/nordic.css'
import '../../src/features/beans/coffee.css'

// Labelled sample data: a 9 bar pressure-profiled shot sampled at 5 Hz whose
// flow surges at 17 s (a deliberate channel), so the analysis has something to show.
const origin = Date.parse('2026-10-24T07:00:00Z')
let weight = 0
const points: LiveShotPoint[] = Array.from({ length: 151 }, (_, i) => {
  const seconds = i / 5
  const stageIndex = seconds < 7 ? 0 : seconds < 26 ? 1 : 2
  const pressure = seconds < 7 ? seconds * 1.3 : stageIndex === 1 ? 9 : 9 - (seconds - 26) * 0.9
  const flow = seconds < 7 ? 3.6 - seconds * 0.2 : seconds < 17 ? 1.5 + (seconds - 7) * 0.05 : 2.9
  if (seconds > 6) weight += flow * 0.2 * 0.7
  return { elapsedMs: i * 200, stageIndex, stageName: ['Fill', 'Extraction', 'Decline'][stageIndex], pressure, flow, targetPressure: stageIndex === 2 ? pressure : 9, targetFlow: 0, temperature: 92.5 + Math.sin(i / 9) * 0.2, weight, weightFlow: seconds > 6 ? flow * 0.92 : 0 }
})
const profile = { ...brewingFixture.profiles[0], dose: '18', targetYield: '42', grindSetting: '11' }
const model = { ...brewingFixture, profiles: [profile, ...brewingFixture.profiles.slice(1)], activeProfileId: profile.id }
const base: LiveBrewState = { active: true, visible: true, startedAt: origin, telemetryStartedAt: origin, elapsedMs: 30_000, points, profileName: 'Dial-in review · sample shot', targetYield: 42, kind: 'espresso' }
const shot: PreviousShot = { id: 'dial-in-review', timestamp: new Date(origin).toISOString(), profileName: base.profileName!, totalTime: '30', totalYield: weight.toFixed(1), dose: 18, grindSetting: '11', points, stopReason: 'targetWeight' }

// Labelled sample bean so the morning view can show "the coffee currently loaded".
try {
  if (!readCoffeeLibrary().beans.length) {
    const roast = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10)
    const { library } = coffeeUpdates.addBean(readCoffeeLibrary(), { name: 'Sample · Ethiopia Guji', roaster: 'Review Roasters', origin: 'Ethiopia', process: 'Washed', roastLevel: 'light', roastDate: roast, altitudeMasl: 2000, tastingNotes: ['jasmine', 'peach'] })
    localStorage.setItem(`smak-coffee-v1:${getDecaidEndpoints().apiBase}`, JSON.stringify(library))
  }
} catch { /* review only */ }

// A blooming shot in its sealed soak, for the morning view's soak state.
const soakPoints: LiveShotPoint[] = Array.from({ length: 61 }, (_, i) => {
  const seconds = i / 5
  const filling = seconds < 5
  return { elapsedMs: i * 200, stageIndex: filling ? 0 : 1, stageName: filling ? 'Fill' : 'Bloom', pressure: filling ? seconds * 0.8 : Math.max(1.2, 4 - (seconds - 5) * 0.25), flow: filling ? 4 : 0, targetFlow: filling ? 4 : 0, targetPressure: 0, weight: filling ? 0 : Math.min(1.5, (seconds - 5) * 0.2) }
})

function Review() {
  const [view, setView] = useState<'calm' | 'soak' | 'finished' | 'history' | 'coffee'>('calm')
  const [light, setLight] = useState(false)
  const show = (next: typeof view) => { if (next === 'calm' || next === 'soak') writeSmakPreferences({ liveView: 'calm' }); setView(next) }
  const progress = { ...base, elapsedMs: 21_000, points: points.slice(0, 106) }
  return <>
    <nav className="stage-review-nav" aria-label="Review controls">
      <span>Sample data · no machine commands</span>
      <button onClick={() => show('calm')}>Morning view</button><button onClick={() => show('soak')}>Soak</button><button onClick={() => show('finished')}>Finished pull</button><button onClick={() => show('history')}>History</button><button onClick={() => show('coffee')}>Coffee</button>
      <button onClick={() => { document.documentElement.dataset.theme = light ? 'nordic' : 'light'; setLight(!light) }}>{light ? 'Dark' : 'Light'} mode</button>
    </nav>
    <div className="stage-review-body">{view === 'coffee'
      ? <CoffeeScreen existingProfileTitles={[]} connected doseGrams={18} onAddPreset={async () => true} onApplyStartingRecipe={async () => true} onClose={() => setView('calm')} />
      : view === 'soak'
      ? <LiveBrewingScreen model={model} liveBrew={{ ...base, profileName: 'Research / Blooming Espresso', elapsedMs: 12_000, points: soakPoints }} stopPending={false} skipPending={false} actionError={null} onStop={() => setView('finished')} onSkipStage={async () => false} onDismiss={() => setView('history')} />
      : view === 'history'
      ? <PreviousShotScreen shots={[shot]} initialShot={shot} status="loaded" layout="detail" onSelectShot={async () => shot} onDismiss={() => setView('calm')} />
      : <LiveBrewingScreen model={model} liveBrew={view === 'calm' ? progress : { ...base, active: false }} stopPending={false} skipPending={false} actionError={null} onStop={() => setView('finished')} onSkipStage={async () => false} onDismiss={() => setView('history')} onApplyAdvice={async () => true} onAddTurbo={() => setView('coffee')} />}
    </div>
  </>
}
document.documentElement.dataset.theme = 'nordic'
createRoot(document.getElementById('root')!).render(<Review />)
