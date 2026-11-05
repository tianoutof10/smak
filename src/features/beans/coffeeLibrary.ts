import { useCallback, useEffect, useState } from 'react'
import { getDecaidEndpoints } from '../../api/decaid/config.ts'
import type { Bean, BeanDraft } from '../../domain/beans.ts'
import { DEFAULT_GEAR, normalizeGear, type GearSetup } from '../../domain/gear.ts'
import { createId } from '../../utils/browserCompatibility.ts'

/**
 * Device-local coffee library, scoped per Decaid gateway: beans (bags), the
 * loaded bean, the barista's gear, bean × profile grind references and
 * shot → bean links (docs/bean-label-ocr.md data model). Never written to Decaid.
 */
export interface GrindReference { grindSetting: string; updatedAt: string }
export interface ShotBeanLink { beanId: string; profileId?: string; grindSetting?: string }

/** One tasted shot of a bag: where it landed on the taste square and the recipe that made it. */
export interface DialEntry {
  /** Stable per pull (`live:<startedAt>` or the Decaid shot ID). Re-tasting a shot replaces its entry. */
  key: string
  at: string
  extraction: number
  strength: number
  finish: 'clean' | 'drying'
  milk?: boolean
  dose?: number
  yield?: number
  grindSetting?: string
  temperatureC?: number
  profileId?: string
  profileName?: string
  tdsPct?: number
  pace?: 'fast' | 'normal' | 'slow'
  beanAgeDays?: number
}

/** The recipe a bag was dialed in on. */
export interface PinnedRecipe {
  profileId?: string
  profileName?: string
  dose?: number
  yield?: number
  grindSetting?: string
  temperatureC?: number
  pinnedAt: string
  beanAgeDays?: number
}

export interface CoffeeLibrary {
  beans: Bean[]
  activeBeanId?: string
  gear: GearSetup
  grindReferences: Record<string, GrindReference>
  shotBeans: Record<string, ShotBeanLink>
  dialLog: Record<string, DialEntry[]>
  pinned: Record<string, PinnedRecipe>
}

const MAX_BEANS = 300
const MAX_SHOT_LINKS = 1_000
const MAX_DIAL_ENTRIES = 40
const EMPTY: CoffeeLibrary = { beans: [], gear: DEFAULT_GEAR, grindReferences: {}, shotBeans: {}, dialLog: {}, pinned: {} }
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const axis = (value: unknown) => { const number = finite(value); return number === undefined ? undefined : Math.max(-1, Math.min(1, number)) }

export function normalizeDialEntry(value: unknown): DialEntry | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<DialEntry>
  const extraction = axis(candidate.extraction), strength = axis(candidate.strength)
  if (!text(candidate.key) || extraction === undefined || strength === undefined) return undefined
  const optional = {
    milk: candidate.milk === true ? true : undefined, dose: finite(candidate.dose), yield: finite(candidate.yield), grindSetting: text(candidate.grindSetting, 20),
    temperatureC: finite(candidate.temperatureC), profileId: text(candidate.profileId), profileName: text(candidate.profileName), tdsPct: finite(candidate.tdsPct),
    pace: candidate.pace === 'fast' || candidate.pace === 'normal' || candidate.pace === 'slow' ? candidate.pace : undefined, beanAgeDays: finite(candidate.beanAgeDays),
  }
  return { key: candidate.key!, at: text(candidate.at) ?? new Date(0).toISOString(), extraction, strength, finish: candidate.finish === 'drying' ? 'drying' : 'clean', ...Object.fromEntries(Object.entries(optional).filter(([, entry]) => entry !== undefined)) }
}

export function normalizePinned(value: unknown): PinnedRecipe | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<PinnedRecipe>
  const optional = { profileId: text(candidate.profileId), profileName: text(candidate.profileName), dose: finite(candidate.dose), yield: finite(candidate.yield), grindSetting: text(candidate.grindSetting, 20), temperatureC: finite(candidate.temperatureC), beanAgeDays: finite(candidate.beanAgeDays) }
  return { pinnedAt: text(candidate.pinnedAt) ?? new Date(0).toISOString(), ...Object.fromEntries(Object.entries(optional).filter(([, entry]) => entry !== undefined)) }
}
const keyFor = (source: string) => `smak-coffee-v1:${source}`
const changeEvent = 'smak:coffee-changed'
const memory = new Map<string, CoffeeLibrary>()

const text = (value: unknown, max = 120) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined

