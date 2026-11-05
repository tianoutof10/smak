import type { PreviousShot, PreviousShotStatus } from '../../domain/brewing'
import { displayedShotName } from '../../i18n/dataLabels.ts'
import { MiniShotChart } from './MiniShotChart'
import { formatDeviceTime, type ClockFormat } from '../sleep/deviceTime'
import { useSmakPreferences } from '../settings/smakPreferences'
import { dateFormatter, localizeDecimalText, t } from '../../i18n/index.ts'

// Evaluated per render (not at module scope), so it always reflects the active language.
const emptyMessage = (status: Exclude<PreviousShotStatus, 'loaded' | 'fixture'>): string => {
  if (status === 'loading') return t('insights.historyPanel.loading')
  if (status === 'error') return t('insights.historyPanel.error')
  return t('insights.historyPanel.emptyNoCups')
}

const shotTimestamp = (timestamp: string | undefined, clockFormat: ClockFormat) => {
  const date = timestamp ? new Date(timestamp) : null
  if (!date || Number.isNaN(date.getTime())) return t('insights.historyPanel.lastPull')
  const now = new Date()
  const time = formatDeviceTime(date, undefined, clockFormat)
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  if (sameDay) return t('insights.historyPanel.today', { time })
  const day = dateFormatter({ month: 'short', day: 'numeric' }).format(date)
  return `${day}, ${time}`
}

export function HistoryPanel({ shot, status, onOpen }: { shot: PreviousShot | null; status: PreviousShotStatus; onOpen: () => void }) {
  const { preferences } = useSmakPreferences()
  const isCleaning = shot?.beverageType?.toLowerCase() === 'cleaning'
  return <section className="history-section">{shot
    ? <button className="history-card" type="button" onClick={onOpen} aria-label={t('insights.historyPanel.openAriaLabel', { profile: displayedShotName(shot) })}><div className="history-card__summary metric-scale--medium"><h3>{displayedShotName(shot)}</h3><time dateTime={shot.timestamp}>{shotTimestamp(shot.timestamp, preferences.clockFormat)}</time><div>{!isCleaning && <span><small>{t('insights.historyPanel.totalYield')}</small>{localizeDecimalText(shot.totalYield)}{shot.totalYield !== '—' && <i>g</i>}</span>}<span><small>{t('insights.historyPanel.totalTime')}</small>{localizeDecimalText(shot.totalTime)}{shot.totalTime !== '—' && <i>s</i>}</span></div></div><MiniShotChart shot={shot} /></button>
    : <article className="history-card history-card--empty" aria-live="polite"><p>{emptyMessage(status === 'loaded' || status === 'fixture' ? 'empty' : status)}</p></article>}</section>
}
