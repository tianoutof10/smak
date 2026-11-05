/**
 * Smak began as a fork of Bestpresso. Data written under the old name is
 * carried over to Smak's names so nothing is lost:
 *
 * - Tablet storage: every `bestpresso…` localStorage key is copied to the
 *   matching `smak…` key once, at start-up, when the new key is empty. The old
 *   keys are left in place, so switching back to Bestpresso still works.
 * - Profile metadata on the machine: `bestpresso…` keys are read as `smak…`
 *   keys and dropped, so the next save stores them under Smak's names only
 *   (keeping both would let a deleted value come back from the old key).
 */
const LEGACY = 'bestpresso'
const CURRENT = 'smak'

const renamed = (key: string) => key.startsWith(LEGACY) ? CURRENT + key.slice(LEGACY.length) : undefined

export function migrateLocalStorage(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) {
  if (!storage) return 0
  let copied = 0
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key))
    for (const key of keys) {
      const target = renamed(key)
      if (!target || storage.getItem(target) !== null) continue
      const value = storage.getItem(key)
      if (value === null) continue
      storage.setItem(target, value)
      copied++
    }
  } catch { /* storage unavailable: nothing to migrate */ }
  return copied
}

export function migrateMetadata<Metadata extends Record<string, unknown> | null | undefined>(metadata: Metadata): Metadata {
  if (!metadata || typeof metadata !== 'object' || !Object.keys(metadata).some(key => key.startsWith(LEGACY))) return metadata
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) if (!key.startsWith(LEGACY)) next[key] = value
  for (const [key, value] of Object.entries(metadata)) {
    const target = renamed(key)
    if (target && !(target in next)) next[target] = value
  }
  return next as Metadata
}

export function migrateRecord<Record extends { metadata?: unknown }>(record: Record): Record {
  if (!record || typeof record !== 'object' || !record.metadata || typeof record.metadata !== 'object') return record
  const metadata = migrateMetadata(record.metadata as { [key: string]: unknown })
  return metadata === record.metadata ? record : { ...record, metadata }
}