export function normalizeBean(value: unknown): Bean | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<Bean>
  const name = text(candidate.name)
  if (!name || !text(candidate.id)) return undefined
  return {
    id: candidate.id!, name,
    roaster: text(candidate.roaster), origin: text(candidate.origin), region: text(candidate.region), producer: text(candidate.producer),
    variety: text(candidate.variety), process: text(candidate.process),
    roastLevel: candidate.roastLevel === 'light' || candidate.roastLevel === 'medium' || candidate.roastLevel === 'dark' ? candidate.roastLevel : undefined,
    roastDate: typeof candidate.roastDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate.roastDate) ? candidate.roastDate : undefined,
    altitudeMasl: typeof candidate.altitudeMasl === 'number' && Number.isFinite(candidate.altitudeMasl) ? candidate.altitudeMasl : undefined,
    tastingNotes: Array.isArray(candidate.tastingNotes) ? candidate.tastingNotes.flatMap(note => text(note, 40) ?? []).slice(0, 8) : [],
    url: text(candidate.url, 500), ...(candidate.forMilk === true ? { forMilk: true } : {}), createdAt: text(candidate.createdAt) ?? new Date(0).toISOString(),
    lastUsedAt: text(candidate.lastUsedAt), archivedAt: text(candidate.archivedAt),
  }
}

export function normalizeLibrary(value: unknown): CoffeeLibrary {
  if (!value || typeof value !== 'object') return EMPTY
  const candidate = value as Partial<CoffeeLibrary>
  const beans = (Array.isArray(candidate.beans) ? candidate.beans : []).flatMap(bean => normalizeBean(bean) ?? []).slice(-MAX_BEANS)
  const activeBeanId = beans.some(bean => bean.id === candidate.activeBeanId && !bean.archivedAt) ? candidate.activeBeanId : undefined
  const record = <T>(input: unknown, check: (entry: unknown) => entry is T) => input && typeof input === 'object' ? Object.fromEntries(Object.entries(input).filter(([, entry]) => check(entry))) as Record<string, T> : {}
  return {
    beans, activeBeanId, gear: normalizeGear(candidate.gear),
    grindReferences: record(candidate.grindReferences, (entry): entry is GrindReference => typeof (entry as GrindReference)?.grindSetting === 'string'),
    shotBeans: record(candidate.shotBeans, (entry): entry is ShotBeanLink => typeof (entry as ShotBeanLink)?.beanId === 'string'),
    dialLog: Object.fromEntries(Object.entries(candidate.dialLog && typeof candidate.dialLog === 'object' ? candidate.dialLog : {}).flatMap(([beanId, entries]) => {
      const list = (Array.isArray(entries) ? entries : []).flatMap(entry => normalizeDialEntry(entry) ?? []).slice(-MAX_DIAL_ENTRIES)
      return list.length && beans.some(bean => bean.id === beanId) ? [[beanId, list]] : []
    })),
    pinned: Object.fromEntries(Object.entries(candidate.pinned && typeof candidate.pinned === 'object' ? candidate.pinned : {}).flatMap(([beanId, pin]) => {
      const normal = normalizePinned(pin)
      return normal && beans.some(bean => bean.id === beanId) ? [[beanId, normal]] : []
    })),
  }
}

export function readCoffeeLibrary(source = getDecaidEndpoints().apiBase): CoffeeLibrary {
  try {
    const stored = localStorage.getItem(keyFor(source))
    if (stored) return normalizeLibrary(JSON.parse(stored))
  } catch { /* memory fallback */ }
  return memory.get(source) ?? EMPTY
}

function write(source: string, next: CoffeeLibrary) {
  memory.set(source, next)
  try { localStorage.setItem(keyFor(source), JSON.stringify(next)) } catch { /* memory only */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(changeEvent, { detail: { source } }))
  return next
}

export const grindReferenceKey = (beanId: string, profileId: string) => `${beanId}::${profileId}`

