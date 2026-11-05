import type { ShotAnalysis } from '../../domain/shotAnalysis.ts'
import { hasFinding } from '../../domain/shotAnalysis.ts'
import type { ChassisParams } from '../../domain/chassis.ts'
import { clampChassis } from '../../domain/chassis.ts'
import { nextGrindSetting, waterIsHighlyBuffered, type GearSetup } from '../../domain/gear.ts'
import type { ShotPace } from '../../domain/shotPace.ts'
import type { RestPhase } from '../../domain/rest.ts'

/**
 * Taste-first dial-in on the brewing control chart.
 *
 * The cup is one tap on a square: extraction across (sour −1 … +1 bitter) and
 * strength up and down (weak −1 … +1 strong), plus whether the finish dried the
 * mouth. Extraction and strength need different fixes, so they stay separate.
 * Telemetry decides *which lever* (a sour shot that ran fast wants a finer grind,
 * one that ran at a normal pace wants more water) and can put puck prep first,
 * but never overrides the cup. One primary step, at most one secondary and one
 * alternative; each carries the change a single Apply tap would make.
 */

export type Finish = 'clean' | 'drying'
export interface TasteNote {
  /** −1 sour … 0 balanced … +1 bitter. */
  extraction: number
  /** −1 weak/watery … 0 balanced … +1 heavy/syrupy. */
  strength: number
  finish: Finish
  /** Drunk with milk: the target moves toward a stronger shot. */
  milk?: boolean
}

export const TASTE_ZONES = {
  /** Within this distance of 0 on an axis, that axis counts as balanced. */
  balanced: 0.25,
  /** Within this radius of the centre (and clean) the cup is on target. */
  centre: 0.3,
  /** Just outside balanced: the advice is offered as a small, tentative move. */
  tentative: 0.42,
  /** Strength target shift for milk drinks (the centre moves up the square). */
  milkShift: 0.3,
} as const

export interface ShotContext {
  dose?: number
  yield?: number
  grindSetting?: string
  temperatureC?: number
  peakPressureBar?: number
  gear?: GearSetup
  /** Present when the shot used the adaptive Living Profile; changes then apply to its parameters. */
  chassis?: ChassisParams
  pace?: ShotPace
  rest?: RestPhase
}

export type ProfileSettingChange = { setting: 'targetYield' | 'dose' | 'temperature' | 'grindSetting'; value: number }
export type ApplyAction =
  | { kind: 'profileSettings'; changes: ProfileSettingChange[] }
  | { kind: 'chassis'; params: Partial<ChassisParams> }

export type DialInStep =
  | { kind: 'keep' }
  | { kind: 'puckPrep' }
  | { kind: 'lowerPeakPressure'; fromBar?: number; toBar: number; apply?: ApplyAction }
  | { kind: 'grindFiner' | 'grindCoarser'; grindSetting?: string; toSetting?: number; unit?: string; /** More than one step when sized from your history. */ steps?: number; apply?: ApplyAction }
  | { kind: 'longerYield' | 'shorterYield'; fromGrams?: number; toGrams?: number; toRatio?: number; apply?: ApplyAction }
  | { kind: 'moreDose' | 'lessDose'; fromGrams?: number; toGrams?: number; toYieldGrams?: number; apply?: ApplyAction }
  | { kind: 'warmer'; fromC?: number; toC: number; apply?: ApplyAction }
  | { kind: 'longerSoak'; fromSeconds: number; toSeconds: number; apply?: ApplyAction }
  | { kind: 'tryTurbo' }
  | { kind: 'checkWater'; ppm: number }

export type DialInReason =
  | 'dialedIn' | 'chokedFlow' | 'puckDrop' | 'puckDropFresh' | 'astringent' | 'astringentLowPressure'
  | 'sourFast' | 'sourWeak' | 'sourWeakSlow' | 'sourStrong' | 'sour' | 'sourLongRatio' | 'sourBody'
  | 'bitterSlow' | 'bitterStrong' | 'bitterWeak' | 'bitter' | 'bitterShortRatio'
  | 'weak' | 'weakBasketFull' | 'weakFixedDose' | 'strong'

export interface DialInAdvice {
  primary: DialInStep
  secondary?: DialInStep
  alternative?: DialInStep
  reason: DialInReason
  basis: 'taste' | 'both'
  /** Tentative = a small move near the target, or taste and telemetry pull different ways: taste again before changing anything else. */
  confidence: 'clear' | 'tentative'
  milk: boolean
  ratio?: number
}

