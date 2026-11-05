import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { daysOffRoast, parseBeanText, startingRecipe, type Bean, type BeanDraft, type RoastLevel } from '../../domain/beans'
import type { ChassisParams } from '../../domain/chassis'
import type { BrewStyle, BurrClass, GearSetup } from '../../domain/gear'
import { RESEARCH_PRESETS, type PresetId } from '../../domain/researchPresets'
import { formatDecimal, t } from '../../i18n/index.ts'
import { useSmakPreferences } from '../settings/smakPreferences'
import { activeBean, coffeeUpdates, useCoffeeLibrary, type CoffeeLibrary } from './coffeeLibrary'
import { journeyFor, recipeForBean, targetFor } from './dialJourney'
import { RestLine } from './RestLine'
import { CalibrationFlight } from './CalibrationFlight'
import { TasteSquare } from '../../components/TasteSquare/TasteSquare'
import { TASTE_ZONES } from '../insights/dialIn'
import { tasteWords } from '../insights/dialInText'
import { scanLabel, type LabelScanHandle } from './labelScan'
import { BeanImportError, importBeanFromUrl } from './webImport'
import './coffee.css'

export type CoffeeTab = 'beans' | 'gear' | 'presets' | 'calibrate'

interface CoffeeScreenProps {
  initialTab?: CoffeeTab
  /** Profile titles already in the library, so presets show "Added". */
  existingProfileTitles: string[]
  connected: boolean
  doseGrams?: number
  targetYield?: number
  onAddPreset: (id: PresetId) => Promise<boolean>
  onApplyStartingRecipe: (params: ChassisParams) => Promise<boolean>
  /** Sets the active profile's target yield (palate calibration). */
  onSetYield?: (grams: number) => Promise<boolean>
  onClose: () => void
}

const emptyDraft = (): BeanDraft => ({ name: '', tastingNotes: [] })

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="coffee-field"><span>{label}</span>{children}</label>
}

function Choice<Value extends string>({ label, value, options, onChange }: { label: string; value: Value | undefined; options: Array<{ value: Value; label: string }>; onChange: (value: Value) => void }) {
  return <fieldset className="coffee-choice"><legend>{label}</legend>
    <div>{options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} className={value === option.value ? 'coffee-choice--selected' : undefined} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>
  </fieldset>
}

