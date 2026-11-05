import { useEffect, useRef, useState } from 'react'
import { SidebarBrand, SidebarNavItem } from '../../components/Sidebar/SidebarNavigation'
import { PreviousShotScreen } from '../history/PreviousShotScreen'
import type { PreviousShot } from '../../domain/brewing'
import { formatDecimal, formatNumber, plural, t } from '../../i18n/index.ts'
import { coversWindow, dateLabel, historyProfileName, HISTORY_LIMIT, inWindow, matches, reportingWindow, rollingWeekdays, shiftDate, summarize, timeLabel, weekdayShort, type HistoryRecord, type InsightFilter } from './historyData'
import { availableInsightPeriods, constrainInsightsRoute, type InsightsRoute } from './insightsRoute'
import type { ShotInsights } from './useShotInsights'
import { useSmakPreferences } from '../settings/smakPreferences'
import { insightHourRange, insightPeriods } from './insightClock'
import { TimeCoxcomb } from './TimeCoxcomb'
import { historyStatus } from './historyStatus'

const pct = (n: number, total: number) => total ? Math.round(n / total * 100) : 0
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`
// Evaluated per render (not at module scope), so it always reflects the active language.
const drinkName = (id: InsightsRoute['beverage']) => id === 'espresso' ? t('insights.drink.espresso')
  : id === 'pourover' ? t('insights.drink.pourover') : id === 'other' ? t('insights.drink.other') : t('insights.drink.all')

export function InsightsScreen({ data, route, navigate, onClose }: { data: ShotInsights; route: InsightsRoute; navigate: (next: InsightsRoute, replace?: boolean) => void; onClose: () => void }) {
  const { preferences } = useSmakPreferences()
  const { cache, repository } = data
  const periods = availableInsightPeriods(cache, data.now)
  const effectiveRoute = constrainInsightsRoute(route, periods)
  const { days, section, beverage, filter, search, previous, shotId } = effectiveRoute
  // Do not rewrite a valid long-range bookmark while the first sync is loading.
  useEffect(() => {
    if (effectiveRoute !== route && !data.refreshing && (data.status === 'ready' || data.error)) navigate(effectiveRoute, true)
  }, [effectiveRoute, route, data.refreshing, data.status, data.error, navigate])
  const timezone = cache?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const records = cache?.records ?? []
  const eligible = records.filter(r => beverage === 'all' || r.beverage === beverage)
  const window = reportingWindow(days || 7, timezone, data.now, false, true)
  const priorWindow = reportingWindow(days || 7, timezone, data.now, true, true)
  const periodLabels = insightPeriods(window, priorWindow)
  const current = eligible.filter(r => inWindow(r, window))
  const prior = eligible.filter(r => inWindow(r, priorWindow))
  const summary = summarize(current), before = summarize(prior)
  const complete = coversWindow(cache, window, data.now)
  const displayedComplete = previous && section === 'history' ? coversWindow(cache, priorWindow) : complete
  const comparison = complete && coversWindow(cache, priorWindow)
  const history = (days === 0 ? eligible : previous ? prior : current).filter(r => matches(r, filter) && historyProfileName(r).toLowerCase().includes(search.toLowerCase()))
  const scroll = useRef<HTMLDivElement>(null)
  const savedScroll = useRef(0)
  const [detail, setDetail] = useState<{ id: string; shot: PreviousShot | null; error: string | null } | null>(null)
  const [retry, setRetry] = useState(0)
  const listScope = JSON.stringify([days, beverage, filter, search, previous])
  const [listPage, setListPage] = useState({ scope: listScope, count: 100 })
  const visibleCount = listPage.scope === listScope ? listPage.count : 100
  const cacheAvailable = !!cache
  useEffect(() => {
    if (!shotId) { if (scroll.current) scroll.current.scrollTop = savedScroll.current; return }
    let alive = true
    if (!cacheAvailable) return
    repository.detail(shotId).then(shot => { if (alive) setDetail({ id: shotId, shot, error: null }) }).catch(() => {
      if (alive) setDetail({ id: shotId, shot: null, error: t('insights.detail.loadError') })
    })
    return () => { alive = false }
  }, [shotId, repository, cacheAvailable, retry])
  const patch = (values: Partial<InsightsRoute>, replace = false) => navigate({ ...effectiveRoute, ...values }, replace)
  const openHistory = (next: InsightFilter = null, earlier = false) => { savedScroll.current = 0; scroll.current?.scrollTo(0, 0); patch({ section: 'history', filter: next, previous: earlier, search: '', shotId: null }) }
  const openShot = (r: HistoryRecord) => { savedScroll.current = section === 'history' ? scroll.current?.scrollTop ?? 0 : 0; setDetail(null); patch({ section: 'history', shotId: r.id }) }
  const displayWindow = previous && section === 'history' ? priorWindow : window
  const includeYear = displayWindow.start.slice(0, 4) !== window.end.slice(0, 4)
  const recordDate = (r: HistoryRecord) => dateLabel(r.date, r.date.slice(0, 4) !== window.end.slice(0, 4))
  const displayPeriod = days === 0 ? t('insights.period.latestSavedRecords', { count: formatNumber(records.length) }) : `${dateLabel(displayWindow.start, includeYear)} – ${dateLabel(shiftDate(displayWindow.end, -1), includeYear)}`
  const filterText = !filter ? t('insights.filter.all') : filter.kind === 'weekday' ? weekdayShort(Number(filter.value)) : filter.kind === 'hours' ? insightHourRange(Number(filter.value), preferences.clockFormat) : records.find(r => r.profileKey === filter.value)?.profile ?? t('insights.filter.selectedProfile')
  const statusText = historyStatus(!!cache, !!data.error)
  const tableColumns = [
    { id: 'when', label: t('insights.table.when') },
    { id: 'profile', label: t('insights.table.profile') },
    { id: 'dose', label: t('insights.table.dose') },
    { id: 'yield', label: t('insights.common.yield') },
    { id: 'duration', label: t('insights.common.duration') },
  ]
  const rows = (shots: HistoryRecord[]) => <div className="ins-table" role="table" aria-label={t('insights.table.ariaLabel')}>
    <div className="ins-table-head" role="row">{tableColumns.map(column => <span role="columnheader" key={column.id}>{column.label}</span>)}<span className="ins-sr" role="columnheader">{t('insights.table.analysis')}</span></div>
    {shots.map(r => <button key={r.id} role="row" className="ins-shot" aria-label={t('insights.table.rowAriaLabel', { profile: historyProfileName(r), date: recordDate(r), time: timeLabel(r) })} onClick={() => openShot(r)}><span role="cell">{recordDate(r)}<small>{timeLabel(r)}</small></span><span role="cell">{historyProfileName(r)}</span><span role="cell">{r.dose !== null ? formatDecimal(r.dose, Number.isInteger(r.dose) ? 0 : 1) : '—'}{r.dose !== null && <small className="unit"> g</small>}</span><span role="cell">{r.yield !== null ? formatDecimal(r.yield, 1) : '—'}{r.yield !== null && <small className="unit"> g</small>}</span><span role="cell">{r.duration !== null ? formatDecimal(r.duration, Number.isInteger(r.duration) ? 0 : 1) : '—'}{r.duration !== null && <small className="unit"> s</small>}</span><span aria-hidden="true">↗</span></button>)}
    {!shots.length && <p className="ins-empty">{!cache ? t('insights.table.emptyNoCache') : t('insights.table.emptyNoMatches')}</p>}
  </div>
  if (shotId) {
    const selected = detail?.id === shotId ? detail : null
    return <div className="ins-theme ins-app ins-detail">{selected?.shot ? <><PreviousShotScreen key={shotId} layout="detail" shots={[selected.shot]} initialShot={selected.shot} status="loaded" onSelectShot={id => repository.detail(id)} onDismiss={() => patch({ shotId: null, section: 'history' }, true)}/>{data.status === 'offline' && <span className="ins-detail-banner">{t('insights.detail.offlineBanner')}</span>}</> : <div className="ins-detail-state"><h1>{records.find(r => r.id === shotId)?.profile ?? t('insights.detail.fallbackTitle')}</h1><p role="status">{selected?.error ?? (data.status === 'offline' && !cache ? t('insights.detail.connectToLoad') : t('insights.detail.loadingShot'))}</p>{selected?.error && <button onClick={() => { setDetail(null); setRetry(v => v + 1) }}>{t('insights.common.retry')}</button>}<button onClick={() => patch({ shotId: null, section: 'history' }, true)}>{t('insights.common.close')}</button></div>}</div>
  }
  const top = summary.profileCounts[0]
  const oldTop = top && before.profileCounts.find(p => p.key === top.key)
  const shift = top ? pct(top.count, summary.count) - pct(oldTop?.count ?? 0, before.count) : 0
  const story = comparison && summary.count >= 10 && before.count >= 10 && top && top.count >= 5 && shift >= 15
  return <div className="ins-theme ins-app"><div className="ins-shell"><aside className="ins-rail"><SidebarBrand onClose={onClose} closeLabel={t('insights.nav.closeLabel')}/><small className="ins-eyebrow">{t('insights.nav.eyebrow')}</small><nav aria-label={t('insights.nav.navigationAriaLabel')}><SidebarNavItem active={section === 'overview'} onClick={() => { savedScroll.current = 0; patch({ section: 'overview', days: days || 7, filter: null, previous: false, beverage: beverage === 'all' ? 'espresso' : beverage }) }}><span aria-hidden="true">◫</span> {t('insights.nav.overview')}</SidebarNavItem><SidebarNavItem active={section === 'history'} onClick={() => openHistory()}><span aria-hidden="true">◷</span> {t('insights.nav.history')}</SidebarNavItem></nav><div className="ins-rail-foot">{t('insights.common.savedInDecaid')}<small>{t('insights.nav.latestRecords', { count: formatNumber(HISTORY_LIMIT) })}<br/>{t('insights.nav.cachedOnDevice')}</small></div></aside>
    <div className="ins-content" ref={scroll}><header className="ins-heading"><div><h1>{section === 'overview' ? t('insights.heading.overview') : t('insights.heading.history')}</h1><p>{displayPeriod} · {drinkName(beverage)}</p></div><div className="ins-heading-controls"><label className="ins-period"><span className="ins-sr">{t('insights.controls.drinkTypeLabel')}</span><select value={beverage} onChange={e => patch({ beverage: e.target.value as InsightsRoute['beverage'], filter: null })}><option value="espresso">{t('insights.drink.espresso')}</option><option value="pourover">{t('insights.drink.pourover')}</option><option value="other">{t('insights.drink.other')}</option>{section === 'history' && <option value="all">{t('insights.drink.allOption')}</option>}</select></label><label className="ins-period"><span className="ins-sr">{t('insights.controls.periodLabel')}</span><select value={days} onChange={e => patch({ days: Number(e.target.value) as InsightsRoute['days'], filter: null, previous: false })}>{periods.map(days => <option key={days} value={days}>{t('insights.controls.lastDays', { days })}</option>)}{section === 'history' && <option value="0">{t('insights.controls.allCachedHistory')}</option>}</select></label></div></header>
      <div className="ins-sync"><div>{statusText && <p role="status">{statusText}</p>}{cache && <p>{t('insights.sync.recordsSaved', { shown: formatNumber(records.length), total: formatNumber(cache.total) })}</p>}{data.storageWarning && <p>{t('insights.sync.storageWarning')}</p>}{days !== 0 && !displayedComplete && <p>{t('insights.sync.limitedCoverage')}</p>}{section === 'overview' && !comparison && <p>{t('insights.sync.notEnoughHistory')}</p>}</div><button className="ins-link" disabled={data.refreshing} onClick={() => void data.refreshHistory(true)}>{t('insights.sync.refresh')}</button></div>
      {section === 'overview' ? <>
        <div className="ins-top-grid"><section className="ins-chart-section"><header><h2>{t('insights.overview.byDay')}</h2><div className="ins-legend"><span><i/>{periodLabels[0]}</span>{comparison && <span><i/>{periodLabels[1]}</span>}</div></header><div className="ins-week" aria-label={t('insights.overview.weekdayChartAriaLabel')}>{rollingWeekdays(timezone, data.now).map(i => { const name = weekdayShort(i); const max = Math.max(1, ...summary.weekdays, ...(comparison ? before.weekdays : [])); const ariaLabel = comparison ? t('insights.overview.weekdayAriaLabelComparison', { weekday: name, period: periodLabels[0], count: summary.weekdays[i], priorPeriod: periodLabels[1], priorCount: before.weekdays[i] }) : t('insights.overview.weekdayAriaLabel', { weekday: name, period: periodLabels[0], count: summary.weekdays[i] }); return <button key={i} onClick={() => openHistory({ kind: 'weekday', value: String(i) })} aria-label={ariaLabel}><span className="ins-week-value">{comparison && <span className="ins-week-previous">{before.weekdays[i]}</span>}<span>{cache ? summary.weekdays[i] : '—'}</span></span><span className="ins-bar-pair">{comparison ? <i data-empty={before.weekdays[i] === 0} style={{ height: `${before.weekdays[i] / max * 100}%` }}/> : <i style={{ visibility: 'hidden' }}/>}<b data-empty={summary.weekdays[i] === 0} style={{ height: `${summary.weekdays[i] / max * 100}%` }}/></span><small>{name}</small></button> })}</div></section><TimeCoxcomb periodLabels={periodLabels} key={`${days}-${beverage}-${comparison}`} current={current} previous={comparison ? prior : []} comparison={comparison} onOpen={(i, earlier) => openHistory({ kind: 'hours', value: String(i) }, earlier)}/></div>
        <section className="ins-metrics" aria-label={t('insights.metrics.sectionAriaLabel')}><div><label>{t('insights.metrics.brews')}</label><strong>{cache ? summary.count : '—'}</strong><small>{comparison ? t('insights.metrics.brewsChange', { delta: signed(summary.count - before.count), period: periodLabels[1] }) : t('insights.metrics.cachedRecordsOnly')}</small></div><div><label>{t('insights.metrics.brewingDays')}</label><strong>{cache ? summary.days : '—'}<em> / {days}</em></strong><small>{t('insights.metrics.brewingDaysHint')}</small></div><div><label>{t('insights.metrics.typicalYield')}</label><strong>{summary.typicalYield !== null ? formatDecimal(summary.typicalYield, 1) : '—'}{summary.typicalYield !== null && <em> g</em>}</strong><small>{summary.typicalYield === null ? t('insights.metrics.needsReadings') : t('insights.metrics.readingsOf', { coverage: summary.yieldCoverage, count: summary.count })}</small></div><div><label>{t('insights.metrics.mostUsedProfile')}</label><strong className="ins-profile-value">{top?.name ?? '—'}</strong><small>{top ? plural('insights.common.brewsPct', top.count, { pct: pct(top.count, summary.count) }) : t('insights.metrics.noBrewsInView')}</small></div></section>
        <div className="ins-bottom-grid"><section className="ins-panel"><header><div><h2>{t('insights.profiles.heading')}</h2><p>{t('insights.profiles.subheading')}</p></div><button className="ins-link" onClick={() => openHistory()}>{t('insights.profiles.allBrews')}</button></header><div className="ins-profiles">{summary.profileCounts.map(p => <button key={p.key} onClick={() => openHistory({ kind: 'profile', value: p.key })}><span>{p.name}<small>{plural('insights.common.brewsPct', p.count, { pct: pct(p.count, summary.count) })}</small></span><span className="ins-track"><i style={{ width: `${pct(p.count, summary.count)}%` }}/></span><span aria-hidden="true">↗</span></button>)}</div></section><section className="ins-story"><small className="ins-eyebrow">{story ? t('insights.story.eyebrowChanging') : t('insights.story.eyebrowPattern')}</small><h2>{story ? t('insights.story.headingChanging') : summary.count ? t('insights.story.headingActive') : t('insights.story.headingEmpty')}</h2><p>{story ? t('insights.story.changingBody', { profile: top.name, pct: pct(top.count, summary.count), priorPct: pct(oldTop?.count ?? 0, before.count) }) : t('insights.story.staticBody')}</p><small>{t('insights.story.cachedBrewsCount', { count: summary.count, period: displayPeriod })}</small><button className="ins-link" onClick={() => openHistory(story ? { kind: 'profile', value: top.key } : null)}>{t('insights.story.exploreBrews')}</button></section></div>
        <section className="ins-panel ins-recent"><header><h2>{t('insights.recent.heading')}</h2><button className="ins-link" onClick={() => openHistory()}>{t('insights.recent.viewAllHistory')}</button></header>{rows(current.slice(0, 3))}</section>
      </> : <><div className="ins-history-toolbar"><div><span className="ins-filter">{filterText}{filter && <button aria-label={t('insights.history.clearFilterAriaLabel')} onClick={() => patch({ filter: null })}>×</button>}</span>{days !== 0 && comparison && <div className="ins-evidence-switch"><button aria-pressed={!previous} onClick={() => patch({ previous: false })}>{periodLabels[0]}</button><button aria-pressed={previous} onClick={() => patch({ previous: true })}>{periodLabels[1]}</button></div>}</div><label><span className="ins-sr">{t('insights.history.searchLabel')}</span><input placeholder={t('insights.history.searchLabel')} value={search} onChange={e => patch({ search: e.target.value }, true)}/></label></div><section className="ins-panel ins-history-list"><header><div><h2>{t('insights.history.recordedBrewsCount', { count: history.length })}</h2><p>{t('insights.history.yieldReadingsCount', { count: summarize(history).yieldCoverage })}</p></div><small>{t('insights.history.tapToAnalyse')}</small></header>{rows(history.slice(0, visibleCount))}{history.length > visibleCount && <div className="ins-load-more"><span>{t('insights.history.shownCount', { visible: visibleCount, total: history.length })}</span><button className="ins-link" onClick={() => setListPage({ scope: listScope, count: visibleCount + 100 })}>{t('insights.history.showMore')}</button></div>}</section></>}
      <p className="ins-footnote">{t('insights.footnote.main', { timezone })} {cache?.omitted ? t('insights.footnote.omitted', { count: cache.omitted }) : ''}</p>
    </div></div></div>
}
