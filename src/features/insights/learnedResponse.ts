import { clampChassis } from '../../domain/chassis.ts'
import type { DialEntry } from '../beans/coffeeLibrary.ts'
import { TASTE_ZONES, type DialInAdvice, type DialInStep, type ShotContext } from './dialIn.ts'

/**
 * How much one change actually moved *your* cup.
 *
 * From consecutive tastings where exactly one lever changed (grind, or yield),
 * the slope is Δextraction per grind unit or per gram. The median of at least
 * two such pairs sizes the next step so it aims at the centre instead of
 * nudging by a fixed amount. This bag's pairs are used first; with fewer than
 * two, pairs from all bags (same grinder and machine) are pooled.
 */
export type Lever = 'grind' | 'yield'

export interface LeverResponse {
  lever: Lever
  /** Δextraction (taste-square units, −1…1) per grind unit, or per gram of yield. */
  slope: number
  samples: number
  scope: 'bag' | 'all'
}

export const LEARNING = {
  minimumSamples: 2,
  yieldChangeGrams: 1.5,
  temperatureChangeC: 0.5,
  /** Changes smaller than this barely register on the palate: ignore the pair. */
  minimumTasteMove: 0.08,
  maxGrindSteps: 3,
  maxYieldChangeGrams: 8,
} as const

const num = (value: string | number | undefined) => { const parsed = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) && String(value ?? '').trim() !== '' ? parsed : undefined }
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 }

/** Slopes from consecutive pairs where one lever moved and the others held. */
export function leverSamples(entries: DialEntry[], lever: Lever): number[] {
  const ordered = [...entries].sort((left, right) => left.at.localeCompare(right.at))
  const slopes: number[] = []
  for (let index = 1; index < ordered.length; index++) {
    const before = ordered[index - 1], after = ordered[index]
    if (before.profileId && after.profileId && before.profileId !== after.profileId) continue
    if (before.finish === 'drying' || after.finish === 'drying') continue
    const grindBefore = num(before.grindSetting), grindAfter = num(after.grindSetting)
    const grindMoved = grindBefore !== undefined && grindAfter !== undefined && grindBefore !== grindAfter
    const yieldMoved = before.yield !== undefined && after.yield !== undefined && Math.abs(after.yield - before.yield) >= LEARNING.yieldChangeGrams
    const temperatureMoved = before.temperatureC !== undefined && after.temperatureC !== undefined && Math.abs(after.temperatureC - before.temperatureC) >= LEARNING.temperatureChangeC
    const doseMoved = before.dose !== undefined && after.dose !== undefined && before.dose !== after.dose
    if (doseMoved || temperatureMoved) continue
    const move = after.extraction - before.extraction
    if (Math.abs(move) < LEARNING.minimumTasteMove) continue
    if (lever === 'grind' && grindMoved && !yieldMoved) slopes.push(move / (grindAfter! - grindBefore!))
    if (lever === 'yield' && yieldMoved && !grindMoved) slopes.push(move / (after.yield! - before.yield!))
  }
  // Finer (lower number) should raise extraction; longer yield should too. Discard pairs that say otherwise: noise.
  return slopes.filter(slope => lever === 'grind' ? slope < 0 : slope > 0)
}

export function learnedResponse(bagEntries: DialEntry[], allEntries: DialEntry[], lever: Lever): LeverResponse | undefined {
  const bag = leverSamples(bagEntries, lever)
  if (bag.length >= LEARNING.minimumSamples) return { lever, slope: median(bag), samples: bag.length, scope: 'bag' }
  const pooled = leverSamples(allEntries, lever)
  if (pooled.length >= LEARNING.minimumSamples) return { lever, slope: median(pooled), samples: pooled.length, scope: 'all' }
  return undefined
}

export interface SizedAdvice { advice: DialInAdvice; learned?: LeverResponse; steps?: number }

/**
 * Resizes a grind or yield step so it aims at the centre of the square, using
 * what this barista's own shots say one unit does. Leaves every other step,
 * and anything without enough history, exactly as the rules gave it.
 */
export function sizeFromHistory(advice: DialInAdvice, extraction: number, context: ShotContext, responses: { grind?: LeverResponse; yield?: LeverResponse }): SizedAdvice {
  const step = advice.primary
  if (Math.abs(extraction) <= TASTE_ZONES.balanced) return { advice }
  if ((step.kind === 'grindFiner' || step.kind === 'grindCoarser') && responses.grind && step.grindSetting && step.toSetting !== undefined) {
    const from = num(step.grindSetting)!
    const unit = Math.abs(step.toSetting - from) || 1
    const units = Math.abs(-extraction / responses.grind.slope)
    const steps = Math.max(1, Math.min(LEARNING.maxGrindSteps, Math.round(units / unit)))
    if (steps === 1) return { advice, learned: responses.grind, steps }
    const direction = step.kind === 'grindFiner' ? -1 : 1
    const decimals = Math.max((String(unit).split('.')[1] ?? '').length, (step.grindSetting.split('.')[1] ?? '').length)
    const toSetting = Math.max(0, Number((from + direction * steps * unit).toFixed(decimals)))
    const primary: DialInStep = { ...step, toSetting, steps, apply: { kind: 'profileSettings', changes: [{ setting: 'grindSetting', value: toSetting }] } }
    return { advice: { ...advice, primary }, learned: responses.grind, steps }
  }
  if ((step.kind === 'longerYield' || step.kind === 'shorterYield') && responses.yield && step.fromGrams !== undefined && step.toGrams !== undefined) {
    const grams = Math.min(LEARNING.maxYieldChangeGrams, Math.max(1, Math.round(Math.abs(-extraction / responses.yield.slope))))
    const direction = step.kind === 'longerYield' ? 1 : -1
    const toGrams = Math.max(1, step.fromGrams + direction * grams)
    const toRatio = context.dose ? Math.round((toGrams / context.dose) * 10) / 10 : undefined
    const apply = context.chassis ? { kind: 'chassis' as const, params: clampChassis({ ...context.chassis, targetWeight: toGrams }) } : { kind: 'profileSettings' as const, changes: [{ setting: 'targetYield' as const, value: toGrams }] }
    const primary: DialInStep = { ...step, toGrams, ...(toRatio !== undefined ? { toRatio } : {}), apply }
    return { advice: { ...advice, primary }, learned: responses.yield }
  }
  return { advice }
}
