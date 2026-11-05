import type { StageAdvanceEvidence } from './stageMoveOn.ts'
import type { PreviousShot } from '../../domain/brewing.ts'

export interface SavedStageEvidence { events: StageAdvanceEvidence[]; stopReason?: string }
export function withStageEvidence(detail: PreviousShot, saved?: SavedStageEvidence): PreviousShot {
  if (!saved || (JSON.stringify(detail.stageEvidence ?? []) === JSON.stringify(saved.events) && (!saved.stopReason || detail.stopReason === saved.stopReason))) return detail
  return { ...detail, stageEvidence: saved.events, stopReason: saved.stopReason ?? detail.stopReason, stageReasons: undefined }
}
// Small source-scoped journal: survives reloads before a shot detail is fetched.
// Telemetry stays in the existing IndexedDB history cache, not localStorage.
const keyFor = (source: string) => `smak-stage-evidence-v1:${source}`
const memory = new Map<string, Record<string, SavedStageEvidence>>()
function read(source: string): Record<string, SavedStageEvidence> {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(source)) || '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
  } catch { /* memory-only when storage is unavailable */ }
  return memory.get(source) ?? {}
}
export function readStageEvidence(source: string, id?: string): SavedStageEvidence | undefined {
  if (!id) return undefined
  const value = read(source)[id]
  if (!value || !Array.isArray(value.events)) return undefined
  return { events: value.events.filter(e => e && Number.isInteger(e.frame) && Number.isFinite(e.timestamp) && ['manual', 'weight'].includes(e.reason)),
    stopReason: typeof value.stopReason === 'string' ? value.stopReason : undefined }
}
export function saveStageEvidence(source: string, id: string, value: SavedStageEvidence) {
  const old = read(source), previous = readStageEvidence(source, id)
  const events = [...(previous?.events ?? []), ...value.events].filter((e, i, all) => all.findIndex(other => other.frame === e.frame && other.timestamp === e.timestamp && other.reason === e.reason) === i)
  const entries = Object.entries(old).filter(([shotId]) => shotId !== id).slice(-999)
  const next = Object.fromEntries([...entries, [id, { events, stopReason: value.stopReason ?? previous?.stopReason }]])
  memory.set(source, next)
  try { localStorage.setItem(keyFor(source), JSON.stringify(next)) } catch { /* preserve in memory */ }
}
