import type { BrewProfile } from '../../domain/brewing'
import type { DecaidProfileRecord } from '../../api/decaid/types'
import { t } from '../../i18n/index.ts'

export type ProfileSource = 'Created' | 'Imported' | 'Built-in' | 'Saved'
export type LibrarySource = 'Preloaded' | 'Imported' | 'My profiles'
export type LibrarySection = 'All profiles' | 'Favorites' | LibrarySource

/** Internal ids stay the union values above; only the displayed wording is looked up here (Konzept 1.4b). */
export const librarySectionLabel = (section: LibrarySection): string =>
  section === 'All profiles' ? t('library.section.allProfiles')
  : section === 'Favorites' ? t('library.section.favorites')
  : section === 'Preloaded' ? t('library.source.preloaded')
  : section === 'Imported' ? t('library.source.imported')
  : t('library.source.myProfiles')
export const librarySourceLabel = (source: LibrarySource): string => librarySectionLabel(source)

/** Known Decaid beverage types get a translated label; anything else is shown as Decaid sent it. */
export function beverageTypeLabel(beverageType: string | undefined): string {
  switch (beverageType) {
    case 'espresso': return t('library.beverageType.espresso')
    case 'pourover': return t('library.beverageType.pourover')
    case 'cleaning': return t('library.beverageType.cleaning')
    case 'calibrate': return t('library.beverageType.calibrate')
    case 'manual': return t('library.beverageType.manual')
    default: return beverageType ?? '—'
  }
}

export function sourceForRecord(record: DecaidProfileRecord): ProfileSource {
  if (record.isDefault === true) return 'Built-in'
  const origin = record.metadata?.smakSource
  return origin === 'created' ? 'Created' : origin === 'imported' ? 'Imported' : 'Saved'
}
export const profileLibrarySource = (profile: BrewProfile): LibrarySource =>
  profile.source === 'Built-in' ? 'Preloaded' : profile.source === 'Imported' ? 'Imported' : 'My profiles'
export function librarySaveMetadata(metadata: Record<string, unknown> | null | undefined, source: DecaidProfileRecord | undefined, overwrite: boolean, now: string) {
  const merged = { ...source?.metadata, ...metadata }
  if (overwrite) return merged
  return { ...merged, smakSource: !source && merged.smakSource === 'imported' ? 'imported' : 'created', smakCreatedAt: now }
}
export function filterLibraryProfiles(profiles: BrewProfile[], options: { section: LibrarySection; query: string; category: string; sort: 'name' | 'recent' }) {
  const query = options.query.trim().toLocaleLowerCase()
  return profiles.filter(profile =>
    (options.section === 'All profiles' || options.section === 'Favorites' || profileLibrarySource(profile) === options.section)
    && (!options.category || profile.category === options.category)
    && (!query || [profile.name, profile.category, profile.description, profile.author].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))
  ).sort((a,b) => {
    if (options.sort === 'recent') {
      const time = (p: BrewProfile) => Date.parse(p.createdAt ?? '') || 0
      if (time(a) !== time(b)) return time(b) - time(a)
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  })
}
