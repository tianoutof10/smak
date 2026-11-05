import { formatDecimal, t } from '../../i18n/index.ts'
import { TASTE_ZONES, type ApplyAction, type DialInStep } from './dialIn.ts'
import type { DialEntry } from '../beans/coffeeLibrary.ts'

const grams = (value: number) => formatDecimal(value, Number.isInteger(value) ? 0 : 1)
const settingText = (value: number) => formatDecimal(value, String(value).includes('.') ? 1 : 0)

export function stepText(step: DialInStep) {
  switch (step.kind) {
    case 'keep': return t('insights.dialIn.step.keep')
    case 'puckPrep': return t('insights.dialIn.step.puckPrep')
    case 'lowerPeakPressure': return step.fromBar === undefined
      ? t('insights.dialIn.step.lowerPeakPressure', { to: formatDecimal(step.toBar, 1) })
      : t('insights.dialIn.step.lowerPeakPressureFrom', { from: formatDecimal(step.fromBar, 1), to: formatDecimal(step.toBar, 1) })
    case 'grindFiner':
    case 'grindCoarser': {
      const finer = step.kind === 'grindFiner'
      if (step.steps && step.steps > 1 && step.toSetting !== undefined && step.grindSetting) return t(finer ? 'insights.dialIn.step.grindFinerSteps' : 'insights.dialIn.step.grindCoarserSteps', { count: step.steps, from: step.grindSetting, to: settingText(step.toSetting) })
      if (step.toSetting !== undefined && step.grindSetting) return t(finer ? 'insights.dialIn.step.grindFinerTo' : 'insights.dialIn.step.grindCoarserTo', { from: step.grindSetting, to: settingText(step.toSetting), unit: step.unit ?? t('insights.dialIn.step.grindUnitDefault') })
      if (step.grindSetting) return t(finer ? 'insights.dialIn.step.grindFinerFrom' : 'insights.dialIn.step.grindCoarserFrom', { setting: step.grindSetting })
      return t(finer ? 'insights.dialIn.step.grindFiner' : 'insights.dialIn.step.grindCoarser')
    }
    case 'longerYield':
    case 'shorterYield': {
      const longer = step.kind === 'longerYield'
      if (step.toGrams === undefined) return t(longer ? 'insights.dialIn.step.longerYield' : 'insights.dialIn.step.shorterYield')
      if (step.toRatio !== undefined) return t('insights.dialIn.step.yieldRatioTo', { from: step.fromGrams ?? '—', to: step.toGrams, ratio: formatDecimal(step.toRatio, 1) })
      return t(longer ? 'insights.dialIn.step.longerYieldTo' : 'insights.dialIn.step.shorterYieldTo', { from: step.fromGrams ?? '—', to: step.toGrams })
    }
    case 'moreDose':
    case 'lessDose': {
      const more = step.kind === 'moreDose'
      if (step.toGrams === undefined || step.toYieldGrams === undefined) return t(more ? 'insights.dialIn.step.moreDose' : 'insights.dialIn.step.lessDose')
      return t(more ? 'insights.dialIn.step.moreDoseTo' : 'insights.dialIn.step.lessDoseTo', { from: formatDecimal(step.fromGrams ?? 0, 1), to: formatDecimal(step.toGrams, 1), yield: step.toYieldGrams })
    }
    case 'warmer': return step.fromC === undefined ? t('insights.dialIn.step.warmer', { to: formatDecimal(step.toC, 1) }) : t('insights.dialIn.step.warmerFrom', { from: formatDecimal(step.fromC, 1), to: formatDecimal(step.toC, 1) })
    case 'longerSoak': return t('insights.dialIn.step.longerSoak', { from: Math.round(step.fromSeconds), to: Math.round(step.toSeconds) })
    case 'tryTurbo': return t('insights.dialIn.step.tryTurbo')
    case 'checkWater': return t('insights.dialIn.step.checkWater', { ppm: Math.round(step.ppm) })
  }
}

export function applySummary(action: ApplyAction) {
  if (action.kind === 'chassis') return t('insights.dialIn.apply.chassis')
  return action.changes.map(change => change.setting === 'targetYield' ? t('insights.dialIn.apply.targetYield', { value: grams(change.value) })
    : change.setting === 'dose' ? t('insights.dialIn.apply.dose', { value: formatDecimal(change.value, 1) })
      : change.setting === 'temperature' ? t('insights.dialIn.apply.temperature', { value: formatDecimal(change.value, 1) })
        : t('insights.dialIn.apply.grind', { value: settingText(change.value) })).join(' · ')
}


/** "Sour and thin", "Balanced"… from where a tasting landed. */
export function tasteWords(entry: Pick<DialEntry, 'extraction' | 'strength' | 'milk'>) {
  const strength = entry.strength - (entry.milk ? TASTE_ZONES.milkShift : 0)
  const x = entry.extraction < -TASTE_ZONES.balanced ? 'sour' : entry.extraction > TASTE_ZONES.balanced ? 'bitter' : 'balanced'
  const y = strength < -TASTE_ZONES.balanced ? 'Weak' : strength > TASTE_ZONES.balanced ? 'Strong' : 'Balanced'
  return t(`insights.taste.words.${x}${y}`)
}

