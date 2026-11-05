import { t } from '../../i18n/index.ts'
import type { HistoryCache } from './historyData.ts'
import { validHistoryCache } from './historyData.ts'

export interface HistoryStorage { read(source: string): Promise<HistoryCache | null>; write(cache: HistoryCache): Promise<void> }
export function browserHistoryStorage(): HistoryStorage {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('smak-shot-history', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('sources', { keyPath: 'source' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error(t('common.error.storageBusy')))
  })
  return {
    async read(source) {
      const db = await open()
      try {
        return await new Promise<HistoryCache | null>((resolve, reject) => {
          const request = db.transaction('sources', 'readonly').objectStore('sources').get(source)
          request.onsuccess = () => {
            const value: unknown = request.result
            resolve(validHistoryCache(value, source) ? value : null)
          }
          request.onerror = () => reject(request.error)
        })
      } finally { db.close() }
    },
    async write(cache) {
      const db = await open()
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction('sources', 'readwrite')
          transaction.objectStore('sources').put(cache)
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () => reject(transaction.error)
        })
      } finally { db.close() }
    },
  }
}
