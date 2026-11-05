import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { LiveShotPoint } from '../src/domain/brewing.ts'
import { DEFAULT_GEAR } from '../src/domain/gear.ts'
import { restState } from '../src/domain/rest.ts'
import { BASELINE, paceAgainstBaseline, shotPace } from '../src/domain/shotPace.ts'
import { analyseShot } from '../src/domain/shotAnalysis.ts'
import { coffeeUpdates, normalizeLibrary, type CoffeeLibrary, type DialEntry } from '../src/features/beans/coffeeLibrary.ts'
import { driftAdvice, journeyFor, recipeForBean, recipeFromEntry } from '../src/features/beans/dialJourney.ts'

const now = new Date(2026, 9, 25, 9)
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
const empty = normalizeLibrary({})
const withBean = (library: CoffeeLibrary, name: string, extra: Record<string, unknown> = {}) => coffeeUpdates.addBean(library, { name, tastingNotes: [], ...extra }, now)
const entry = (key: string, extraction: number, strength: number, minutes: number, extra: Partial<DialEntry> = {}): DialEntry => ({ key, at: new Date(now.getTime() + minutes * 60_000).toISOString(), extraction, strength, finish: 'clean', ...extra })

test('rest: light roasts are "too fresh" for a week and peak from two weeks; no date, no guess', () => {
  assert.equal(restState({ roastDate: daysAgo(5), roastLevel: 'light' }, now)?.phase, 'tooFresh')
  assert.equal(restState({ roastDate: daysAgo(5), roastLevel: 'light' }, now)?.daysToPeak, 9)
  assert.equal(restState({ roastDate: daysAgo(10), roastLevel: 'light' }, now)?.phase, 'opening')
  assert.equal(restState({ roastDate: daysAgo(20), roastLevel: 'light' }, now)?.phase, 'peak')
  assert.equal(restState({ roastDate: daysAgo(25), roastLevel: 'dark' }, now)?.phase, 'fading')
  assert.equal(restState({ roastDate: daysAgo(6) }, now)?.roast, 'medium')
  assert.equal(restState({}, now), undefined)
})

test('pace: weight flow after first drops decides fast / normal / slow', () => {
  const shot = (gramsPerSecond: number): LiveShotPoint[] => Array.from({ length: 151 }, (_, i) => ({ elapsedMs: i * 200, pressure: 9, flow: 2, weight: Math.max(0, (i * 0.2 - 6) * gramsPerSecond) }))
  assert.equal(shotPace(shot(3))?.pace, 'fast')
  assert.equal(shotPace(shot(1.6))?.pace, 'normal')
  assert.equal(shotPace(shot(0.8))?.pace, 'slow')
  assert.equal(shotPace([]), undefined)
})

test('pace: a real shot recorded without a scale has no pace, so advice falls back to taste alone', async () => {
  const { shotToDomain } = await import('../src/api/decaid/adapters.ts')
  const record = JSON.parse(readFileSync(new URL('./fixtures/real-shot-lrv3.json', import.meta.url), 'utf8'))
  const points = shotToDomain(record).points ?? []
  assert.ok(points.length > 100)
  assert.equal(shotPace(points, analyseShot(points)), undefined)
})

test('journey: two shots in a row on target means stop, this is the recipe', () => {
  let { library, bean } = withBean(empty, 'Guji')
  library = coffeeUpdates.recordTasting(library, bean.id, entry('a', -0.7, -0.5, 0))
  assert.equal(journeyFor(library, bean.id).status, 'started')
  library = coffeeUpdates.recordTasting(library, bean.id, entry('b', -0.4, -0.2, 5))
  assert.equal(journeyFor(library, bean.id).status, 'converging')
  library = coffeeUpdates.recordTasting(library, bean.id, entry('c', 0.1, 0, 10))
  library = coffeeUpdates.recordTasting(library, bean.id, entry('d', -0.05, 0.1, 15))
  const journey = journeyFor(library, bean.id)
  assert.equal(journey.status, 'dialedIn')
  assert.equal(journey.dialedInAt, 3)
})

test('journey: re-tasting a shot replaces it, and entries survive a storage round trip', () => {
  let { library, bean } = withBean(empty, 'Guji')
  library = coffeeUpdates.recordTasting(library, bean.id, entry('a', -0.7, 0, 0))
  library = coffeeUpdates.recordTasting(library, bean.id, entry('a', 0.2, 0, 0, { grindSetting: '11', pace: 'fast' }))
  const restored = normalizeLibrary(JSON.parse(JSON.stringify(library)))
  assert.equal(restored.dialLog[bean.id].length, 1)
  assert.equal(restored.dialLog[bean.id][0].extraction, 0.2)
  assert.equal(restored.dialLog[bean.id][0].pace, 'fast')
})

test('the next bag of the same coffee starts from the last pinned recipe', () => {
  let { library, bean: first } = withBean(empty, 'Kiambu AA', { roaster: 'Review Roasters' })
  library = coffeeUpdates.pinRecipe(library, first.id, recipeFromEntry(entry('a', 0, 0, 0, { dose: 18, yield: 40, grindSetting: '11.5' })), now)
  assert.equal(recipeForBean(library, first)?.source, 'pinned')
  const second = withBean(library, ' kiambu aa ', { roaster: 'review roasters' })
  const carried = recipeForBean(second.library, second.bean)
  assert.equal(carried?.source, 'previousBag')
  assert.equal(carried?.recipe.grindSetting, '11.5')
  const other = withBean(second.library, 'Something else')
  assert.equal(recipeForBean(other.library, other.bean), undefined)
})

test('drift: ten days after pinning an aged bag, suggest one step finer', () => {
  const bean = { id: 'b', name: 'Guji', tastingNotes: [], createdAt: '', roastDate: daysAgo(30) }
  const pinned = { pinnedAt: new Date(now.getTime() - 12 * 86_400_000).toISOString(), grindSetting: '12' }
  assert.deepEqual(driftAdvice(bean, pinned, { ...DEFAULT_GEAR, grindStepSize: 0.5 }, now), { daysSincePin: 12, toSetting: 11.5, fromSetting: '12' })
  assert.equal(driftAdvice(bean, { ...pinned, pinnedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString() }, DEFAULT_GEAR, now), undefined)
})

test('pace against your own baseline: ±20 % of the profile median, calibrated on an 89-shot history', () => {
  const reading = (gramsPerSecond: number) => ({ pace: 'normal' as const, gramsPerSecond, contactMs: 20_000 })
  const history = [1.6, 1.7, 1.65, 1.75, 1.6, 1.7, 1.8, 1.55]
  assert.equal(paceAgainstBaseline(reading(1.9), history)?.pace, 'normal', 'within ordinary prep noise')
  assert.equal(paceAgainstBaseline(reading(2.1), history)?.pace, 'fast')
  assert.equal(paceAgainstBaseline(reading(1.3), history)?.pace, 'slow')
  assert.equal(paceAgainstBaseline(reading(2.1), history)?.baseline?.shots, 8)
  // Too little history: the absolute thresholds stand.
  assert.equal(paceAgainstBaseline(reading(2.1), history.slice(0, BASELINE.minimumShots - 1))?.baseline, undefined)
  // A real stall stays slow whatever the baseline.
  assert.equal(paceAgainstBaseline({ pace: 'slow', gramsPerSecond: 0.9, contactMs: 30_000 }, [0.95, 1, 0.9, 1, 0.95, 1, 0.9, 1])?.pace, 'slow')
})
