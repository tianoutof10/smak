import type { DecaidProfile, DecaidProfileStep } from '../api/decaid/types.ts'
import { chassisMetadata, compileChassisProfile, DEFAULT_CHASSIS } from './chassis.ts'

/**
 * Research-backed starting profiles, grouped by the kind of bean they suit
 * rather than by file name. They are added to the profile library only when
 * the barista taps Add; nothing is written automatically.
 */
export type PresetId = 'living' | 'turbo' | 'blooming' | 'flowLed'
export type BeanStyle = 'anyBean' | 'lightMedium' | 'denseLight' | 'everyday'

export interface ResearchPreset {
  id: PresetId
  beanStyle: BeanStyle
  /** Source shown on the card; never translated. */
  source: string
  doseGrams: number
  targetWeight: number
  ratio: number
  profile: DecaidProfile
  metadata: Record<string, unknown>
}

const step = (value: DecaidProfileStep): DecaidProfileStep => ({ sensor: 'coffee', transition: 'fast', volume: 0, weight: 0, ...value })
const profile = (title: string, notes: string, steps: DecaidProfileStep[], targetWeight: number, doseGrams: number): DecaidProfile => ({
  version: '2.1', title, author: '', notes, beverage_type: 'espresso', steps,
  target_weight: targetWeight, target_volume: 0, target_volume_count_start: 0, tank_temperature: 0, dose_weight: doseGrams,
})

const turbo = profile('Research / Turbo Shot',
  'Cameron et al. (2020), Matter. A lower dose, a coarser grind and a 6 bar ceiling for a fast, even extraction: about 15 g in, 40 g out in roughly 15 seconds. Suits light-to-medium roasts where clarity and sweetness matter more than body.',
  [
    step({ name: 'Fill', pump: 'flow', flow: 4.5, temperature: 93, seconds: 8, exit: { type: 'pressure', condition: 'over', value: 3 }, limiter: { value: 3.5, range: 0.6 } }),
    step({ name: 'Pour', pump: 'pressure', pressure: 6, temperature: 93, seconds: 30, limiter: { value: 4.5, range: 0.6 } }),
  ], 40, 15)

const blooming = profile('Research / Blooming Espresso',
  'Scott Rao’s blooming espresso. A rapid fill to 4 bar, a 30-second sealed soak with the pump off so dense light roasts saturate and degas, then a gentle 2 ml/s percolation. Suits dense, light-roasted, high-grown coffees.',
  [
    step({ name: 'Fill', pump: 'flow', flow: 4, temperature: 94, seconds: 15, exit: { type: 'pressure', condition: 'over', value: 4 }, limiter: { value: 4.5, range: 0.6 } }),
    step({ name: 'Bloom', pump: 'flow', flow: 0, temperature: 94, seconds: 30 }),
    step({ name: 'Percolation', pump: 'flow', flow: 2, temperature: 94, seconds: 45, limiter: { value: 9, range: 0.6 } }),
  ], 45, 18)

const flowLed = profile('Research / Flow-Prioritized',
  'Schmieder et al. (2023), Foods. Flow rate had the largest effect on what reached the cup, ahead of grind and temperature, though all were minor next to total yield. Holds a flat 1.8 ml/s and lets pressure taper as the puck erodes. An everyday profile for most coffees.',
  [
    step({ name: 'Fill', pump: 'flow', flow: 4, temperature: 93, seconds: 12, exit: { type: 'pressure', condition: 'over', value: 4 }, limiter: { value: 4.5, range: 0.6 } }),
    step({ name: 'Extraction', pump: 'flow', flow: 1.8, temperature: 93, seconds: 50, limiter: { value: 9, range: 0.6 } }),
  ], 36, 18)

const living = compileChassisProfile(DEFAULT_CHASSIS, undefined,
  'One adaptive profile instead of many. It fills until the bed pressurises, soaks until the pressure relaxes, then extracts by flow under a pressure ceiling. After each shot, Dial in proposes changes to its soak, ceiling, flow and yield, applied with one tap.')

export const RESEARCH_PRESETS: ResearchPreset[] = [
  { id: 'living', beanStyle: 'anyBean', source: 'Adaptive chassis', doseGrams: DEFAULT_CHASSIS.doseGrams, targetWeight: DEFAULT_CHASSIS.targetWeight, ratio: Math.round(DEFAULT_CHASSIS.targetWeight / DEFAULT_CHASSIS.doseGrams * 10) / 10, profile: living, metadata: { ...chassisMetadata(DEFAULT_CHASSIS), smakPreset: 'living' } },
  { id: 'turbo', beanStyle: 'lightMedium', source: 'Cameron et al., 2020', doseGrams: 15, targetWeight: 40, ratio: 2.7, profile: turbo, metadata: { smakPreset: 'turbo' } },
  { id: 'blooming', beanStyle: 'denseLight', source: 'Scott Rao', doseGrams: 18, targetWeight: 45, ratio: 2.5, profile: blooming, metadata: { smakPreset: 'blooming' } },
  { id: 'flowLed', beanStyle: 'everyday', source: 'Schmieder et al., 2023', doseGrams: 18, targetWeight: 36, ratio: 2, profile: flowLed, metadata: { smakPreset: 'flowLed' } },
]

export const presetById = (id: PresetId) => RESEARCH_PRESETS.find(preset => preset.id === id)

/** True when a soak/bloom stage is running: pump target at zero after the bed was pressurised. */
export function isSoakStage(point: { targetFlow?: number; targetPressure?: number; stageName?: string } | undefined) {
  if (!point) return false
  if (point.stageName && /bloom|soak|dwell|pause/i.test(point.stageName)) return true
  return point.targetFlow === 0 && (point.targetPressure === undefined || point.targetPressure === 0)
}
