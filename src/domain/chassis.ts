import type { DecaidProfile, DecaidProfileStep } from '../api/decaid/types.ts'

/**
 * The adaptive "Living Profile": one universal three-stage chassis whose few
 * parameters are tuned per bean and between shots, instead of choosing among
 * many profiles. The machine adapts within a shot through hydraulic exits; the
 * dial-in loop proposes parameter changes between shots (applied by one tap).
 *
 * 1. Auto-sensing fill: constant flow until the bed pressurises (exit on pressure).
 * 2. Sealed soak: pump off with the group closed until pressure relaxes or time runs out.
 * 3. Flow-led extraction under a pressure ceiling, with an optional gentle decline.
 */
export interface ChassisParams {
  fillFlow: number
  fillExitBar: number
  fillMaxSeconds: number
  soakSeconds: number
  soakExitBar: number
  flowTarget: number
  pressureCapBar: number
  /** How much the flow target eases off in the final stage (ml/s). 0 = no decline stage. */
  declineFlowDrop: number
  temperatureC: number
  targetWeight: number
  doseGrams: number
}

export const DEFAULT_CHASSIS: ChassisParams = {
  fillFlow: 3.5, fillExitBar: 3.5, fillMaxSeconds: 15,
  soakSeconds: 10, soakExitBar: 1.5,
  flowTarget: 2, pressureCapBar: 6.5, declineFlowDrop: 0.4,
  temperatureC: 93, targetWeight: 40, doseGrams: 18,
}

export const CHASSIS_LIMITS: Record<keyof ChassisParams, [number, number]> = {
  fillFlow: [2, 6], fillExitBar: [1.5, 6], fillMaxSeconds: [5, 30],
  soakSeconds: [0, 45], soakExitBar: [0.5, 3],
  flowTarget: [0.8, 4.5], pressureCapBar: [3, 10], declineFlowDrop: [0, 1.5],
  temperatureC: [82, 100], targetWeight: [15, 80], doseGrams: [7, 25],
}

export const CHASSIS_METADATA_KEY = 'smakChassis'
export const CHASSIS_TITLE = 'Adaptive / Living profile'

const round1 = (value: number) => Math.round(value * 10) / 10

export function clampChassis(params: Partial<ChassisParams>): ChassisParams {
  const merged = { ...DEFAULT_CHASSIS, ...params }
  return Object.fromEntries(Object.entries(CHASSIS_LIMITS).map(([key, [min, max]]) => {
    const value = Number(merged[key as keyof ChassisParams])
    return [key, round1(Math.max(min, Math.min(max, Number.isFinite(value) ? value : DEFAULT_CHASSIS[key as keyof ChassisParams])))]
  })) as unknown as ChassisParams
}

export function chassisFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const stored = metadata?.[CHASSIS_METADATA_KEY]
  return stored && typeof stored === 'object' ? clampChassis(stored as Partial<ChassisParams>) : undefined
}

const step = (step: DecaidProfileStep): DecaidProfileStep => ({ sensor: 'coffee', transition: 'fast', volume: 0, weight: 0, ...step })

export function compileChassisSteps(input: Partial<ChassisParams>): DecaidProfileStep[] {
  const p = clampChassis(input)
  const steps: DecaidProfileStep[] = [
    step({ name: 'Fill', pump: 'flow', flow: p.fillFlow, temperature: p.temperatureC, seconds: p.fillMaxSeconds, exit: { type: 'pressure', condition: 'over', value: p.fillExitBar }, limiter: { value: round1(p.fillExitBar + 0.5), range: 0.6 } }),
  ]
  if (p.soakSeconds > 0) steps.push(step({ name: 'Soak', pump: 'flow', flow: 0, temperature: p.temperatureC, seconds: p.soakSeconds, exit: { type: 'pressure', condition: 'under', value: p.soakExitBar } }))
  steps.push(step({ name: 'Extraction', pump: 'flow', flow: p.flowTarget, temperature: p.temperatureC, seconds: p.declineFlowDrop > 0 ? 25 : 60, limiter: { value: p.pressureCapBar, range: 0.6 } }))
  if (p.declineFlowDrop > 0) steps.push(step({ name: 'Decline', pump: 'flow', flow: round1(Math.max(0.5, p.flowTarget - p.declineFlowDrop)), transition: 'smooth', temperature: p.temperatureC, seconds: 40, limiter: { value: p.pressureCapBar, range: 0.6 } }))
  return steps
}

export function compileChassisProfile(input: Partial<ChassisParams>, title = CHASSIS_TITLE, notes = ''): DecaidProfile {
  const p = clampChassis(input)
  return {
    version: '2.1',
    title,
    author: '',
    notes,
    beverage_type: 'espresso',
    steps: compileChassisSteps(p),
    target_weight: p.targetWeight,
    target_volume: 0,
    target_volume_count_start: 0,
    tank_temperature: 0,
    dose_weight: p.doseGrams,
  }
}

export const chassisMetadata = (params: Partial<ChassisParams>) => ({ [CHASSIS_METADATA_KEY]: clampChassis(params) })
