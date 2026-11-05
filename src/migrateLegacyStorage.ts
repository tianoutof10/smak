// Imported first by main.tsx, so it runs before any module reads storage.
import { migrateLocalStorage } from './api/decaid/legacyNames.ts'

migrateLocalStorage()
