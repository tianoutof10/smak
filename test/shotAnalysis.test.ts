import assert from 'node:assert/strict'
import test from 'node:test'
import type { LiveShotPoint } from '../src/domain/brewing.ts'
import { analyseShot, puckResistance } from '../src/domain/shotAnalysis.ts'
import { demoShotPoints } from '../src/fixtures/brewingFixture.ts'

/** Builds a shot sampled every `stepMs`, using a per-time generator. */
function shot(durationMs: number, stepMs: number, at: (seconds: number) => Partial<LiveShotPoint>): LiveShotPoint[] {
  const points: LiveShotPoint[] = []
  let weight = 0
  for (let elapsedMs = 0; elapsedMs <= durationMs; elapsedMs += stepMs) {
    const sample = at(elapsedMs / 1000)
    const flow = sample.flow ?? 0
    if (elapsedMs / 1000 > 6) weight += flow * stepMs / 1000 * 0.9
    points.push({ elapsedMs, stageIndex: 0, weight, ...sample })
  }
  return points
}

/** A clean pressure-profiled 9 bar shot whose puck erodes gradually. */
const cleanNineBar = (seconds: number): Partial<LiveShotPoint> => seconds < 6
  ? { pressure: seconds * 1.5, flow: 3, targetPressure: 9, targetFlow: 0, stageIndex: 0 }
  : { pressure: 9, flow: 1.6 + (seconds - 6) * 0.04, targetPressure: 9, targetFlow: 0, stageIndex: 1 }

test('puck resistance follows Decent: pressure divided by flow squared', () => {
  assert.equal(puckResistance({ pressure: 9, flow: 2 }), 2.25)
  assert.equal(puckResistance({ pressure: 9, flow: 0.2 }), undefined, 'low-flow bloom samples are undefined')
  assert.equal(puckResistance({ pressure: 0.5, flow: 3 }), undefined, 'unpressurised samples are undefined')
})

test('a clean, gradually eroding shot produces no findings and a steady breakdown', () => {
  const analysis = analyseShot(shot(30_000, 200, cleanNineBar))
  assert.equal(analysis.analysable, true)
  assert.deepEqual(analysis.findings, [])
  assert.equal(analysis.breakdown, 'steady')
  assert.ok(analysis.resistanceDecline! > 0.3)
})

test('an abrupt flow surge at constant pressure is reported once as a strong resistance drop', () => {
  const analysis = analyseShot(shot(32_000, 200, seconds => seconds < 16 ? cleanNineBar(seconds) : { ...cleanNineBar(seconds), flow: 3 }))
  assert.equal(analysis.findings.length, 1)
  const [finding] = analysis.findings
  assert.equal(finding.kind, 'suddenResistanceDrop')
  if (finding.kind !== 'suddenResistanceDrop') return
  assert.equal(finding.severity, 'strong')
  assert.ok(Math.abs(finding.atMs - 16_000) <= 800, `reported at ${finding.atMs}`)
  assert.equal(finding.phase, 'late')
  assert.equal(analysis.breakdown, 'uneven', 'a sudden drop is never reported as a steady breakdown')
})

test('detection does not depend on the telemetry sample rate', () => {
  const surge = (seconds: number) => seconds < 12 ? cleanNineBar(seconds) : { ...cleanNineBar(seconds), flow: 3 }
  for (const stepMs of [100, 250, 500]) {
    const found = analyseShot(shot(30_000, stepMs, surge)).findings.filter(finding => finding.kind === 'suddenResistanceDrop')
    assert.equal(found.length, 1, `step ${stepMs}ms`)
  }
})

test('a single noisy sample is not reported without confirmation', () => {
  const analysis = analyseShot(shot(30_000, 200, seconds => Math.abs(seconds - 15) < 0.1 ? { ...cleanNineBar(seconds), flow: 3.2 } : cleanNineBar(seconds)))
  assert.deepEqual(analysis.findings, [])
})

test('profile-commanded pressure declines are not mistaken for channels', () => {
  const analysis = analyseShot(shot(30_000, 200, seconds => {
    const base = cleanNineBar(seconds)
    if (seconds < 15) return base
    const pressure = seconds < 16 ? 9 - (seconds - 15) * 3 : 6
    return { ...base, pressure, targetPressure: pressure }
  }))
  assert.equal(analysis.findings.some(finding => finding.kind === 'suddenResistanceDrop'), false)
})

