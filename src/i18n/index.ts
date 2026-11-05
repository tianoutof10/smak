import { useSyncExternalStore } from 'react'
import { en, type EnglishCatalog } from './en/index.ts'
import type { PluralMessage, Translation } from './types.ts'
import { languageRegistry, matchLanguage, type Language, type LanguagePreference } from './registry.ts'
export { isLanguage, LANGUAGES, languageName, languageRegistry, type Language, type LanguagePreference } from './registry.ts'

const catalogs: Partial<Record<Language, Translation<EnglishCatalog>>> = { en }
const loading = new Map<Language, Promise<void>>()
let revision = 0
const listeners = new Set<() => void>()
const notify = () => {
  revision++
  listeners.forEach(listener => listener())
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(languageEvent, { detail: active }))
}

/** Failure leaves English available and permits a later retry; concurrent requests share one load. */
export function loadLanguage(language: Language): Promise<void> {
  if (catalogs[language]) return Promise.resolve()
  const pending = loading.get(language)
  if (pending) return pending
  const promise = languageRegistry[language].load().then(catalog => {
    catalogs[language] = catalog
    if (active === language) notify()
  }).catch(() => { /* Offline/unavailable translation: keep English fallback. */ }).finally(() => loading.delete(language))
  loading.set(language, promise)
  return promise
}
const languageEvent = 'smak:language-changed'

type Catalog = EnglishCatalog
export type MessageKey = { [Key in keyof Catalog]: Catalog[Key] extends string ? Key : never }[keyof Catalog]
export type PluralKey = { [Key in keyof Catalog]: Catalog[Key] extends PluralMessage ? Key : never }[keyof Catalog]

type PlaceholderNames<Text> = Text extends `${string}{${infer Name}}${infer Rest}` ? Name | PlaceholderNames<Rest> : never
type Params<Text> = [PlaceholderNames<Text>] extends [never] ? [] : [params: Record<PlaceholderNames<Text>, string | number>]
type PluralParams<Entry> = Entry extends PluralMessage ? Exclude<PlaceholderNames<Entry[keyof Entry]>, 'count'> : never

let active: Language = 'en'
let activeLocale = languageRegistry.en.locale

const browserLanguages = (): readonly string[] => {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : []
}

/** `auto` follows the first device language Smak supports; anything else falls back to English. */
export function resolveLanguage(preference: LanguagePreference = 'auto', languages: readonly string[] = browserLanguages()): Language {
  if (preference !== 'auto') return preference
  for (const tag of languages) {
    const language = matchLanguage(tag, languageRegistry)
    if (language) return language
  }
  return 'en'
}

/** Keeps the device region when it matches the language (de-CH, en-GB), so numbers and dates follow it. */
export function localeFor(language: Language, languages: readonly string[] = browserLanguages()) {
  return languages.find(tag => matchLanguage(tag, languageRegistry) === language && tag.includes('-')) ?? languageRegistry[language].locale
}

export function setActiveLanguage(language: Language, languages: readonly string[] = browserLanguages()) {
  const locale = localeFor(language, languages)
  const changed = language !== active || locale !== activeLocale
  active = language
  activeLocale = locale
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language
    document.documentElement.dir = languageRegistry[language].direction
  }
  if (changed) notify()
  return loadLanguage(language)
}

export const activeLanguage = () => active
export const activeLocaleTag = () => activeLocale
/** Distinguishes an explicit locale pattern from English fallback prose. */
export const hasLocalizedMessage = (key: MessageKey) => typeof catalogs[active]?.[key] === 'string'

const pseudoEnabled = () => {
  try {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('i18n-pseudo')
  } catch {
    return false
  }
}

const pseudoMap: Record<string, string> = { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' }

/** Test-only pseudo locale: accented, ~35% longer and bracketed, so untranslated or clipped text stands out. */
export function pseudoLocalize(text: string) {
  const accented = text.replace(/\{[^}]+\}|[aeiouAEIOU]/g, match => pseudoMap[match] ?? match)
  const padding = '·'.repeat(Math.ceil(text.length * 0.35))
  return `⟦${accented}${padding}⟧`
}

const interpolate = (template: string, params?: Record<string, string | number>) => params
  ? template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? (typeof params[name] === 'number' ? formatNumber(params[name], { useGrouping: false, maximumFractionDigits: 20 }) : String(params[name])) : match)
  : template

const finish = (text: string) => pseudoEnabled() ? pseudoLocalize(text) : text

/** Translate a message into the active language. Placeholders are typed from the English source text. */
export function t<Key extends MessageKey>(key: Key, ...[params]: Params<Catalog[Key]>): string {
  const message = catalogs[active]?.[key] || en[key]
  return finish(interpolate(message as string, params as Record<string, string | number> | undefined))
}

