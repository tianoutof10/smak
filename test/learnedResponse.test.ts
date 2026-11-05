import assert from 'node:assert/strict'
import test from 'node:test'
import type { DialEntry } from '../src/features/beans/coffeeLibrary.ts'
import { recommendNextShot } from '../src/features/insights/dialIn.ts'
import { learnedResponse, leverSamples, sizeFromHistory } from '../src/features/insights/learnedResponse.ts'
import { DEFAULT_GEAR } from '../src/domain/gear.ts'

let minute = 0
const e = (extraction: number, grind: string, yieldGrams: number, extra: Partial<DialEntry> = {}): DialEntry => ({ key: `k${minute}`, at: new Date(Date.UTC(2026, 10, 1, 7, minute++)).toISOString(), extraction, strength: 0, finish: 'clean', dose: 18, yield: yieldGrams, grindSetting: grind, profileId: 'p', ...extra })
const clean = { analysable: true, findings: [] }

test('only pairs where one lever moved count; noise in the wrong direction is discarded', () => {
  const entries = [e(-0.8, '17', 36), e(-0.5, '16', 36), e(-0.2, '15', 36), e(-0.2, '15', 40), e(0.1, '15', 43), e(0.3, '16', 36)]
  assert.deepEqual(leverSamples(entries, 'grind').map(v => +v.toFixed(2)), [-0.3, -0.3])
  assert.deepEqual(leverSamples(entries, 'yield').map(v => +v.toFixed(2)), [0.1])
  // A temperature or dose change in between makes the pair unusable.
  assert.equal(leverSamples([e(-0.8, '17', 36), e(-0.5, '16', 36, { temperatureC: 94 })].map((x, i) => i ? x : { ...x, temperatureC: 92 }), 'grind').length, 0)
})

test('a bag with two grind changes sizes the next grind step to aim at the centre', () => {
  const bag = [e(-0.9, '17', 36), e(-0.75, '16.5', 36), e(-0.6, '16', 36)]
  const grind = learnedResponse(bag, bag, 'grind')
  assert.equal(grind?.scope, 'bag')
  assert.equal(grind?.samples, 2)
  // 0.3 per grind unit; 0.6 from the centre → 2 units → two 1-unit steps.
  const context = { dose: 18, yield: 36, grindSetting: '16', gear: { ...DEFAULT_GEAR, grindStepSize: 1 }, pace: 'fast' as const }
  const note = { extraction: -0.6, strength: 0, finish: 'clean' as const }
  const sized = sizeFromHistory(recommendNextShot(note, clean, context), note.extraction, context, { grind })
  assert.equal(sized.steps, 2)
  assert.equal(sized.advice.primary.kind === 'grindFiner' && sized.advice.primary.toSetting, 14)
})

test('steps are capped at three and never below one', () => {
  const bag = [e(-0.9, '17', 36), e(-0.85, '16.5', 36), e(-0.8, '16', 36)].map((x, i) => ({ ...x, extraction: -0.9 + i * 0.09 }))
  const grind = learnedResponse(bag, bag, 'grind')!
  const context = { dose: 18, yield: 36, grindSetting: '16', gear: { ...DEFAULT_GEAR, grindStepSize: 0.5 }, pace: 'fast' as const }
  const note = { extraction: -0.9, strength: 0, finish: 'clean' as const }
  const sized = sizeFromHistory(recommendNextShot(note, clean, context), note.extraction, context, { grind })
  assert.equal(sized.steps, 3)
  assert.equal(sized.advice.primary.kind === 'grindFiner' && sized.advice.primary.toSetting, 14.5)
})

test('yield steps are sized in grams from your own response, up to 8 g', () => {
  const bag = [e(-0.6, '17', 36), e(-0.4, '17', 40), e(-0.2, '17', 44)]
  const response = learnedResponse(bag, bag, 'yield')!
  assert.equal(+response.slope.toFixed(2), 0.05)
  const context = { dose: 18, yield: 36, grindSetting: '17', pace: 'normal' as const }
  const note = { extraction: -0.45, strength: 0, finish: 'clean' as const }
  const sized = sizeFromHistory(recommendNextShot(note, clean, context), note.extraction, context, { yield: response })
  assert.equal(sized.advice.primary.kind === 'longerYield' && sized.advice.primary.toGrams, 44, '0.45 ÷ 0.05 = 9 g, capped at 8')
})

test('with too little history the rule-based step is left alone; pooled history is the fallback', () => {
  const bag = [e(-0.9, '17', 36), e(-0.75, '16', 36)]
  const others = [e(-0.9, '20', 36, { key: 'o1' }), e(-0.6, '19', 36, { key: 'o2' }), e(-0.3, '18', 36, { key: 'o3' })]
  assert.equal(learnedResponse(bag, bag, 'grind'), undefined)
  assert.equal(learnedResponse(bag, [...bag, ...others], 'grind')?.scope, 'all')
})
