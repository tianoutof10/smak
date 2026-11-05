# Four-language translation provenance and verification

Branch: `feature/add-four-locales`. Prepared for release in v0.1.32 after owner testing. Translation drafts remain marked for review; release approval does not imply native-speaker certification.

## Contextual pass — updated 20 September 2026

On 20 September, the owner requested removing questions 3–5 and translating the existing gateway modes, “Two-tap stop” and “Thirsty” labels without changing their meaning or tone. The subsequent calibration and limiter terminology decisions are now implemented.

Each language now contains **1,000 / 1,002 catalog entries**, covering all user-facing messages. Approved terminology is documented in [localisation-clarifications.md](localisation-clarifications.md); two date templates deliberately remain absent to select native Intl date-range formatting. Everything else has a draft translation, including errors, accessible labels and all plural forms.

The profile terminology guide informed distinctions between beverage yield and extraction percentage, ground-coffee dose, stage weight exits versus whole-shot stopping, target transitions and opposite-axis limiters. The owner resolved the stopping-calibration and limiter terminology. English and German now match the approved early-stop calibration and limiter-range wording, with a shared limiter helper. Machine execution logic, profile names, numeric settings, units and stored measurements remain unchanged.

`localisation-contextual-drafts.json` identifies messages authored or contextually revised in this pass. Where it overlaps `streamline-translation-provenance.json`, the former identifies the new wording and the latter remains the historical seed attribution—not a claim that the current string is a verbatim upstream translation. Imported terminology was kept where it fits; some seed wording was revised for consistency, including Chinese scale/espresso terms and Italian flow-rate wording.

All draft messages remain **needs review** in the existing review system. A passing test confirms placeholders and behaviour, not native-language quality. `localisation-pending.json` now contains only the two intentionally absent formatting templates.

Contextual-pass verification: all 562 tests pass; catalog/literal checks, production build and lint complete successfully (the five existing preview warnings and existing bundle-size warning remain). Mocked browser checks cover language switching, decimal formatting, unchanged user profile names, persistence, 390px settings layout and non-overlapping home metric labels at 1024×768. The screenshot pass identified long French/Italian grind labels; these now use compact “Mouture” / “Macinatura” and “Dose.” Each additional language remains a lazy-loaded chunk, approximately 17–18 KB gzip. No physical machine was controlled.

## Source and permission

Settings-heading follow-up: shortened French/Italian sidebar labels and matching page titles (for example Boissons / Bevande, Appareils / Dispositivi and Préférences / Preferenze), plus navigation group headings. Longer explanations and search keywords remain unchanged. No settings identifiers or behavior changed. All 565 tests pass; browser checks cover every settings section in both languages at 1024, 800 and 390px with no navigation or page-title clipping and no horizontal page overflow.

Status-pill follow-up: French and Italian use compact heating, sleep and connection labels, plus shorter power-button prompts; full explanatory tooltips and German labels are unchanged. Status pills now size to their content at every breakpoint. Narrow headers wrap and reserve their own grid space rather than clip labels or cover the dashboard. All 564 tests pass. Browser checks exercise all six languages, dark/light themes, nine status/timer combinations and widths 1194, 1024, 800, 640 and 390px; pill children remain inside the pill, widths track content and headers do not collide with the dashboard.

Approved-terminology verification: all 562 tests, catalog/literal checks, build and lint pass. Mocked browser checks cover the calibration title/helper and both limiter helpers in all six languages at 1024×768 and 800×600. The expanded profile panel reserves space for its close control and can scroll for longer translations; small-tablet metadata no longer collides with the form. Existing build/lint warnings remain. No physical-machine test or publication was performed.

Selected translations come from Decent Espresso's Streamline.js translation contributors:
[de1 gui translation - Sheet1.csv](https://github.com/decentespresso/streamline-js/blob/c47156be646168bd89587e69c9ec511867658a90/src/ui/de1%20gui%20translation%20-%20Sheet1.csv), pinned to commit `c47156be646168bd89587e69c9ec511867658a90`.

The project owner confirmed permission to reuse this content on 19 September 2026. Upstream carries a GPL-3.0-or-later notice. This import does not change Bestpresso's project licence or claim ownership of the source translations. Keep the separate reuse permission with project records.

`streamline-translation-provenance.json` records each chosen English source, CSV record number (including the header, not physical lines inside quoted cells), destination token, and languages that reuse it. No network request or CSV parsing happens at runtime.

## Original seed selection (before the contextual pass)

- French and Italian each start with 145 context-matched tokens.
- Traditional and Simplified Chinese each start with 130 context-matched tokens.
- Temperature, pressure, flow, device states and other unambiguous matching labels are reused as complete messages.
- Matching English alone is not enough. Source-code “Source”, a scheduled-switch “Timer”, generic “Insight”, line-weight “Medium”, and ambiguous transition terms are left unfilled. Chinese bean-dose wording, in-progress cleaning/descaling labels used as nouns, generic existence detection and “MAX TIME” translated merely as “time” are not imported.
- Duplicate source rows are explicitly selected, not first-match guesses. For example, the espresso beverage uses the beverage entry, not the similarly named coffee circuit; manual mode does not use the hand-brewing entry.
- Untranslated runtime keys are **absent**, not empty strings. This retains usable English fallback. `localisation-pending.json` contains genuinely blank translation fields for the follow-up writing pass, alongside the English source and any already imported sibling-language entries.
- Imported entries remain marked **needs review** until an explicit wording review baseline is acknowledged. A native-speaker review is still desirable; neither an exact match nor a passing test certifies translation quality.

## Locale behaviour

Catalogs are lazy-loaded like German. Regional preferences are retained: for example French Canada, Italian Switzerland, Traditional Chinese Hong Kong and Simplified Chinese Singapore. Explicit Chinese script tags take precedence over a conflicting region. Bare Chinese defaults to Simplified Chinese.

Number punctuation and grouping use Intl; measurements remain numeric in storage and API payloads. The input keypad uses the selected locale's decimal mark. Dates and date ranges use locale formatting even where prose remains English. Chinese month/year ordering and day-period placement are not assembled using English word order. Explicit 12/24-hour settings still win; “follow device” retains the device's clock convention. Older WebViews receive an uncompressed, localised date-range fallback and retain Chinese script selection without Intl.Locale.

The owner approved merging and publishing this work as v0.1.32 on 20 September 2026. The release includes all four languages, compact status/settings wording, content-sized status pills with 12px right padding, and the approved calibration/limiter copy. Machine execution behavior remains unchanged.

## Follow-up writing and verification

`localisation-pending.json` is an editing worklist, not a runtime catalog. Once a blank is agreed, place the complete message under the same key in the relevant `src/i18n/<language>/<feature>.ts` file. Keep placeholders intact and use full locale plural messages where needed. Run `npm run i18n:check`, update the coverage report, then acknowledge only explicitly reviewed tokens through the existing review command. Do not copy English strings into empty entries just to improve coverage numbers.

Initial checks: all 562 regression tests pass, catalog validation and the production build pass, and browser checks cover all four language selectors, lazy loading, live label changes, decimal display, unchanged profile names, preference persistence and phone settings layout. Tablet screenshots were inspected for French and Traditional Chinese. Existing preview lint and bundle-size warnings remain unchanged. No native-speaker certification or physical-machine test is claimed.