/** Pure updates, exported for tests. */
export const coffeeUpdates = {
  addBean(library: CoffeeLibrary, draft: BeanDraft, now = new Date()): { library: CoffeeLibrary; bean: Bean } {
    const bean = normalizeBean({ ...draft, id: `bean-${createId()}`, createdAt: now.toISOString() })!
    return { library: { ...library, beans: [...library.beans, bean].slice(-MAX_BEANS), activeBeanId: bean.id }, bean }
  },
  updateBean(library: CoffeeLibrary, id: string, patch: Partial<BeanDraft>): CoffeeLibrary {
    return { ...library, beans: library.beans.map(bean => bean.id === id ? normalizeBean({ ...bean, ...patch, id, createdAt: bean.createdAt }) ?? bean : bean) }
  },
  loadBean(library: CoffeeLibrary, id: string | undefined, now = new Date()): CoffeeLibrary {
    return { ...library, activeBeanId: id, beans: library.beans.map(bean => bean.id === id ? { ...bean, lastUsedAt: now.toISOString(), archivedAt: undefined } : bean) }
  },
  archiveBean(library: CoffeeLibrary, id: string, archived: boolean, now = new Date()): CoffeeLibrary {
    return { ...library, activeBeanId: archived && library.activeBeanId === id ? undefined : library.activeBeanId, beans: library.beans.map(bean => bean.id === id ? { ...bean, archivedAt: archived ? now.toISOString() : undefined } : bean) }
  },
  setGear(library: CoffeeLibrary, gear: Partial<GearSetup>): CoffeeLibrary {
    return { ...library, gear: normalizeGear({ ...library.gear, ...gear }) }
  },
  rememberGrind(library: CoffeeLibrary, beanId: string, profileId: string, grindSetting: string, now = new Date()): CoffeeLibrary {
    return { ...library, grindReferences: { ...library.grindReferences, [grindReferenceKey(beanId, profileId)]: { grindSetting, updatedAt: now.toISOString() } } }
  },
  recordTasting(library: CoffeeLibrary, beanId: string, entry: DialEntry): CoffeeLibrary {
    const normal = normalizeDialEntry(entry)
    if (!normal || !library.beans.some(bean => bean.id === beanId)) return library
    const current = (library.dialLog[beanId] ?? []).filter(existing => existing.key !== normal.key)
    return { ...library, dialLog: { ...library.dialLog, [beanId]: [...current, normal].slice(-MAX_DIAL_ENTRIES) } }
  },
  pinRecipe(library: CoffeeLibrary, beanId: string, recipe: Omit<PinnedRecipe, 'pinnedAt'>, now = new Date()): CoffeeLibrary {
    const normal = normalizePinned({ ...recipe, pinnedAt: now.toISOString() })
    if (!normal || !library.beans.some(bean => bean.id === beanId)) return library
    return { ...library, pinned: { ...library.pinned, [beanId]: normal } }
  },
  unpinRecipe(library: CoffeeLibrary, beanId: string): CoffeeLibrary {
    const pinned = { ...library.pinned }
    delete pinned[beanId]
    return { ...library, pinned }
  },
  linkShot(library: CoffeeLibrary, shotId: string, link: ShotBeanLink, now = new Date()): CoffeeLibrary {
    const entries = Object.entries(library.shotBeans).filter(([id]) => id !== shotId).slice(-(MAX_SHOT_LINKS - 1))
    return { ...library, shotBeans: Object.fromEntries([...entries, [shotId, link]]), beans: library.beans.map(bean => bean.id === link.beanId ? { ...bean, lastUsedAt: now.toISOString() } : bean) }
  },
}

export const activeBean = (library: CoffeeLibrary) => library.beans.find(bean => bean.id === library.activeBeanId && !bean.archivedAt)

/** Grind reference precedence from the bean-label spec: bean × profile, then the profile's own setting. */
export function grindReferenceFor(library: CoffeeLibrary, beanId: string | undefined, profileId: string | undefined, profileGrind?: string) {
  if (beanId && profileId) {
    const saved = library.grindReferences[grindReferenceKey(beanId, profileId)]
    if (saved) return saved.grindSetting
  }
  return profileGrind && profileGrind !== '—' ? profileGrind : undefined
}

export function useCoffeeLibrary() {
  const source = getDecaidEndpoints().apiBase
  const [library, setLibrary] = useState(() => readCoffeeLibrary(source))
  useEffect(() => {
    const refresh = () => setLibrary(readCoffeeLibrary(source))
    const onStorage = (event: StorageEvent) => { if (event.key === keyFor(source) || event.key === null) refresh() }
    window.addEventListener(changeEvent, refresh)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener(changeEvent, refresh); window.removeEventListener('storage', onStorage) }
  }, [source])
  const update = useCallback((change: (current: CoffeeLibrary) => CoffeeLibrary) => setLibrary(write(source, change(readCoffeeLibrary(source)))), [source])
  return { library, update, source }
}
