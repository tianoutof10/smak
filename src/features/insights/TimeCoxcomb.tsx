import { useState } from 'react'
import { plural, t } from '../../i18n/index.ts'
import { timeWindowCounts, type HistoryRecord } from './historyData'
import { useSmakPreferences } from '../settings/smakPreferences'
import { insightHour, insightHourRange, toggleHour } from './insightClock'
import { COXCOMB, clockPoint, coxcombRadius, coxcombSector } from './coxcomb'

interface TimeCoxcombProps {
  current: HistoryRecord[]
  previous: HistoryRecord[]
  comparison: boolean
  periodLabels: [string, string]
  onOpen: (window: number, previous: boolean) => void
}

export function TimeCoxcomb({ current, previous, onOpen, comparison, periodLabels }: TimeCoxcombProps) {
  const { preferences } = useSmakPreferences()
  const range = (index: number) => insightHourRange(index, preferences.clockFormat)
  const counts = [timeWindowCounts(current), timeWindowCounts(previous)]
  const maximum = Math.max(1, ...counts.flat())
  const [period, setPeriod] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const periodNames = periodLabels.slice(0, comparison ? 2 : 1)
  const selectedCount = selected === null ? 0 : counts[period][selected]
  const selectionLabel = selected === null ? '' : plural('insights.coxcomb.sectorAriaLabel', selectedCount, { period: periodNames[period], range: range(selected) })

  return <section className="ins-chart-section ins-time-panel" aria-label={t('insights.coxcomb.sectionAriaLabel')}>
    <header><h2>{t('insights.coxcomb.heading')}</h2><div className="ins-time-switch" role="group" aria-label={t('insights.coxcomb.periodGroupAriaLabel')}>
      {periodNames.map((name, index) => <button key={name} type="button" aria-pressed={period === index}
        onClick={() => setPeriod(index)}>{name}</button>)}
    </div></header>
    <div className="ins-coxcomb" data-previous={period === 1}>
      <svg viewBox="0 0 272 272" role="group" aria-label={t('insights.coxcomb.chartAriaLabel', { period: periodNames[period] })}>
        {counts[period].map((count, index) => {
          const radius = coxcombRadius(count, maximum)
          const dot = clockPoint(index * 30 + 195, COXCOMB.outer + 7)
          return <g key={index} role="button" tabIndex={0} aria-pressed={selected === index}
            aria-label={plural('insights.coxcomb.sectorAriaLabel', count, { period: periodNames[period], range: range(index) })}
            onClick={() => setSelected(value => toggleHour(value, index))} onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(value => toggleHour(value, index)) }
            }}>
            <path className="ins-coxcomb-hit" data-daytime={index >= 3 && index < 9} d={coxcombSector(index, COXCOMB.outer, 0)}/>
            {count > 0 && <path className="ins-coxcomb-value" d={coxcombSector(index, radius)} aria-hidden="true"/>}
            {selected === index && <circle className="ins-coxcomb-selected" cx={dot[0]} cy={dot[1]} r="2.5" aria-hidden="true"/>}
          </g>
        })}
        {[0, 3, 6, 9, 12, 15, 18, 21].map(hour => {
          const point = clockPoint(hour * 15 + 180, 124)
          return <text className="ins-coxcomb-hour" key={hour} x={point[0]} y={point[1]} aria-hidden="true">{insightHour(hour, preferences.clockFormat, hour % 6 !== 0)}</text>
        })}
      </svg>
      <div className="ins-coxcomb-center" aria-live="polite" aria-label={selectionLabel || t('insights.coxcomb.allDayAriaLabel')}>
        {selected === null ? <span>{t('insights.coxcomb.allDay')}</span> : <><strong>{counts[period][selected]}</strong><small>{plural('insights.coxcomb.brewWord', counts[period][selected])}</small></>}
      </div>
    </div>
    <div className="ins-time-detail">{selected !== null && <button className="ins-link" type="button"
      aria-label={t('insights.coxcomb.viewBrewsAriaLabel', { selection: selectionLabel })} onClick={() => onOpen(selected, period === 1)}>
      {range(selected)} <span aria-hidden="true">↗</span>
    </button>}</div>
  </section>
}