export const DIAL_IN_LIMITS = {
  ratioStep: 0.3,
  bitterRatioStep: 0.2,
  fallbackYieldShare: 0.1,
  doseStepGrams: 1,
  longRatio: 2.6,
  shortRatio: 1.8,
  turboPeakBar: 6,
  astringentPeakBar: 7,
  warmerStepC: 1.5,
  maxTemperatureC: 96,
  soakStepSeconds: 5,
} as const

const positive = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const round1 = (value: number) => Math.round(value * 10) / 10
const clampAxis = (value: number) => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0))

export function brewRatio(context: Pick<ShotContext, 'dose' | 'yield'>) {
  return positive(context.dose) && positive(context.yield) ? context.yield / context.dose : undefined
}

/** The note as plotted against its target: milk drinks aim higher on strength. */
export function targetRelative(note: TasteNote) {
  return { x: clampAxis(note.extraction), y: clampAxis(note.strength) - (note.milk ? TASTE_ZONES.milkShift : 0) }
}

export function distanceFromTarget(note: TasteNote) {
  const { x, y } = targetRelative(note)
  return Math.hypot(x, y)
}

export const isOnTarget = (note: TasteNote) => note.finish === 'clean' && distanceFromTarget(note) <= TASTE_ZONES.centre

function applyFor(context: ShotContext, chassis: Partial<ChassisParams>, settings: ProfileSettingChange[]): ApplyAction | undefined {
  if (context.chassis) return { kind: 'chassis', params: clampChassis({ ...context.chassis, ...chassis }) }
  return settings.length ? { kind: 'profileSettings', changes: settings } : undefined
}

function yieldStep(context: ShotContext, direction: 1 | -1, ratioStep: number): DialInStep {
  const kind = direction > 0 ? 'longerYield' as const : 'shorterYield' as const
  if (!positive(context.yield)) return { kind }
  const fromGrams = Math.round(context.yield)
  const ratio = brewRatio(context)
  const toGrams = ratio !== undefined && positive(context.dose)
    ? Math.max(1, Math.round(context.dose * (ratio + direction * ratioStep)))
    : Math.max(1, fromGrams + direction * Math.max(2, Math.round(fromGrams * DIAL_IN_LIMITS.fallbackYieldShare)))
  const toRatio = positive(context.dose) ? round1(toGrams / context.dose) : undefined
  return { kind, fromGrams, toGrams, ...(toRatio !== undefined ? { toRatio } : {}), apply: applyFor(context, { targetWeight: toGrams }, [{ setting: 'targetYield', value: toGrams }]) }
}

function doseStep(context: ShotContext, direction: 1 | -1): DialInStep {
  const kind = direction > 0 ? 'moreDose' as const : 'lessDose' as const
  if (!positive(context.dose)) return { kind }
  const toGrams = round1(Math.max(1, context.dose + direction * DIAL_IN_LIMITS.doseStepGrams))
  const ratio = brewRatio(context)
  const toYieldGrams = ratio === undefined ? undefined : Math.round(toGrams * ratio)
  const settings: ProfileSettingChange[] = [{ setting: 'dose', value: toGrams }, ...(toYieldGrams !== undefined ? [{ setting: 'targetYield' as const, value: toYieldGrams }] : [])]
  return { kind, fromGrams: context.dose, toGrams, ...(toYieldGrams !== undefined ? { toYieldGrams } : {}), apply: applyFor(context, { doseGrams: toGrams, ...(toYieldGrams !== undefined ? { targetWeight: toYieldGrams } : {}) }, settings) }
}

function grindStep(context: ShotContext, kind: 'grindFiner' | 'grindCoarser'): DialInStep {
  const grindSetting = context.grindSetting?.trim() && context.grindSetting !== '—' ? context.grindSetting.trim() : undefined
  const toSetting = nextGrindSetting(grindSetting, kind === 'grindFiner' ? -1 : 1, context.gear)
  // Grind is the barista's physical action; Apply only records the new reference setting.
  return { kind, ...(grindSetting ? { grindSetting } : {}), ...(toSetting !== undefined ? { toSetting } : {}), ...(context.gear?.grindUnit ? { unit: context.gear.grindUnit } : {}),
    ...(toSetting !== undefined ? { apply: { kind: 'profileSettings' as const, changes: [{ setting: 'grindSetting' as const, value: toSetting }] } } : {}) }
}

