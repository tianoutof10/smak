import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateLocalStorage, migrateMetadata, migrateRecord } from '../src/api/decaid/legacyNames.ts'

const memoryStorage = (entries: Record<string, string>) => {
  const map = new Map(Object.entries(entries))
  return { get length() { return map.size }, key: (index: number) => [...map.keys()][index] ?? null, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) }, map }
}

test('tablet data saved under Bestpresso keys is copied to Smak keys once, never overwriting', () => {
  const storage = memoryStorage({ 'bestpresso-coffee-v1:http://x/api/v1': '{"beans":[]}', 'bestpresso.preferences.v1': '{"theme":"nordic"}', bestpressoGateway: '10.0.0.5', 'smak.preferences.v1': '{"theme":"light"}', reaHostname: 'h' })
  assert.equal(migrateLocalStorage(storage), 2)
  assert.equal(storage.getItem('smak-coffee-v1:http://x/api/v1'), '{"beans":[]}')
  assert.equal(storage.getItem('smakGateway'), '10.0.0.5')
  assert.equal(storage.getItem('smak.preferences.v1'), '{"theme":"light"}', 'existing Smak value kept')
  assert.equal(storage.getItem('bestpresso.preferences.v1'), '{"theme":"nordic"}', 'old key kept for Bestpresso')
  assert.equal(migrateLocalStorage(storage), 0, 'second run copies nothing')
})

test('profile metadata: Bestpresso keys become Smak keys and are dropped, so a deleted value cannot come back', () => {
  assert.deepEqual(migrateMetadata({ bestpressoChassis: { soakSeconds: 8 }, bestpressoTargetYield: 0, other: 1 }), { other: 1, smakChassis: { soakSeconds: 8 }, smakTargetYield: 0 })
  assert.deepEqual(migrateMetadata({ bestpressoSource: 'imported', smakSource: 'created' }), { smakSource: 'created' })
  const untouched = { a: 1 }
  assert.equal(migrateMetadata(untouched), untouched)
  assert.equal(migrateMetadata(null), null)
  assert.deepEqual(migrateRecord({ id: 'p', metadata: { bestpressoCreatedAt: 't' } }), { id: 'p', metadata: { smakCreatedAt: 't' } })
})