test('drops at a stage transition are ignored', () => {
  const analysis = analyseShot(shot(30_000, 200, seconds => seconds < 15 ? cleanNineBar(seconds) : { ...cleanNineBar(seconds), flow: 3, stageIndex: 2 }))
  assert.equal(analysis.findings.some(finding => finding.kind === 'suddenResistanceDrop'), false)
})

test('drops in the final two seconds are ignored as shot-end settling', () => {
  const analysis = analyseShot(shot(30_000, 200, seconds => seconds < 29 ? cleanNineBar(seconds) : { ...cleanNineBar(seconds), flow: 3.5 }))
  assert.deepEqual(analysis.findings, [])
})

test('sustained high pressure with almost no flow is reported as choked flow', () => {
  const analysis = analyseShot(shot(30_000, 250, seconds => seconds < 6 ? cleanNineBar(seconds) : { pressure: 9.2, flow: 0.35, targetPressure: 9, targetFlow: 0, stageIndex: 1, weightFlow: 0.3 }))
  const choked = analysis.findings.find(finding => finding.kind === 'chokedFlow')
  assert.ok(choked)
  if (choked?.kind === 'chokedFlow') assert.ok(choked.durationMs >= 20_000)
})

test('a bloom pause is not choked flow and creates no resistance samples', () => {
  const analysis = analyseShot(shot(40_000, 250, seconds => {
    if (seconds < 6) return { pressure: seconds * 0.6, flow: 4, targetFlow: 4, stageIndex: 0 }
    if (seconds < 20) return { pressure: 2, flow: 0.1, targetFlow: 0, stageIndex: 1 }
    return { pressure: 8, flow: 2.2, targetPressure: 8, stageIndex: 2 }
  }))
  assert.equal(analysis.findings.some(finding => finding.kind === 'chokedFlow'), false)
  assert.equal(analysis.resistance.some(sample => sample.elapsedMs > 6_500 && sample.elapsedMs < 20_000), false)
})

test("the earlier Gemini prototype's simulated clean shot no longer raises false channel alarms", () => {
  const points: LiveShotPoint[] = []
  for (let elapsed = 0; elapsed < 25; elapsed += 0.1) {
    points.push({
      elapsedMs: Math.round(elapsed * 1000),
      pressure: elapsed < 5 ? elapsed * 1.5 : elapsed < 15 ? 8 : 8 - (elapsed - 15) * 0.2,
      flow: elapsed < 5 ? 0 : 2.0 + ((Math.round(elapsed * 10) * 7919) % 20) / 100,
    })
  }
  assert.deepEqual(analyseShot(points).findings, [])
})

test('the bundled demo shot analyses without findings', () => {
  const analysis = analyseShot(demoShotPoints)
  assert.equal(analysis.analysable, true)
  assert.deepEqual(analysis.findings, [])
  assert.equal(analysis.firstDropsMs, 8_000)
})

test('shots without pressurised flow are not analysable', () => {
  assert.equal(analyseShot([]).analysable, false)
  assert.equal(analyseShot(shot(10_000, 250, () => ({ pressure: 0.5, flow: 4 }))).analysable, false)
})

test('a real LRv3 shot (Londinium-style, public Decent share) reads as clean and steady', async () => {
  const { readFileSync } = await import('node:fs')
  const { shotToDomain } = await import('../src/api/decaid/adapters.ts')
  const record = JSON.parse(readFileSync(new URL('./fixtures/real-shot-lrv3.json', import.meta.url), 'utf8'))
  const analysis = analyseShot(shotToDomain(record).points ?? [])
  assert.deepEqual(analysis.findings, [], 'no channel or stall on a clean real shot')
  assert.ok(analysis.mainExtractionAtMs! > 14_000 && analysis.mainExtractionAtMs! < 16_500, 'shape is measured after the 3 bar infusion')
  assert.ok(analysis.peakResistance! > 2 && analysis.peakResistance! < 2.6)
  assert.ok(analysis.peakResistanceAtMs! > 18_000)
  assert.notEqual(analysis.breakdown, 'uneven')
})
