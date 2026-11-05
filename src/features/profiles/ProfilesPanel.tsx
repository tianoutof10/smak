import { useEffect, useMemo, useRef, useState } from 'react'
import { SidebarBrand, SidebarNavItem } from '../../components/Sidebar/SidebarNavigation'
import type { BrewProfile, SettingFeedback } from '../../domain/brewing'
import { formatTemperatureValue } from '../../domain/temperature'
import { useSmakPreferences } from '../settings/smakPreferences'
import { ProfileTargetChart } from '../brew/ProfileTargetChart'
import { ProfileDeleteDialog } from './ProfileDeleteDialog'
import { parseProfileImport, type ParsedProfileImport } from './profileImports'
import { beverageTypeLabel, filterLibraryProfiles, librarySectionLabel, profileLibrarySource, type LibrarySection } from './profileLibraryModel'
import { localizeDecimalText, plural, t } from '../../i18n/index.ts'
import './profileDeletion.css'
import './profileLibrary.css'

interface ProfilesPanelProps {
  profiles: BrewProfile[]
  favoriteProfileSlots: Array<string | null>
  activeProfileId?: string
  initialProfileId?: string
  editingEnabled?: boolean
  profileEditMode?: (id: string) => 'copy' | 'edit'
  feedback: SettingFeedback | null
  onSelectProfile: (id: string) => Promise<boolean>
  onSetFavoriteSlot: (id: string, slot: number) => Promise<boolean>
  onRemoveFavorite: (id: string) => Promise<boolean>
  onClose: () => void
  onViewProfile: (id?: string) => void
  onStartProfile?: () => void
  onImportProfile?: (profile: ParsedProfileImport) => void
  onCheckVisualizer?: () => Promise<{ ready: boolean; message?: string }>
  onImportVisualizer?: (code: string) => Promise<void>
  onOpenSettings?: () => void
  onEditProfile?: (id: string) => void
  canDeleteProfile?: (id: string) => boolean
  onDeleteProfile?: (id: string) => Promise<void>
}
function Icon({ name }: { name: string }) {
  if (['star','unfavorite','cup'].includes(name)) return <span className={`pl-star-icon pl-star-icon--${name}`} aria-hidden="true"/>
  const paths: Record<string,string> = { search:'m16 16 4 4M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', arrow:'m9 5 7 7-7 7', plus:'M12 4v16M4 12h16', import:'M12 2v13m-5-5 5 5 5-5M3 16v5h18v-5', grid:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z', edit:'m4 16-1 5 5-1L21 7l-5-5ZM14 4l6 6', up:'m6 14 6-6 6 6', down:'m6 10 6 6 6-6' }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>
}
function Metric({ label, value, unit }: { label:string; value:string; unit?:string }) {
  return <div className="pl-metric"><span>{label}</span><strong>{localizeDecimalText(value)}{unit && value !== '—' && <small className={unit === '°' ? 'temperature-unit' : undefined}>{unit}</small>}</strong></div>
}
function Chart({profile}:{profile:BrewProfile}) { return <ProfileTargetChart profileName={profile.name} points={profile.targetPoints} variant="library"/> }

export function ProfilesPanel({profiles, favoriteProfileSlots, activeProfileId, initialProfileId, editingEnabled=false, profileEditMode, feedback, onSelectProfile, onSetFavoriteSlot, onRemoveFavorite, onClose, onViewProfile, onStartProfile, onImportProfile, onEditProfile, canDeleteProfile, onDeleteProfile}:ProfilesPanelProps) {
  const { preferences } = useSmakPreferences()
  const [section,setSection] = useState<LibrarySection>('All profiles')
  const [query,setQuery] = useState('')
  const [category,setCategory] = useState('')
  const [sort,setSort] = useState<'name'|'recent'>('name')
  const [candidateId,setCandidateId] = useState<string|null>(null)
  const [deleting,setDeleting] = useState<BrewProfile|null>(null)
  const [pending,setPending] = useState(false)
  const [error,setError] = useState<string|null>(null)
  const inFlight = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const content = useRef<HTMLElement>(null)
  const scroll = useRef(0)
  const returnId = useRef<string|null>(null)
  const detail = profiles.find(p=>p.id===initialProfileId)
  const candidate = profiles.find(p=>p.id===candidateId)
  const favorites = useMemo(()=>favoriteProfileSlots.flatMap((id,slot)=>{const profile=profiles.find(p=>p.id===id); return profile?[{profile,slot}]:[]}),[profiles,favoriteProfileSlots])
  const ids = useMemo(()=>new Set(favorites.map(f=>f.profile.id)),[favorites])
  const categories = useMemo(()=>[...new Set(profiles.map(p=>p.category).filter((c):c is string=>Boolean(c)))].sort((a,b)=>a.localeCompare(b)),[profiles])
  const sources:LibrarySection[] = ['Preloaded','Imported','My profiles']
  const visible = useMemo(()=>filterLibraryProfiles(profiles,{section,query,category,sort}),[profiles,section,query,category,sort])
  const count = (s:LibrarySection)=>s==='All profiles'?profiles.length:s==='Favorites'?favorites.length:profiles.filter(p=>profileLibrarySource(p)===s).length
  useEffect(()=>{
    if(!candidateId) return
    const element=dialog.current
    if(!element)return
    const focus=document.activeElement as HTMLElement|null
    element.showModal()
    return ()=>{element.close();if(focus?.isConnected)focus.focus()}
  },[candidateId])
  useEffect(()=>{
    if(initialProfileId)return
    const frame=requestAnimationFrame(()=>{
      if(content.current)content.current.scrollTop=scroll.current
      Array.from(content.current?.querySelectorAll<HTMLButtonElement>('[data-profile-id]')??[]).find(b=>b.dataset.profileId===returnId.current)?.focus({preventScroll:true})
    })
    return ()=>cancelAnimationFrame(frame)
  },[initialProfileId])
  async function run(action:()=>Promise<boolean>) {
    if(inFlight.current)return false
    inFlight.current=true;setPending(true);setError(null)
    try {const ok=await action();if(!ok)setError(t('library.feedback.saveFailed'));return ok}
    catch(cause){setError(cause instanceof Error?cause.message:t('library.feedback.saveFailedRetry'));return false}
    finally{inFlight.current=false;setPending(false)}
  }
  function navigate(next:LibrarySection){setSection(next);setQuery('');setCategory('');setError(null);scroll.current=0}
  function open(p:BrewProfile){scroll.current=content.current?.scrollTop??0;returnId.current=p.id;onViewProfile(p.id)}
  async function favorite(p:BrewProfile) {
    if(inFlight.current)return
    if(ids.has(p.id)){await run(()=>onRemoveFavorite(p.id));return}
    const empty=Array.from({length:5},(_,i)=>i).find(i=>!profiles.some(p=>p.id===favoriteProfileSlots[i]))
    if(empty!==undefined){await run(()=>onSetFavoriteSlot(p.id,empty));return}
    setError(null);setCandidateId(p.id)
  }
  async function importFile(file:File|undefined){
    if(!file||inFlight.current)return
    setError(null)
    try{onImportProfile?.(parseProfileImport(await file.text()))}
    catch(cause){setError(cause instanceof Error?cause.message:t('library.feedback.importFailed'))}
  }
  const message=error??feedback?.message
  const isError=Boolean(error)||feedback?.status==='error'
  const feedbackView=message&&<div className={`pl-library-feedback${isError?' pl-library-feedback--error':''}`} role={isError?'alert':'status'}>{message}</div>
  const temperature=(p:BrewProfile)=>formatTemperatureValue(p.temperature,preferences.temperatureUnit)
  const ratio=detail&&Number(detail.dose)>0&&Number(detail.targetYield)>0?`1:${localizeDecimalText(String(Number((Number(detail.targetYield)/Number(detail.dose)).toFixed(1))))}`:'—'
  return <div className="ins-theme pl-app">
    {!initialProfileId?<div className="ins-shell">
      <aside className="ins-rail"><SidebarBrand onClose={onClose} closeLabel={t('library.aria.closeProfiles')}/>
        <span className="ins-eyebrow">{t('library.eyebrow.library')}</span><nav aria-label={t('library.nav.profileLibraryAria')}>{(['All profiles','Favorites'] as const).map(s=><SidebarNavItem key={s} active={section===s} onClick={()=>navigate(s)}><Icon name={s==='Favorites'?'star':'grid'}/>{librarySectionLabel(s)}<small>{count(s)}</small></SidebarNavItem>)}</nav>
        <span className="ins-eyebrow pl-source-label">{t('library.eyebrow.source')}</span><nav aria-label={t('library.nav.profileSourceAria')}>{sources.map(s=><SidebarNavItem key={s} active={section===s} onClick={()=>navigate(s)}><span className="pl-nav-dot"/>{librarySectionLabel(s)}<small>{count(s)}</small></SidebarNavItem>)}</nav>
      </aside>
      <main className="ins-content" ref={content}>
        <header className="pl-heading"><h1>{librarySectionLabel(section)}</h1>{editingEnabled&&<div className="pl-actions"><button className="pl-button" disabled={pending||!onImportProfile} onClick={()=>fileInput.current?.click()}><Icon name="import"/>{t('library.action.import')}</button><button className="pl-button pl-primary" disabled={pending||!onStartProfile} onClick={onStartProfile}><Icon name="plus"/>{t('library.action.createProfile')}</button></div>}</header>
        {feedbackView}
        {section==='Favorites'?<><div className="pl-section-intro"><p>{t('library.favorites.intro')}</p></div><div className="pl-favorites">{favorites.map(({profile:p},index)=><article className="pl-favorite" key={p.id}>
          <button className="pl-favorite-preview" data-profile-id={p.id} onClick={()=>open(p)} aria-label={t('library.aria.viewProfile',{name:p.name})}><Chart profile={p}/><h2>{p.name}</h2><span className="pl-muted">{p.category}</span></button>
          <footer><div><button className="pl-round" disabled={pending||index===0} aria-label={t('library.aria.moveEarlier',{name:p.name})} onClick={()=>void run(()=>onSetFavoriteSlot(p.id,favorites[index-1].slot))}><Icon name="up"/></button><button className="pl-round" disabled={pending||index===favorites.length-1} aria-label={t('library.aria.moveLater',{name:p.name})} onClick={()=>void run(()=>onSetFavoriteSlot(p.id,favorites[index+1].slot))}><Icon name="down"/></button></div><button className="pl-text pl-unfavorite" disabled={pending} aria-label={t('library.aria.unfavoriteProfile',{name:p.name})} onClick={()=>void run(()=>onRemoveFavorite(p.id))}><Icon name="unfavorite"/>{t('library.action.unfavorite')}</button></footer>
        </article>)}{favorites.length<5&&<button className="pl-empty-slot" onClick={()=>navigate('All profiles')}><Icon name="plus"/><strong>{t('library.favorites.addSlotTitle')}</strong><span>{t('library.favorites.addSlotHint')}</span></button>}</div></>:<>
          <div className="pl-toolbar"><label className="pl-search"><Icon name="search"/><input aria-label={t('library.aria.searchProfiles')} placeholder={t('library.search.placeholder')} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label={t('library.aria.clearSearch')} onClick={()=>setQuery('')}>×</button>}</label><label className="ins-period"><select aria-label={t('library.aria.filterCategory')} value={category} onChange={e=>setCategory(e.target.value)}><option value="">{t('library.filter.allCategories')}</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label className="ins-period"><select aria-label={t('library.aria.sortProfiles')} value={sort} onChange={e=>setSort(e.target.value as 'name'|'recent')}><option value="name">{t('library.sort.nameAsc')}</option><option value="recent">{t('library.sort.recent')}</option></select></label></div>
          <div className="pl-list-meta"><span>{plural('library.list.profileCount',visible.length)}</span><span>{t('library.list.hint')}</span></div>
          <section className="pl-list" aria-label={t('library.aria.profilesSection')}><div className="pl-list-header"><span>{t('library.column.profile')}</span><span>{t('library.column.recipe')}</span><span>{t('library.column.temp')}</span><span className="pl-desktop-source">{t('library.field.source')}</span><span/></div>
            {visible.map(p=><article className="pl-row" key={p.id}><button className="pl-row-open" data-profile-id={p.id} onClick={()=>open(p)} aria-label={t('library.aria.viewProfile',{name:p.name})}><span className="pl-profile-cell"><span className="pl-thumbnail"><Chart profile={p}/></span><span><strong>{p.name}</strong><span className="pl-row-sub">{p.category}</span></span></span><span className="pl-recipe">{p.dose}{p.dose!=='—'&&<small>g</small>}<span className="pl-recipe-arrow">→</span>{p.targetYield}{p.targetYield!=='—'&&<small>g</small>}</span><span className="pl-temperature">{temperature(p)}{temperature(p)!=='—'&&'°'}</span><span className="pl-desktop-source pl-muted">{librarySectionLabel(profileLibrarySource(p))}</span></button><button className={`pl-fav-button ${ids.has(p.id)?'is-favorite':''}`} disabled={pending} aria-label={ids.has(p.id)?t('library.aria.unfavoriteProfile',{name:p.name}):t('library.aria.favoriteProfile',{name:p.name})} aria-pressed={ids.has(p.id)} onClick={()=>void favorite(p)}><Icon name="star"/></button></article>)}
            {!visible.length&&<div className="pl-no-results"><h2>{profiles.length?t('library.empty.noMatchTitle'):t('library.empty.noneTitle')}</h2><p>{profiles.length?t('library.empty.noMatchHint'):t('library.empty.noneHint')}</p>{profiles.length>0&&<button className="pl-button" onClick={()=>navigate('All profiles')}>{t('library.action.clearFilters')}</button>}</div>}
          </section>
        </>}
      </main>
    </div>:detail?<main className="pl-detail">
      <section className="pl-detail-hero" aria-label={t('library.aria.profileGraphHeader')}><Chart profile={detail}/><header className="pl-detail-header"><button className="pl-round pl-close" aria-label={t('library.aria.closeProfileDetail')} onClick={()=>onViewProfile()}>×</button><h1>{detail.name}</h1><div className="pl-actions"><button className="pl-button pl-primary" disabled={pending} onClick={()=>void run(()=>onSelectProfile(detail.id))}><Icon name="cup"/>{pending?t('library.action.saving'):t('library.action.select')}</button><button className={`pl-button ${ids.has(detail.id)?'pl-selected':''}`} disabled={pending} onClick={()=>void favorite(detail)}><Icon name={ids.has(detail.id)?'unfavorite':'star'}/>{ids.has(detail.id)?t('library.action.unfavorite'):t('library.action.favorite')}</button>{editingEnabled&&onEditProfile&&<button className="pl-button" disabled={pending} onClick={()=>onEditProfile(detail.id)}><Icon name="edit"/>{profileEditMode?.(detail.id)==='edit'?t('library.action.edit'):t('library.action.editCopy')}</button>}{canDeleteProfile?.(detail.id)&&onDeleteProfile&&<button className="pl-button pl-danger" disabled={pending} onClick={()=>setDeleting(detail)}>{t('library.action.delete')}</button>}</div></header></section>
      <section className="pl-detail-metrics" aria-label={t('library.aria.overallTargets')}><Metric label={t('common.metric.temperature')} value={temperature(detail)} unit="°"/><Metric label={t('library.metric.dose')} value={detail.dose} unit="g"/><Metric label={t('library.metric.targetYield')} value={detail.targetYield} unit="g"/><Metric label={t('library.metric.ratio')} value={ratio}/></section>{feedbackView}
      <section className="pl-metadata"><article><h2>{t('library.detail.profileDetailsTitle')}</h2><dl><div><dt>{t('library.detail.category')}</dt><dd>{detail.category||'—'}</dd></div><div><dt>{t('library.detail.type')}</dt><dd>{beverageTypeLabel(detail.beverageType)}</dd></div><div><dt>{t('library.field.source')}</dt><dd>{librarySectionLabel(profileLibrarySource(detail))}</dd></div>{detail.version&&<div><dt>{t('library.detail.version')}</dt><dd>{detail.version}</dd></div>}{detail.author&&<div><dt>{t('library.detail.author')}</dt><dd>{detail.author}</dd></div>}<div><dt>{t('library.detail.grindSize')}</dt><dd>{detail.grindSetting}</dd></div></dl></article><article><h2>{t('library.detail.aboutRecipe')}</h2><p>{detail.description||t('library.detail.noDescription')}</p></article></section>
    </main>:<main className="pl-detail"><h1>{t('library.unavailable.title')}</h1><p>{t('library.unavailable.hint')}</p><button className="pl-button" onClick={()=>onViewProfile()}>{t('library.action.backToProfiles')}</button></main>}
    <input className="pl-file-input" ref={fileInput} type="file" accept=".json,application/json" aria-label={t('library.aria.importProfileJson')} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void importFile(file)}}/>
    {candidate&&<dialog className="pl-dialog" ref={dialog} aria-labelledby="favorite-replacement-title" onCancel={e=>{e.preventDefault();if(!inFlight.current)setCandidateId(null)}}><div className="pl-dialog-body"><header><span className="pl-eyebrow">{t('library.eyebrow.homeFavorites')}</span><button className="pl-round" disabled={pending} aria-label={t('library.aria.closeFavoriteReplacement')} onClick={()=>setCandidateId(null)}>×</button></header><h2 id="favorite-replacement-title">{t('library.dialog.makeRoomFor',{name:candidate.name})}</h2><p>{t('library.dialog.homeSlotsFull')}</p>{error&&<p role="alert">{error}</p>}<div className="pl-replace-list">{favorites.map(({profile:p,slot})=><button key={slot} disabled={pending} aria-label={t('library.aria.replaceProfile',{name:p.name})} onClick={()=>void run(()=>onSetFavoriteSlot(candidate.id,slot)).then(ok=>{if(ok)setCandidateId(null)})}><strong>{p.name}</strong><span>{t('library.action.replace')}</span><Icon name="arrow"/></button>)}</div></div></dialog>}
    {deleting&&onDeleteProfile&&<ProfileDeleteDialog profile={deleting} active={deleting.id===activeProfileId} onClose={()=>setDeleting(null)} onDelete={async id=>{await onDeleteProfile(id);onViewProfile()}}/>}
  </div>
}