export function pluralTemplate(entry: PluralMessage, count: number, locale: string): string {
  try {
    return entry[new Intl.PluralRules(locale).select(count)] || entry.other
  } catch {
    return (count === 1 ? entry.one : undefined) || entry.other
  }
}

/** Missing entries use English grammar as well as English text. */
export function plural<Key extends PluralKey>(key: Key, count: number, ...[params]: [PluralParams<Catalog[Key]>] extends [never] ? [] : [params: Record<PluralParams<Catalog[Key]>, string | number>]): string {
  const translated = catalogs[active]?.[key]
  const entry = (translated ?? en[key]) as PluralMessage
  const template = pluralTemplate(entry, count, translated ? activeLocale : 'en')
  return finish(interpolate(template, { ...(params as Record<string, string | number> | undefined), count: formatNumber(count) }))
}

/** Decimal separator of the active locale: "," for de-DE, "." for en and de-CH. */
export function decimalSeparator() {
  try {
    return new Intl.NumberFormat(activeLocale).formatToParts(1.5).find(part => part.type === 'decimal')?.value ?? '.'
  } catch {
    return '.'
  }
}

/**
 * Drop-in for `value.toFixed(digits)` in displayed text: same rounding and no grouping, with the
 * locale's decimal separator. Keep plain `toFixed` for values sent to Decaid or used as keys.
 */
export function formatDecimal(value: number, digits = 0) {
  // Preserve existing toFixed rounding, then let Intl handle digits and punctuation.
  return formatNumber(Number(value.toFixed(digits)), { useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/**
 * Display-only: model values such as grind `14.5` or flow `0.6` are kept as dot-decimal strings because they
 * are parsed again; show them with the locale's separator without touching the stored value.
 */
export function localizeDecimalText(text: string): string {
  // Only canonical numeric model strings (or a numeric ratio), never arbitrary prose/IDs.
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return formatDecimal(Number(text), text.split('.')[1]?.length ?? 0)
  if (/^\d+:\d+(?:\.\d+)?$/.test(text)) return text.split(':').map(localizeDecimalText).join(':')
  return text
}

/** Localised number with grouping (`1,234` / `1.234`), replacing `toLocaleString()` in displayed text. */
const numberFormatters = new Map<string, Intl.NumberFormat>()
export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  try {
    const key = activeLocale + JSON.stringify(options ?? {})
    let formatter = numberFormatters.get(key)
    if (!formatter) {
      formatter = new Intl.NumberFormat(activeLocale, options)
      if (numberFormatters.size >= 100) numberFormatters.clear()
      numberFormatters.set(key, formatter)
    }
    return formatter.format(value)
  } catch {
    return String(value)
  }
}

/** Parses user-typed numbers that may use the locale's decimal comma. */
export function parseLocalizedNumber(text: string, locale = activeLocale) {
  // Editable measurements never use grouping. Reject ambiguous pasted grouped numbers.
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false })
  const decimal = formatter.formatToParts(1.5).find(part => part.type === 'decimal')?.value ?? '.'
  let normalized = text.trim().replace(/[\u061c\u200e\u200f]/g, '')
  for (let digit = 0; digit <= 9; digit++) normalized = normalized.split(formatter.format(digit)).join(String(digit))
  const minus = formatter.formatToParts(-1).find(part => part.type === 'minusSign')?.value ?? '-'
  normalized = normalized.split(minus).join('-').split(decimal).join('.')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return Number.NaN
  // A foreign dot in a comma-decimal locale could be a thousands separator.
  if (decimal !== '.' && text.includes('.')) return Number.NaN
  const value = Number(normalized)
  return Number.isFinite(value) ? value : Number.NaN
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/** Localised date/time formatter for the active language (month and weekday names follow it). */
export function dateFormatter(options: Intl.DateTimeFormatOptions) {
  // Leave implicit device timezones uncached so Android timezone changes remain visible.
  if (!options.timeZone) return new Intl.DateTimeFormat(activeLocale, options)
  const key = JSON.stringify([activeLocale, options])
  const cached = dateFormatters.get(key)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(activeLocale, options)
  // Bound retained native Intl objects even if future callers introduce arbitrary options.
  if (dateFormatters.size >= 32) dateFormatters.clear()
  dateFormatters.set(key, formatter)
  return formatter
}

/** Re-renders a component when the language changes; components that are not memoised follow the app shell. */
export function useLanguage() {
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => revision, () => revision)
  return active
}

export const hasMessage = (key: string): key is MessageKey => Object.prototype.hasOwnProperty.call(en, key) && typeof en[key as keyof typeof en] === 'string'
