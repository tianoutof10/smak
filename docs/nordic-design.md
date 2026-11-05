# Nordic appearance

The default look. Clean Scandinavian: flat charcoal, paper-white text, one
typeface, hairlines instead of shadows or glows. Colour appears only where it
carries meaning. Decent's green-pressure / blue-flow chart convention is kept,
desaturated, with thin lines.

Dark and Light (Beta) remain in Settings → App experience. Light is never
switched on automatically.

## System

| Token | Value | Use |
| --- | --- | --- |
| `--n-bg` / `--n-surface` / `--n-surface-2` | `#131313` / `#1b1b1b` / `#222222` | Flat charcoal; no gradients or tints |
| `--n-line` / `--n-line-2` | white at 7% / 13% | Every border and divider |
| `--n-ink` / `-2` / `-3` | `#f2f1ee` / `#a8a7a3` / `#6f6e6b` | Text hierarchy |
| `--n-paper` on `--n-on-paper` | `#f2f1ee` on `#141414` | The next action (Apply, Pin, Add a bag), the selected option, the yield ring |
| `--n-sage` | `#9eb9a4` | Ready; pressure |
| `--n-water` | `#8fb2d4` | Flow, soak, too-fresh coffee, refractometer reading |
| `--n-clay` | `#e08c70` | Stop, heating, a possible channel |

**Type:** Inter only (variable, 100–900, bundled through `@fontsource-variable`
so the tablet works offline). Titles weight 500 with tight tracking (−0.02 to
−0.04 em); large readings weight 200–300 with tabular figures so they don't
jitter while they change; labels in sentence case, 13–14 px, ink-3. No serif, no
all-caps labels.

**Shape:** 16 px cards, pill buttons and segmented controls, 1 px hairlines.
Screens like Today and the after-shot sheet use no cards at all: columns divided
by a hairline, with type doing the work.

## Files

- `src/styles/nordic.css`: the theme layer, loaded last.
- `src/styles/nordicAccents.css`: **generated** by `node scripts/nordic-accents.mjs`.
  It remaps every Smak green accent declaration to the neutral palette.
  Re-run it after upstream style changes; a test fails if it is stale.
- New screens (`TodayHome`, `TasteSquare`, the dial-in sheet, the rest line)
  carry their own CSS with Nordic values as defaults and Light overrides.