function BeanEditor({ initial, existing, onSave, onCancel }: { initial?: Bean; existing: Bean[]; onSave: (draft: BeanDraft, replaceId?: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<BeanDraft>(() => initial ? { ...initial } : emptyDraft())
  const [mode, setMode] = useState<'choose' | 'form'>(initial ? 'form' : 'choose')
  const [url, setUrl] = useState('')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState<'scan' | 'import' | null>(null)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [duplicateOf, setDuplicateOf] = useState<Bean | null>(null)
  const scan = useRef<LabelScanHandle | null>(null)
  useEffect(() => () => scan.current?.cancel(), [])
  const merge = (found: Partial<BeanDraft>) => {
    setDraft(current => ({ ...current, ...Object.fromEntries(Object.entries(found).filter(([, value]) => value !== undefined && value !== '' && !(Array.isArray(value) && !value.length))) }))
    setMode('form')
  }
  const set = <Key extends keyof BeanDraft>(key: Key, value: BeanDraft[Key]) => setDraft(current => ({ ...current, [key]: value }))
  const onPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy('scan'); setProgress(0); setMessage(null)
    scan.current = scanLabel(file, setProgress)
    scan.current.promise.then(text => merge(parseBeanText(text))).catch(() => setMessage(t('library.coffee.scanFailed'))).finally(() => { setBusy(null); scan.current = null })
  }
  const onImport = async () => {
    setBusy('import'); setMessage(null)
    try { merge(await importBeanFromUrl(url)) }
    catch (error) {
      const reason = error instanceof BeanImportError ? error.reason : 'blocked'
      setMessage(reason === 'invalidUrl' ? t('library.coffee.importInvalid') : reason === 'noProduct' ? t('library.coffee.importNoProduct') : t('library.coffee.importBlocked'))
    } finally { setBusy(null) }
  }
  const save = () => {
    if (!draft.name.trim()) { setMessage(t('library.coffee.nameRequired')); return }
    const normalise = (value?: string) => value?.trim().toLowerCase() ?? ''
    const match = !initial && existing.find(bean => normalise(bean.name) === normalise(draft.name) && normalise(bean.roaster) === normalise(draft.roaster) && (bean.roastDate ?? '') === (draft.roastDate ?? ''))
    if (match && !duplicateOf) { setDuplicateOf(match); return }
    onSave({ ...draft, rawText: undefined }, initial?.id)
  }

  if (mode === 'choose') return <section className="coffee-card coffee-editor">
    <h2>{t('library.coffee.addTitle')}</h2>
    <div className="coffee-entry-options">
      <label className="coffee-entry-option">
        <input type="file" accept="image/*" capture="environment" onChange={onPhoto} disabled={busy !== null} />
        <strong>{t('library.coffee.scanLabel')}</strong><span>{busy === 'scan' ? t('library.coffee.scanning', { pct: Math.round(progress * 100) }) : t('library.coffee.scanHint')}</span>
      </label>
      <div className="coffee-entry-option">
        <strong>{t('library.coffee.importUrl')}</strong>
        <div className="coffee-inline"><input type="url" inputMode="url" placeholder="https://" value={url} onChange={event => setUrl(event.target.value)} /><button type="button" disabled={!url.trim() || busy !== null} onClick={() => void onImport()}>{busy === 'import' ? t('library.coffee.importing') : t('library.coffee.import')}</button></div>
      </div>
      <div className="coffee-entry-option">
        <strong>{t('library.coffee.pasteText')}</strong>
        <textarea rows={3} value={pasted} placeholder={t('library.coffee.pastePlaceholder')} onChange={event => setPasted(event.target.value)} />
        <button type="button" disabled={!pasted.trim()} onClick={() => merge(parseBeanText(pasted))}>{t('library.coffee.readText')}</button>
      </div>
      <button type="button" className="coffee-entry-option coffee-entry-option--manual" onClick={() => setMode('form')}><strong>{t('library.coffee.manual')}</strong></button>
    </div>
    {message && <p className="coffee-message" role="alert">{message}</p>}
    <div className="coffee-actions"><button type="button" className="coffee-secondary" onClick={onCancel}>{t('library.coffee.cancel')}</button></div>
  </section>

  return <section className="coffee-card coffee-editor">
    <h2>{initial ? t('library.coffee.editTitle') : t('library.coffee.reviewTitle')}</h2>
    {!initial && <p className="coffee-muted">{t('library.coffee.reviewHint')}</p>}
    <div className="coffee-grid">
      <Field label={t('library.coffee.field.name')}><input value={draft.name} onChange={event => set('name', event.target.value)} /></Field>
      <Field label={t('library.coffee.field.roaster')}><input value={draft.roaster ?? ''} onChange={event => set('roaster', event.target.value)} /></Field>
      <Field label={t('library.coffee.field.origin')}><input value={draft.origin ?? ''} onChange={event => set('origin', event.target.value)} /></Field>
      <Field label={t('library.coffee.field.region')}><input value={draft.region ?? ''} onChange={event => set('region', event.target.value)} /></Field>
      <Field label={t('library.coffee.field.producer')}><input value={draft.producer ?? ''} onChange={event => set('producer', event.target.value)} /></Field>
      <Field label={t('library.coffee.field.variety')}><input value={draft.variety ?? ''} onChange={event => set('variety', event.target.value)} /></Field>
      <Field label={t('library.coffee.field.process')}><input value={draft.process ?? ''} onChange={event => set('process', event.target.value)} /></Field>
      <Field label={t('library.coffee.field.roastDate')}><input type="date" value={draft.roastDate ?? ''} onChange={event => set('roastDate', event.target.value || undefined)} /></Field>
      <Field label={t('library.coffee.field.altitude')}><input type="number" inputMode="numeric" value={draft.altitudeMasl ?? ''} onChange={event => set('altitudeMasl', event.target.value ? Number(event.target.value) : undefined)} /></Field>
      <Field label={t('library.coffee.field.notes')}><input value={draft.tastingNotes.join(', ')} onChange={event => set('tastingNotes', event.target.value.split(',').map(note => note.trim()).filter(Boolean))} /></Field>
    </div>
    <Choice<RoastLevel> label={t('library.coffee.field.roastLevel')} value={draft.roastLevel} onChange={value => set('roastLevel', value)} options={[{ value: 'light', label: t('library.coffee.roast.light') }, { value: 'medium', label: t('library.coffee.roast.medium') }, { value: 'dark', label: t('library.coffee.roast.dark') }]} />
    <label className="coffee-toggle"><input type="checkbox" checked={draft.forMilk === true} onChange={event => set('forMilk', event.target.checked || undefined)} /><span>{t('library.coffee.forMilk')}</span></label>
    {draft.rawText && <details className="coffee-raw"><summary>{t('library.coffee.rawText')}</summary><pre>{draft.rawText}</pre></details>}
    {duplicateOf && <p className="coffee-message" role="alert">{t('library.coffee.duplicate', { name: duplicateOf.name })}</p>}
    {message && <p className="coffee-message" role="alert">{message}</p>}
    <div className="coffee-actions">
      <button type="button" className="coffee-secondary" onClick={onCancel}>{t('library.coffee.cancel')}</button>
      {duplicateOf && <button type="button" className="coffee-secondary" onClick={() => onSave({ ...duplicateOf }, duplicateOf.id)}>{t('library.coffee.useExisting')}</button>}
      <button type="button" className="coffee-primary" onClick={save}>{duplicateOf ? t('library.coffee.saveNewBag') : t('library.coffee.save')}</button>
    </div>
  </section>
}

function BeanSummary({ bean }: { bean: Bean }) {
  const age = daysOffRoast(bean)
  const facts = [bean.roaster, bean.origin, bean.process, bean.variety, bean.roastLevel ? t(`library.coffee.roast.${bean.roastLevel}`) : undefined, bean.forMilk ? t('library.coffee.withMilkShort') : undefined].filter(Boolean).join(' · ')
  return <div className="coffee-bean-summary">
    <strong>{bean.name}</strong>
    {facts && <span>{facts}</span>}
    <span>{age !== undefined ? t('library.coffee.daysOffRoast', { days: age }) : t('library.coffee.noRoastDate')}{bean.tastingNotes.length ? ` · ${bean.tastingNotes.join(', ')}` : ''}</span>
  </div>
}

function DialInCard({ library, bean, onUnpin }: { library: CoffeeLibrary; bean: Bean; onUnpin: () => void }) {
  const journey = journeyFor(library, bean.id)
  const beanRecipe = recipeForBean(library, bean)
  const recent = journey.entries.map((entry, index) => ({ entry, number: index + 1 })).slice(-6).reverse()
  const recipeLine = (recipe: { dose?: number; yield?: number; grindSetting?: string; temperatureC?: number }) => [
    recipe.dose && recipe.yield ? `${formatDecimal(recipe.dose, Number.isInteger(recipe.dose) ? 0 : 1)} → ${formatDecimal(Math.round(recipe.yield), 0)} g` : undefined,
    recipe.grindSetting ? t('shell.today.recipe.grind', { grind: recipe.grindSetting }) : undefined,
    recipe.temperatureC ? `${formatDecimal(recipe.temperatureC, 1)} °C` : undefined,
  ].filter(Boolean).join(' · ')
  return <section className="coffee-card coffee-dial">
    <div className="coffee-card__head"><h2>{t('library.coffee.dialTitle')}</h2>{journey.status === 'dialedIn' && <span className="coffee-badge">{t('library.coffee.dialedIn')}</span>}</div>
    <div className="coffee-dial__body">
      <div className="coffee-dial__square"><TasteSquare size="small" path={journey.entries.map(entry => ({ extraction: entry.extraction, strength: entry.strength }))} targetStrength={targetFor(bean.forMilk).strength} targetRadius={TASTE_ZONES.centre} /></div>
      <div className="coffee-dial__log">
        {!recent.length && <p className="coffee-muted">{t('library.coffee.dialEmpty')}</p>}
        <ol>{recent.map(({ entry, number }) => <li key={entry.key}><b>{number}</b><span>{tasteWords(entry)}{entry.finish === 'drying' ? ` · ${t('insights.taste.drying')}` : ''}</span><small>{recipeLine(entry)}</small></li>)}</ol>
      </div>
    </div>
    {beanRecipe && <div className="coffee-pinned">
      <p className="coffee-eyebrow">{beanRecipe.source === 'pinned' ? t('library.coffee.pinnedRecipe') : t('library.coffee.previousBagRecipe', { bean: beanRecipe.fromBean.name })}</p>
      <p className="coffee-pinned__recipe">{recipeLine(beanRecipe.recipe) || '—'}</p>
      {beanRecipe.recipe.profileName && <p className="coffee-muted">{beanRecipe.recipe.profileName}</p>}
      {beanRecipe.source === 'pinned' && <button type="button" className="coffee-link" onClick={onUnpin}>{t('library.coffee.unpin')}</button>}
    </div>}
  </section>
}

function BeansTab({ connected, doseGrams, onApplyStartingRecipe }: Pick<CoffeeScreenProps, 'connected' | 'doseGrams' | 'onApplyStartingRecipe'>) {
  const { library, update } = useCoffeeLibrary()
  const [editing, setEditing] = useState<Bean | 'new' | null>(null)
  const [applyState, setApplyState] = useState<'idle' | 'applying' | 'applied' | 'failed'>('idle')
  const [showArchived, setShowArchived] = useState(false)
  const loaded = activeBean(library)
  const recipe = startingRecipe(loaded, library.gear, doseGrams)
  const beans = [...library.beans].filter(bean => showArchived ? Boolean(bean.archivedAt) : !bean.archivedAt).sort((left, right) => (right.lastUsedAt ?? right.createdAt).localeCompare(left.lastUsedAt ?? left.createdAt))
  if (editing) return <BeanEditor initial={editing === 'new' ? undefined : editing} existing={library.beans} onCancel={() => setEditing(null)} onSave={(draft, replaceId) => {
    update(current => replaceId ? coffeeUpdates.loadBean(coffeeUpdates.updateBean(current, replaceId, draft), replaceId) : coffeeUpdates.addBean(current, draft).library)
    setEditing(null); setApplyState('idle')
  }} />
  const apply = async () => { setApplyState('applying'); setApplyState(await onApplyStartingRecipe(recipe.params).catch(() => false) ? 'applied' : 'failed') }
  return <>
    <section className="coffee-card">
      <h2>{t('library.coffee.loaded')}</h2>
      {loaded ? <><BeanSummary bean={loaded} /><RestLine bean={loaded} /></> : <p className="coffee-muted">{t('library.coffee.noneLoaded')}</p>}
      <div className="coffee-actions coffee-actions--start">
        <button type="button" className="coffee-primary" onClick={() => setEditing('new')}>{t('library.coffee.addBeans')}</button>
        {loaded && <button type="button" className="coffee-secondary" onClick={() => setEditing(loaded)}>{t('library.coffee.edit')}</button>}
        {loaded && <button type="button" className="coffee-secondary" onClick={() => update(current => coffeeUpdates.archiveBean(current, loaded.id, true))}>{t('library.coffee.finishBag')}</button>}
      </div>
    </section>
    {loaded && <DialInCard library={library} bean={loaded} onUnpin={() => update(current => coffeeUpdates.unpinRecipe(current, loaded.id))} />}
    {(!loaded || !recipeForBean(library, loaded)) && <section className="coffee-card">
      <h2>{t('library.coffee.startingRecipe')}</h2>
      <p className="coffee-muted">{t('library.coffee.startingRecipeHint')}</p>
      <dl className="coffee-recipe">
        <div><dt>{t('library.coffee.recipe.temperature')}</dt><dd>{formatDecimal(recipe.params.temperatureC, 1)} °C</dd></div>
        <div><dt>{t('library.coffee.recipe.ratio')}</dt><dd>1:{formatDecimal(recipe.ratio, 1)} · {recipe.params.targetWeight} g</dd></div>
        <div><dt>{t('library.coffee.recipe.soak')}</dt><dd>{recipe.params.soakSeconds} s</dd></div>
        <div><dt>{t('library.coffee.recipe.flow')}</dt><dd>{formatDecimal(recipe.params.flowTarget, 1)} ml/s</dd></div>
        <div><dt>{t('library.coffee.recipe.ceiling')}</dt><dd>{formatDecimal(recipe.params.pressureCapBar, 1)} bar</dd></div>
      </dl>
      <ul className="coffee-reasons">{recipe.reasons.map(reason => <li key={reason}>{t(`library.coffee.reason.${reason}`)}</li>)}</ul>
      <div className="coffee-actions coffee-actions--start">
        <button type="button" className="coffee-primary" disabled={!connected || applyState === 'applying' || applyState === 'applied'} onClick={() => void apply()}>{applyState === 'applying' ? t('insights.dialIn.apply.applying') : applyState === 'applied' ? t('library.coffee.recipeApplied') : t('library.coffee.applyRecipe')}</button>
        <span className="coffee-muted">{!connected ? t('library.coffee.connectToApply') : applyState === 'failed' ? t('insights.dialIn.apply.failed') : t('library.coffee.applyRecipeDetail')}</span>
      </div>
    </section>}
    <section className="coffee-card">
      <div className="coffee-card__head"><h2>{showArchived ? t('library.coffee.finishedBags') : t('library.coffee.yourBeans')}</h2><button type="button" className="coffee-link" onClick={() => setShowArchived(value => !value)}>{showArchived ? t('library.coffee.showCurrent') : t('library.coffee.showFinished')}</button></div>
      {!beans.length && <p className="coffee-muted">{showArchived ? t('library.coffee.noFinished') : t('library.coffee.noBeans')}</p>}
      <ul className="coffee-bean-list">{beans.map(bean => <li key={bean.id} className={bean.id === loaded?.id ? 'coffee-bean--loaded' : undefined}>
        <BeanSummary bean={bean} />
        <div className="coffee-bean-actions">
          {bean.id !== loaded?.id && <button type="button" className="coffee-secondary" onClick={() => { update(current => coffeeUpdates.loadBean(current, bean.id)); setApplyState('idle') }}>{bean.archivedAt ? t('library.coffee.restore') : t('library.coffee.load')}</button>}
          <button type="button" className="coffee-secondary" onClick={() => setEditing(bean)}>{t('library.coffee.edit')}</button>
        </div>
      </li>)}</ul>
    </section>
  </>
}

function GearTab() {
  const { library, update } = useCoffeeLibrary()
  const { preferences, updatePreferences } = useSmakPreferences()
  const gear = library.gear
  const set = (patch: Partial<GearSetup>) => update(current => coffeeUpdates.setGear(current, patch))
  const numberOrUndefined = (value: string) => value.trim() === '' ? undefined : Number(value)
  return <>
    <section className="coffee-card">
      <h2>{t('library.coffee.styleTitle')}</h2>
      <Choice<BrewStyle> label={t('library.coffee.style')} value={gear.style} onChange={style => set({ style })} options={[{ value: 'clarity', label: t('library.coffee.style.clarity') }, { value: 'body', label: t('library.coffee.style.body') }]} />
      <p className="coffee-muted">{gear.style === 'body' ? t('library.coffee.style.bodyHint') : t('library.coffee.style.clarityHint')}</p>
      <Choice<'calm' | 'chart'> label={t('library.coffee.liveViewDefault')} value={preferences.liveView} onChange={liveView => updatePreferences({ liveView })} options={[{ value: 'calm', label: t('library.coffee.liveView.calm') }, { value: 'chart', label: t('library.coffee.liveView.chart') }]} />
    </section>
    <section className="coffee-card">
      <h2>{t('library.coffee.grinderTitle')}</h2>
      <div className="coffee-grid">
        <Field label={t('library.coffee.grinderName')}><input value={gear.grinderName ?? ''} placeholder="DF64, Niche Zero, Lagom P100…" onChange={event => set({ grinderName: event.target.value })} /></Field>
        <Field label={t('library.coffee.grindUnit')}><input value={gear.grindUnit ?? ''} placeholder={t('library.coffee.grindUnitPlaceholder')} onChange={event => set({ grindUnit: event.target.value })} /></Field>
        <Field label={t('library.coffee.grindStep')}><input type="number" inputMode="decimal" step="0.1" min="0.1" value={gear.grindStepSize ?? 1} onChange={event => set({ grindStepSize: numberOrUndefined(event.target.value) })} /></Field>
      </div>
      <Choice<BurrClass> label={t('library.coffee.burrs')} value={gear.burrs} onChange={burrs => set({ burrs })} options={[{ value: 'conical', label: t('library.coffee.burrs.conical') }, { value: 'bimodalFlat', label: t('library.coffee.burrs.bimodalFlat') }, { value: 'unimodalFlat', label: t('library.coffee.burrs.unimodalFlat') }]} />
    </section>
    <section className="coffee-card">
      <h2>{t('library.coffee.basketTitle')}</h2>
      <Choice<'standard' | 'highExtraction'> label={t('library.coffee.basket')} value={gear.basket} onChange={basket => set({ basket })} options={[{ value: 'standard', label: t('library.coffee.basket.standard') }, { value: 'highExtraction', label: t('library.coffee.basket.highExtraction') }]} />
      <div className="coffee-grid">
        <Field label={t('library.coffee.basketDose')}><input type="number" inputMode="decimal" value={gear.basketDoseGrams ?? ''} onChange={event => set({ basketDoseGrams: numberOrUndefined(event.target.value) })} /></Field>
        <Field label={t('library.coffee.water')}><input type="number" inputMode="numeric" value={gear.waterAlkalinityPpm ?? ''} placeholder="40" onChange={event => set({ waterAlkalinityPpm: numberOrUndefined(event.target.value) })} /></Field>
      </div>
      <label className="coffee-toggle"><input type="checkbox" checked={gear.fixedDose === true} onChange={event => set({ fixedDose: event.target.checked })} /><span>{t('library.coffee.fixedDose')}</span></label>
      <label className="coffee-toggle"><input type="checkbox" checked={gear.bottomPaperFilter === true} onChange={event => set({ bottomPaperFilter: event.target.checked })} /><span>{t('library.coffee.paperFilter')}</span></label>
      <label className="coffee-toggle"><input type="checkbox" checked={gear.puckScreen === true} onChange={event => set({ puckScreen: event.target.checked })} /><span>{t('library.coffee.puckScreen')}</span></label>
      <p className="coffee-muted">{t('library.coffee.gearHint')}</p>
    </section>
  </>
}

function PresetsTab({ existingProfileTitles, connected, onAddPreset }: Pick<CoffeeScreenProps, 'existingProfileTitles' | 'connected' | 'onAddPreset'>) {
  const [state, setState] = useState<Partial<Record<PresetId, 'adding' | 'added' | 'failed'>>>({})
  const add = async (id: PresetId) => { setState(current => ({ ...current, [id]: 'adding' })); const ok = await onAddPreset(id).catch(() => false); setState(current => ({ ...current, [id]: ok ? 'added' : 'failed' })) }
  return <>{RESEARCH_PRESETS.map(preset => {
    const exists = existingProfileTitles.includes(preset.profile.title ?? '')
    const status = exists ? 'added' : state[preset.id]
    return <section className="coffee-card coffee-preset" key={preset.id}>
      <span className="coffee-preset__style">{t(`library.coffee.beanStyle.${preset.beanStyle}`)}</span>
      <h2>{t(`library.coffee.preset.${preset.id}`)}</h2>
      <p>{t(`library.coffee.presetWhy.${preset.id}`)}</p>
      <dl className="coffee-recipe">
        <div><dt>{t('library.coffee.recipe.dose')}</dt><dd>{preset.doseGrams} g</dd></div>
        <div><dt>{t('library.coffee.recipe.ratio')}</dt><dd>1:{formatDecimal(preset.ratio, 1)} · {preset.targetWeight} g</dd></div>
        <div><dt>{t('library.coffee.recipe.source')}</dt><dd>{preset.source}</dd></div>
      </dl>
      <div className="coffee-actions coffee-actions--start">
        <button type="button" className="coffee-primary" disabled={!connected || status === 'adding' || status === 'added'} onClick={() => void add(preset.id)}>{status === 'added' ? t('library.coffee.presetAdded') : status === 'adding' ? t('library.coffee.presetAdding') : t('library.coffee.presetAdd')}</button>
        {status === 'failed' && <span className="coffee-message">{t('insights.dialIn.apply.failed')}</span>}
        {!connected && <span className="coffee-muted">{t('library.coffee.connectToApply')}</span>}
      </div>
    </section>
  })}</>
}

export function CoffeeScreen({ initialTab = 'beans', existingProfileTitles, connected, doseGrams, targetYield, onAddPreset, onApplyStartingRecipe, onSetYield, onClose }: CoffeeScreenProps) {
  const [tab, setTab] = useState<CoffeeTab>(initialTab)
  const tabs: Array<{ id: CoffeeTab; label: string }> = [{ id: 'beans', label: t('library.coffee.tab.beans') }, { id: 'gear', label: t('library.coffee.tab.gear') }, { id: 'presets', label: t('library.coffee.tab.presets') }, { id: 'calibrate', label: t('library.coffee.tab.calibrate') }]
  return <main className="coffee-screen">
    <header className="coffee-header">
      <h1>{t('library.coffee.title')}</h1>
      <nav className="coffee-tabs" role="tablist" aria-label={t('library.coffee.title')}>{tabs.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'coffee-tab--selected' : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
      <button type="button" className="live-pull-action live-pull-action--close" onClick={onClose}>{t('library.coffee.close')}</button>
    </header>
    <div className="coffee-body" role="tabpanel">
      {tab === 'beans' && <BeansTab connected={connected} doseGrams={doseGrams} onApplyStartingRecipe={onApplyStartingRecipe} />}
      {tab === 'gear' && <GearTab />}
      {tab === 'presets' && <PresetsTab existingProfileTitles={existingProfileTitles} connected={connected} onAddPreset={onAddPreset} />}
      {tab === 'calibrate' && <CalibrationFlight doseGrams={doseGrams} targetYield={targetYield} connected={connected} onSetYield={onSetYield} />}
    </div>
  </main>
}

/** Home-screen entry: the coffee currently loaded, or a prompt to add one. */
export function CoffeeEntry({ onOpen }: { onOpen: () => void }) {
  const { library } = useCoffeeLibrary()
  const bean = activeBean(library)
  const age = daysOffRoast(bean)
  return <button type="button" className="coffee-entry" onClick={onOpen}>
    <i aria-hidden="true" />
    <span>{bean ? bean.name : t('library.coffee.entryEmpty')}</span>
    {bean && age !== undefined && <small>{t('library.coffee.daysShort', { days: age })}</small>}
  </button>
}
