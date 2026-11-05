# Spanish localisation

Prepared on 20 September 2026 on `feature/spanish-locale`, based on released main at `5e070b74c785c2d7daf6b7e4b7a659a7eec39804`. The owner approved merging and silently replacing the v0.1.32 release ZIP with Spanish included in its existing notes. No version bump or separate announcement.

## Coverage and source

Spanish adds 1,000 of 1,002 catalog entries across all seven feature areas. All user-facing messages have translations. As with French, Italian and Chinese, `insights.period.dayMonth` and `insights.period.dayOnly` are intentionally absent so date ranges use native Intl formatting.

- 116 entries reuse context-matched Spanish terminology from the [Streamline translation CSV](https://github.com/decentespresso/streamline-js/blob/c47156be646168bd89587e69c9ec511867658a90/src/ui/de1%20gui%20translation%20-%20Sheet1.csv).
- 884 entries are authored contextual translations, including compact status labels, settings headings, errors, accessibility labels and plural variants.
- Upstream main was checked and still pointed to `c47156be646168bd89587e69c9ec511867658a90`. The source CSV's Git blob hash matched the cached file exactly: `0fa4e4b6721a6a247a3a1991604c79437c4050ac`.
- The owner confirmed reuse permission on 19 September and requested Spanish reuse on 20 September. Attribution remains with Decent Espresso and its translation contributors. Upstream's GPL-3.0-or-later notice is not a change to Bestpresso's licence; retain the separate permission with project records.

`localisation-spanish-provenance.json` records the current English and Spanish text for every entry. Reused entries also record the source CSV row (header included; quoted newlines do not increment the record number), original English/Spanish and any sentence-case adjustment. No CSV parsing or external translation service runs in the app.

The previous contextual mapping was reused only where the Spanish wording also fits. For example, upstream “Limpiando” and “Descalcificando” describe activities in progress, not our Cleaning/Descaling headings; these use authored “Limpieza” and “Descalcificación.” “Remover” is not reused for deleting a schedule. Long grind-size and fullscreen labels are shortened contextually.

## Terminology and layout

| Concept | Spanish |
| --- | --- |
| Ground-coffee dose | Dosis |
| Beverage yield by weight | Peso en taza |
| Flow / flow rate | Flujo |
| Grind size | Molienda |
| Scale | Báscula |
| Stage | Etapa |
| Early-stop calibration | Calibración de parada anticipada |
| Flow / pressure limiter range | Rango del limitador de flujo / presión |

“Peso en taza” is beverage mass, not extraction percentage. Stage thresholds remain distinct from whole-shot targets. Threshold reasons preserve their operators, values and units; ambiguous alternatives use “o.” The shared “Se alcanzó:” wording avoids gender-agreement errors when pressure, volume or several alternatives are inserted.

The calibration helper still states that a higher value stops earlier. The hot-water default is expressed as 300 ms (equivalent to 0.3 s) to avoid embedding a region-specific decimal separator in fixed prose. Zero still means the Decaid default, not disabled prediction.

Status labels are compact (“No calienta,” “Sin conexión,” “En reposo”), with the full power-button explanation retained separately. Steam's off label is “Apag.” to fit the gauge. Settings navigation and matching page headings use short labels such as “Bebidas,” “Dispositivos” and “Preferencias.” Existing content-hugging status layout and 12px right padding are unchanged.

## Regional behaviour and data boundaries

- One lazy-loaded `es` catalog, displayed as “Español.”
- `es-ES` is the default; matching device regions such as `es-MX`, `es-AR`, `es-CO`, `es-US` and `es-419` are retained.
- Numbers, grouping, decimal input, date ranges and plural categories use Intl. Spain's decimal comma and Mexico's decimal point both work.
- Date ranges handle cross-year periods and retain the older-WebView fallback when `formatRange` is unavailable.
- Explicit 12/24-hour preferences still take precedence; “follow device” respects the device's clock convention independently of interface language.
- User profile/stage names, IDs, API payloads and numeric storage are not translated. No brewing or machine-control behavior changes.

## Verification

- All 570 unit/regression tests pass.
- Catalog and literal audits pass; no unapproved interface literals. All 1,000 Spanish entries remain marked “needs review”: no native-speaker certification or reviewed baseline is claimed.
- Production build passes; Spanish is a separate lazy chunk, approximately 17.7 KB gzip.
- Lint passes with the same five pre-existing review-preview warnings; the existing main bundle-size warning remains.
- Production browser checks pass for Spanish selection and saving through Settings, lazy loading, Spain/Mexico decimal display, unchanged profile names, reload persistence and 390px settings layout.
- All ten settings sections pass heading/navigation bounds checks at 1024×768, 800×600 and 390×844.
- Status checks cover nine state/timer combinations, both themes and widths 1194, 1024, 800, 640, 390 and 320px. Text/helper content fits; right padding remains 12px; headers do not overlap the dashboard.
- The 1024×768 home screenshot was visually inspected. All browser machine/API/WebSocket traffic was mocked; no physical machine was controlled.

Native-speaker feedback remains welcome, particularly for regional espresso terminology. No unresolved meaning questions from the approved English copy blocked this pass.