function warmerStep(context: ShotContext): DialInStep {
  const from = context.chassis?.temperatureC ?? context.temperatureC
  const toC = round1(Math.min(DIAL_IN_LIMITS.maxTemperatureC, (from ?? 92) + DIAL_IN_LIMITS.warmerStepC))
  return { kind: 'warmer', ...(from !== undefined ? { fromC: from } : {}), toC, apply: applyFor(context, { temperatureC: toC }, from !== undefined ? [{ setting: 'temperature', value: toC }] : []) }
}

function soakStep(context: ShotContext): DialInStep | undefined {
  if (!context.chassis) return undefined
  const toSeconds = context.chassis.soakSeconds + DIAL_IN_LIMITS.soakStepSeconds
  return { kind: 'longerSoak', fromSeconds: context.chassis.soakSeconds, toSeconds, apply: applyFor(context, { soakSeconds: toSeconds }, []) }
}

function pressureStep(context: ShotContext, toBar: number): DialInStep {
  const from = context.chassis?.pressureCapBar ?? context.peakPressureBar
  return { kind: 'lowerPeakPressure', ...(from !== undefined ? { fromBar: round1(from) } : {}), toBar, ...(context.chassis ? { apply: { kind: 'chassis' as const, params: clampChassis({ ...context.chassis, pressureCapBar: toBar }) } } : {}) }
}

interface TasteDecision { step: DialInStep; reason: DialInReason; alternative?: DialInStep; conflict?: boolean }

/** The taste step, with the shot's pace choosing between grind and ratio. */
function tasteStep(note: TasteNote, context: ShotContext): TasteDecision | undefined {
  const { x, y } = targetRelative(note)
  const sour = x < -TASTE_ZONES.balanced, bitter = x > TASTE_ZONES.balanced
  const weak = y < -TASTE_ZONES.balanced, strong = y > TASTE_ZONES.balanced
  const ratio = brewRatio(context)
  const peak = context.chassis?.pressureCapBar ?? context.peakPressureBar
  const turbo = peak !== undefined && peak > DIAL_IN_LIMITS.astringentPeakBar ? { kind: 'tryTurbo' as const } : undefined

  if (sour) {
    // Ran fast: water rushed past the coffee. More contact, not more water.
    if (context.pace === 'fast') return { step: grindStep(context, 'grindFiner'), reason: 'sourFast' }
    if (context.gear?.style === 'body') return { step: warmerStep(context), reason: 'sourBody' }
    if (weak) {
      // Under-extracted and thin: extract more without diluting. Finer, unless the shot already crawled.
      if (context.pace === 'slow') return { step: soakStep(context) ?? warmerStep(context), reason: 'sourWeakSlow' }
      return { step: grindStep(context, 'grindFiner'), reason: 'sourWeak', ...(turbo ? { alternative: turbo } : {}) }
    }
    if (ratio !== undefined && ratio >= DIAL_IN_LIMITS.longRatio) return { step: soakStep(context) ?? warmerStep(context), reason: 'sourLongRatio' }
    return { step: yieldStep(context, 1, DIAL_IN_LIMITS.ratioStep), reason: strong ? 'sourStrong' : 'sour', ...(turbo ? { alternative: turbo } : {}), conflict: context.pace === 'slow' }
  }
  if (bitter) {
    if (context.pace === 'slow') return { step: grindStep(context, 'grindCoarser'), reason: 'bitterSlow' }
    if (strong) return { step: grindStep(context, 'grindCoarser'), reason: 'bitterStrong' }
    if (ratio !== undefined && ratio <= DIAL_IN_LIMITS.shortRatio) return { step: grindStep(context, 'grindCoarser'), reason: 'bitterShortRatio' }
    return { step: yieldStep(context, -1, DIAL_IN_LIMITS.bitterRatioStep), reason: weak ? 'bitterWeak' : 'bitter', conflict: context.pace === 'fast' }
  }
  if (weak) {
    const water = waterIsHighlyBuffered(context.gear) ? { kind: 'checkWater' as const, ppm: context.gear!.waterAlkalinityPpm! } : undefined
    const basketFull = positive(context.dose) && positive(context.gear?.basketDoseGrams) && context.dose + DIAL_IN_LIMITS.doseStepGrams > context.gear!.basketDoseGrams!
    if (context.gear?.fixedDose) return { step: yieldStep(context, -1, DIAL_IN_LIMITS.bitterRatioStep), reason: 'weakFixedDose', ...(water ? { alternative: water } : {}) }
    if (basketFull) return { step: yieldStep(context, -1, DIAL_IN_LIMITS.bitterRatioStep), reason: 'weakBasketFull', ...(water ? { alternative: water } : {}) }
    return { step: doseStep(context, 1), reason: 'weak', ...(water ? { alternative: water } : {}) }
  }
  if (strong) return { step: yieldStep(context, 1, DIAL_IN_LIMITS.ratioStep), reason: 'strong' }
  return undefined
}

