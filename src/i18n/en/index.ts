import { brewEn } from './brew.ts'
import { builderEn } from './builder.ts'
import { commonEn } from './common.ts'
import { insightsEn } from './insights.ts'
import { libraryEn } from './library.ts'
import { settingsEn } from './settings.ts'
import { shellEn } from './shell.ts'

/** English source catalog: the released Bestpresso wording (renamed Smak), verbatim. Keys are grouped by feature area. */
export const areas = { common: commonEn, shell: shellEn, brew: brewEn, insights: insightsEn, library: libraryEn, builder: builderEn, settings: settingsEn } as const

export const en = { ...commonEn, ...shellEn, ...brewEn, ...insightsEn, ...libraryEn, ...builderEn, ...settingsEn } as const

export type EnglishCatalog = typeof en
