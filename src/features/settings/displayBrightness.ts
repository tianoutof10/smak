import { getDisplayState, setDisplayBrightness } from '../../api/decaid/client'
import { t } from '../../i18n/index.ts'
import { createDisplayBrightnessPolicy } from './displayBrightnessPolicy'

const KEY = 'smak:display-brightness'
export const displayBrightness = createDisplayBrightnessPolicy({
  read: getDisplayState,
  write: setDisplayBrightness,
  load: () => {
    try {
      const stored = window.localStorage.getItem(KEY)
      if (stored === null) return null
      const value = Number(stored)
      return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null
    } catch { return null }
  },
  persist: (value) => {
    try { window.localStorage.setItem(KEY, String(value)) }
    catch { throw new Error(t('settings.brightness.persistFailed')) }
  },
})
