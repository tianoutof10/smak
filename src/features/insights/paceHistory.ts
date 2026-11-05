import { BASELINE } from '../../domain/shotPace.ts'

/**
 * Each profile's recent weight flow (g/s after first drops), so "fast" and
 * "slow" mean fast or slow for this barista on this profile. Device-local,
 * per gateway; one entry per pull (re-recording a pull replaces it).
 */
interface PaceEntry { key: string; rate: number }
type PaceStore = Record<string, PaceEntry[]>

const keyFor = (source: string) => `smak-pace-v1:${source}`
const memory = new Map<string, PaceStore>()

function read(source: string): PaceStore {
  try {
    const stored = localStorage.getItem(keyFor(source))
    if (stored) {
      const value = JSON.parse(stored)
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as PaceStore
    }
  } catch { /* memory fallback */ }
  return memory.get(source) ?? {}
}

/** Recent rates for a profile, excluding one pull (the one being judged). */
export function paceHistory(source: string, profileId: string | undefined, excludeKey?: string) {
  if (!profileId) return []
  const entries = read(source)[profileId]
  return Array.isArray(entries) ? entries.filter(entry => entry && entry.key !== excludeKey && typeof entry.rate === 'number' && Number.isFinite(entry.rate) && entry.rate > 0).map(entry => entry.rate) : []
}

export function recordPace(source: string, profileId: string, key: string, rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) return
  const store = read(source)
  const current = (Array.isArray(store[profileId]) ? store[profileId] : []).filter(entry => entry?.key !== key)
  const next: PaceStore = { ...store, [profileId]: [...current, { key, rate: Math.round(rate * 1000) / 1000 }].slice(-BASELINE.keep) }
  memory.set(source, next)
  try { localStorage.setItem(keyFor(source), JSON.stringify(next)) } catch { /* memory only */ }
}