export function recommendNextShot(note: TasteNote, analysis: Pick<ShotAnalysis, 'analysable' | 'findings'> | undefined, context: ShotContext = {}): DialInAdvice {
  const ratio = brewRatio(context)
  const milk = note.milk === true
  const telemetry = Boolean(analysis?.analysable || context.pace)
  const base = { ratio, milk }
  if (isOnTarget(note)) return { primary: { kind: 'keep' }, reason: 'dialedIn', basis: 'taste', confidence: 'clear', ...base }
  const fromTaste = tasteStep(note, context)
  const tentative = distanceFromTarget(note) < TASTE_ZONES.tentative || Boolean(fromTaste?.conflict)

  if (analysis && hasFinding(analysis, 'chokedFlow')) {
    const secondary = fromTaste && fromTaste.step.kind !== 'grindFiner' && fromTaste.step.kind !== 'grindCoarser' ? fromTaste.step : undefined
    return { primary: grindStep(context, 'grindCoarser'), ...(secondary ? { secondary } : {}), reason: 'chokedFlow', basis: 'both', confidence: 'clear', ...base }
  }
  if (analysis && hasFinding(analysis, 'suddenResistanceDrop')) {
    const fresh = context.rest === 'tooFresh'
    const alternative = fresh ? soakStep(context) : undefined
    return { primary: { kind: 'puckPrep' }, ...(fromTaste ? { secondary: fromTaste.step } : {}), ...(alternative ? { alternative } : {}), reason: fresh ? 'puckDropFresh' : 'puckDrop', basis: 'both', confidence: 'clear', ...base }
  }
  if (note.finish === 'drying') {
    const peak = context.chassis?.pressureCapBar ?? context.peakPressureBar
    if (peak === undefined || peak > DIAL_IN_LIMITS.astringentPeakBar) return { primary: pressureStep(context, DIAL_IN_LIMITS.turboPeakBar), secondary: { kind: 'puckPrep' }, reason: 'astringent', basis: telemetry ? 'both' : 'taste', confidence: 'clear', ...base }
    return { primary: { kind: 'puckPrep' }, secondary: yieldStep(context, -1, DIAL_IN_LIMITS.bitterRatioStep), reason: 'astringentLowPressure', basis: 'taste', confidence: 'clear', ...base }
  }
  if (!fromTaste) return { primary: { kind: 'keep' }, reason: 'dialedIn', basis: 'taste', confidence: 'tentative', ...base }
  const usedPace = context.pace !== undefined && /Fast|Slow/.test(fromTaste.reason)
  return { primary: fromTaste.step, ...(fromTaste.alternative ? { alternative: fromTaste.alternative } : {}), reason: fromTaste.reason, basis: usedPace || telemetry ? 'both' : 'taste', confidence: tentative ? 'tentative' : 'clear', ...base }
}

export const adviceApplyAction = (advice: DialInAdvice | undefined) => advice && 'apply' in advice.primary ? advice.primary.apply : undefined

// ---------------------------------------------------------------------------
// Refractometer (optional): TDS and extraction yield on the same square.
// ---------------------------------------------------------------------------

export const MEASURED_TARGET = { extractionPct: 20, extractionSpanPct: 4, tdsPct: 10, tdsSpanPct: 3 } as const

export function extractionYieldPct(tdsPct: number | undefined, yieldGrams: number | undefined, doseGrams: number | undefined) {
  return positive(tdsPct) && positive(yieldGrams) && positive(doseGrams) ? round1(tdsPct * yieldGrams / doseGrams) : undefined
}

/** Where a refractometer reading sits on the taste square (espresso: ~18–22 % EY, ~8–12 % TDS). */
export function measuredPoint(tdsPct: number, extractionPct: number) {
  return {
    extraction: clampAxis((extractionPct - MEASURED_TARGET.extractionPct) / MEASURED_TARGET.extractionSpanPct),
    strength: clampAxis((tdsPct - MEASURED_TARGET.tdsPct) / MEASURED_TARGET.tdsSpanPct),
  }
}

/** True when palate and refractometer are far apart: worth re-tasting, trust the cup. */
export const palateDisagrees = (tasted: Pick<TasteNote, 'extraction' | 'strength'>, measured: Pick<TasteNote, 'extraction' | 'strength'>) => Math.hypot(tasted.extraction - measured.extraction, tasted.strength - measured.strength) > 0.6
