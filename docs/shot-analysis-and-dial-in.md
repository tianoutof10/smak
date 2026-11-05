# Shot analysis and taste-first dial-in

Status: third cut. Analysis and advice are display-only; the only machine
changes happen when the barista taps **Apply** (advice), **Apply to Living
Profile** (starting recipe) or **Add to library** (presets). Nothing changes
automatically. Thresholds are uncalibrated against real shots until the
calibration step below has been run on a physical machine.

This round follows the design brief captured in the project's Gemini
conversations: a morning screen that is the default view, swipe up for
diagnostics, live channel/stall markers, a taste prompt shown when the shot
ends, research presets by bean style, an adaptive "Living Profile", and bean,
gear and style context. The third cut replaces the three-question prompt with
one tap on the brewing control chart, lets the shot's pace choose between grind
and ratio, and gives each bag a memory: its dial-in path, a pinned recipe, rest
guidance and drift.

## Product point of view

Help someone decide **one** thing to change on the next shot, with the evidence
visible. Machines don't taste espresso, so the cup gets the final say:
telemetry can rule a lever in or out, but it never overrides what the person
tasted. This follows the same standard as `brewing-insights-v1.md`: transparent,
deterministic rules, sample evidence on every claim, and no score.

What this feature does **not** do: score shots, label a shot as "good", change
profiles without a tap, infer taste from telemetry, or claim a channel happened.
Telemetry findings are worded as observations ("resistance fell 48% in 0.8 s"),
with "possible" where cause is inferred.

## 1. Puck resistance (domain: `src/domain/shotAnalysis.ts`)

Resistance follows Decent's published convention, `R = pressure / flow²`
(bar per (ml/s)²). Decent's Insight blog tracks the *change* in resistance as
the signal for when puck integrity falls apart. Gemini's earlier prototype used
`flow / pressure`, which doesn't match DSx or Visualizer values.

Resistance is only computed where it means something:

- flow ≥ 0.5 ml/s and pressure ≥ 1 bar (filling, blooms and pump pauses are excluded);
- after the puck is first pressurised (pressure ≥ 2 bar), so headspace filling is ignored.
  The DE1's flow reading is pump-side, and early flow fills the headspace rather than
  passing through the puck.

Values are smoothed with a time-based median (±0.6 s), so the result does not
depend on Decaid's sample rate.

### Findings

| Finding | Rule (all in `ANALYSIS_THRESHOLDS`) | Wording |
| --- | --- | --- |
| Sudden resistance drop | Smoothed R falls ≥ 35% versus the median of the preceding 0.5–1.5 s, confirmed by the next sample, not within 1 s of a stage change, and no target pressure/flow change > 15% in that window. Merged within 2 s. Ignored in the last 2 s. | "Possible channel" with time, size of drop, and early/late phase. |
| Choked flow | Pressure ≥ 7 bar with flow ≤ 0.7 ml/s (and yield flow ≤ 0.6 g/s if a scale is connected) for ≥ 5 s after pressurisation. | "Flow stalled at high pressure". |
| First drops | First sample with yield ≥ 1 g. | Time only (descriptive). |
| Resistance shape | Peak smoothed R, its time, and how much it declined by the end. Steadiness is the R² of a linear fit after the peak (≥ 6 s, ≥ 5 samples). | "Declined steadily" or "unevenly" (descriptive, not used for advice). |

Why relative, not absolute: at espresso pressures flow is not proportional to
pressure (Waszkiewicz et al., *Physics of Fluids*, 2026, poroelastic
compaction), so absolute resistance falls on any declining-pressure profile.
Only an abrupt relative fall that the profile did not command counts.

Findings are computed live during the shot as well as afterwards; they appear
as chart markers and, in the morning view, as one quiet line. Gear adjusts the
thresholds: a bottom paper filter raises the drop threshold to 45% (the bed
flows faster without channelling), and a puck screen extends the settle time.

## 2. Taste-first dial-in (`src/features/insights/dialIn.ts`)

**Input** is one tap on the taste square (`TasteSquare`), shown automatically
when a shot of at least 8 s ends: **extraction** across (sour −1 … +1 bitter)
and **strength** up and down (weak −1 … +1 strong), plus a **Clean / Drying**
finish and a **With milk** switch. It is the brewing control chart as a gesture.
Extraction and strength stay separate because they need different fixes: sour
and strong wants more water, sour and thin wants more extraction without
dilution. The ring is the target (radius 0.3); with milk it moves up the square
by 0.3, because a milk drink wants a stronger shot. Arrow keys move the point in
tenths through two visually hidden range inputs.

**Pace** (`src/domain/shotPace.ts`) is the cup's weight gain from first drops to
the moment it stopped gaining: ≥ 2.4 g/s is fast, ≤ 1.0 g/s (or a stall) is
slow. Weight flow is used instead of shot time so long pre-infusions and blooms
don't read as slow. No scale, no pace: advice then falls back to taste alone.

**Output** is one primary step, at most one secondary ("if it's still off once
flow is even") and at most one alternative ("or instead"), each with the machine
change that Apply would make, plus a confidence: *tentative* when the tap sits
just outside the target (< 0.42) or when taste and pace pull different ways
("taste the next shot before changing anything else").

Priority order (first match wins):

1. **On target and clean** → keep everything. Two on-target shots in a row → *Dialed in. Stop here*, with **Pin this recipe**.
2. **Stalled flow** → coarsen first, in the grinder's own units; a non-grind taste step comes second. Grinding finer past this point can lower extraction (Cameron et al., 2020).
3. **Sudden resistance drop** → fix puck prep first; the taste step is secondary. If the bag is still degassing (see rest, below) the reason says so and a longer soak is offered on the Living Profile.
4. **Drying finish** → above 7 bar, lower the ceiling to 6 bar (Turbo) with puck prep second; at low pressure, puck prep then a shorter ratio.
5. **Sour**
   - ran **fast** → grind one step finer (water rushed past the coffee);
   - Traditional Body style → 1.5 °C warmer;
   - **sour and thin** → grind finer; if the shot already ran slowly, a longer soak or more heat instead;
   - ratio already ≥ 1:2.6 → longer soak (Living Profile) or warmer;
   - otherwise (**sour**, **sour but heavy**) → ratio +0.3 (1:2 → 1:2.3), with the 6 bar Turbo preset as the alternative at high pressure.
6. **Bitter**
   - ran **slow** or **bitter and heavy** → coarsen;
   - ratio already ≤ 1:1.8 → coarsen;
   - otherwise (**bitter**, **bitter and thin**) → ratio −0.2.
7. **Balanced but thin** → +1 g at the same ratio; if the basket is already at its rated dose, a shorter ratio instead; with hard water (> 80 ppm alkalinity), *check the water* is offered as the alternative.
8. **Balanced but heavy** → ratio +0.3.

Yield remains the first lever when the shot ran at a normal pace because
Schmieder et al. (*Foods*, 2023) found flow rate, grind and temperature effects
on the cup's compounds minor compared with the total mass extracted; pace is
what tells us the normal case doesn't apply.

**Refractometer (optional).** A TDS reading gives extraction yield
(TDS × yield ÷ dose) and a blue ring on the square: x = (EY − 20 %) ÷ 4,
y = (TDS − 10 %) ÷ 3. When tasted and measured points are more than 0.6 apart the
sheet says so and asks for a re-taste; the cup still drives the advice.

### One-tap Apply (`ApplyAction`)

- Ordinary profiles: target yield, dose, temperature, or the grind *reference*
  (the barista still turns the grinder) via the existing profile-setting write.
- Living Profile: the change is applied to its parameters and the profile is
  recompiled and saved over itself, then re-applied to the workflow.
- Pressure-ceiling advice on an ordinary profile has no Apply; it needs a profile edit.

### The bag's memory (`src/features/beans/dialJourney.ts`)

Each tasting is stored against the loaded bag (`dialLog`, up to 40 per bag): the
point, finish, milk, pace, TDS, and the recipe that made it (dose, yield, grind,
temperature, profile, bag age). Re-tasting a shot replaces its entry.

- **Path.** The square shows the bag's earlier shots joined in order, so you can
  watch them converge. Home and Coffee show the same path small.
- **Status.** *started* → *getting closer* (each shot nearer the target) or
  *change one thing at a time* → *dialed in on shot n* (two in a row on target).
- **Pin.** Pinning stores the recipe for the bag and remembers its grind for the
  bag × profile. Home shows it, with **Use it** when the active profile differs.
- **Next bag.** A new bag with the same name and roaster starts from the last
  pinned recipe of that coffee.
- **Drift.** Ten days after pinning (and once the bag is ≥ 10 days off roast),
  Home suggests one grind step finer: aged coffee extracts faster.
- **Milk** is remembered on the bag (most coffees are drunk one way).

### Learning from your own shots (`src/features/insights/learnedResponse.ts`)

The rules decide *which* lever; your history decides *how far*. From consecutive
tastings on the same profile where exactly one lever moved (grind, or yield by
≥ 1.5 g) and dose and temperature held, each pair gives a slope: how far one
grind unit or one gram moved the cup across the square. Pairs that move less
than 0.08, include a drying finish, or point the wrong way (finer making it
*more* sour) are dropped as noise. With at least two pairs, the median slope
sizes the step to aim at the centre: grind up to 3 steps, yield up to 8 g. This
bag's pairs come first; otherwise pairs from all bags are pooled. The sheet says
which ("Sized from 3 earlier changes on this coffee…"). Without enough history
the rule's single step stands.

**Grind check.** The sheet shows *Grind for this shot* with − / +, prefilled
from the bag × profile reference. Correcting it updates the tasting and the
reference, so the history used above records the grind actually used.

### Rest (`src/domain/rest.ts`)

Windows by roast level, in days off roast — light: opening from 7, best 14–35;
medium: 5, 8–28; dark: 3, 5–21 (unknown roast is treated as medium). Phases are
*still degassing*, *opening up*, *best window* and *past its best*, each with a
plain sentence ("Day 5. Still degassing: expect uneven flow, and don't chase the
taste today."). They are expectations, not rules.

### Palate calibration (Coffee → Palate)

Three shots of one coffee at 1:1.5, 1:3 and 1:2.2, tasted side by side, so sour
and bitter mean something concrete before the app relies on them. Each step only
sets the active profile's target yield; a last button restores the usual yield.

## 3. Today, the live view and diagnostics

**Home opens on Today**: the loaded bag (roaster, origin, name, process, variety,
roast level, altitude, tasting notes), its rest line, the dial-in path and last
cup; on the right, today's recipe (dose → yield, ratio, temperature, grind), the
active profile, the bag's pinned or carried-over recipe, any drift note, and the
machine's state. Espresso is started at the group head, so Today says *Start the
shot at the group head* rather than offering a button; in demo mode it offers a
demo pull. **Machine** (top-bar switch) is the full Smak dashboard; the
choice is remembered.


The live screen opens in the morning view: the coffee loaded and its roast age,
one ring for yield versus target (time when no target), the brew time, and the
stage. During a sealed soak or bloom the ring turns blue and "breathes"
(*Blooming · the puck is soaking*). Swipe up for the chart and stage strip, swipe
down to return; the header button does the same on tablets. The choice applies to
the current shot only; the starting view is a setting under Coffee → Gear & style.

## 4. Living Profile (`src/domain/chassis.ts`)

One universal three-stage profile instead of many:

1. **Fill** at constant flow until the bed pressurises (exit on pressure over 3.5 bar).
2. **Soak** with the pump off and the group sealed until pressure relaxes below 1.5 bar or the soak time runs out.
3. **Extraction** by flow under a pressure ceiling, with an optional gentle decline stage.

Its parameters (soak, flow, ceiling, decline, temperature, dose, target weight)
are stored in the profile's metadata (`smakChassis`), clamped to safe
ranges, and compiled into valid v2.1 steps (verified by Smak's own builder
validator in tests). The barista controls grind and puck prep; the app proposes
hydraulic changes, applied by one tap.

### Starting recipe (`startingRecipe` in `src/domain/beans.ts`)

Before the first shot of a bean, the chassis is pre-calculated and every
adjustment is listed with its reason: style (clarity: 1:2.3, 6.5 bar; body:
1:1.9, 8.5 bar), roast level (light: 93.5 °C, +0.2 ratio, longer soak; dark:
89 °C, ≤ 1:1.8), altitude ≥ 1,800 m (+0.5 °C), roast age (< 7 days: +10 s soak;
< 4 days: +15 s), natural/fermented process (earlier taper), burrs (conical or
bimodal: ceiling ≤ 8 bar and gentler decline; high-uniformity flats: +0.2 ml/s),
high-extraction basket (+0.5 ml/s), and water above 80 ppm (+0.1 ratio, −0.5 °C).

## 5. Research presets (`src/domain/researchPresets.ts`)

Grouped by bean style, each with its explanation and source, added to the
library only on **Add to library**:

| Preset | Bean style | Recipe |
| --- | --- | --- |
| Living Profile | Any bean | The adaptive chassis above |
| Turbo Shot (Cameron et al., 2020) | Light to medium | 15 g, fill to 3 bar, 6 bar ceiling, 40 g (1:2.7) in ~15 s |
| Blooming Espresso (Scott Rao) | Dense light roasts | 4 ml/s to 4 bar, 30 s sealed bloom, 2 ml/s percolation, 45 g |
| Flow-Prioritized (Schmieder et al., 2023) | Everyday | Fill to 4 bar, flat 1.8 ml/s under 9 bar, 36 g |

Not built: the three-slider profile editor from the brief (the compiler exists;
the screen was left out of this round by choice).

## 6. Beans and gear (`src/features/beans/`)

- **Beans** follow `bean-label-ocr.md`: add by scanning the bag label, importing
  a roaster URL, pasting a description, or typing. Every parsed field is a
  suggestion shown for review; unknown fields stay empty and the raw text stays
  visible. Duplicate bags (same name, roaster and roast date) prompt a choice.
  Finishing a bag archives it; grind references are kept per bean × profile.
- **Label scan** runs Tesseract locally. `scripts/copy-ocr-assets.mjs` copies the
  worker, LSTM cores and the compact English model into `public/ocr` before dev
  and build (≈ 15 MB, loaded only when scanning). No CDN, no upload.
- **Web import** tries Shopify product JSON (`.js`, `.json`), then the page's
  JSON-LD Product data, then Open Graph text. Many shops block cross-site reads
  from a tablet; the screen then asks for a pasted description.
- **Gear & style**: grinder name, its unit word and step size (advice speaks in
  those units), burr class, basket type and size, bottom paper filter, puck
  screen, water alkalinity, and Modern Clarity vs Traditional Body. Scale
  latency is already handled by Decaid's weight-flow look-ahead setting.

All of this is stored on the tablet per gateway (`smak-coffee-v1:<gateway>`).

## 7. Calibration before trusting advice

`scripts/analyze-shots.ts` reads the latest N shots from a Decaid gateway and
prints each shot's findings, plus a CSV, so thresholds can be compared with
shots the barista remembers:

```sh
node --experimental-strip-types scripts/analyze-shots.ts --gateway 192.168.1.50 --limit 100 --csv shots.csv
```

Acceptance before relying on the "possible channel" finding: on at least 50 of
your own shots, it should flag the shots you remember as gushing/spurting, and
stay quiet on most shots you remember as clean. Tune `ANALYSIS_THRESHOLDS` and
record the change here.

### Calibration record: Tian's history (Oct 25, 2026)

89 shots, Sep 23 – Oct 25, on *Damian's LRv3* (51) and *Adaptive v3* (38), from the
shot list (date, grind, dose, yield, time; no curves or taste notes).

| | LRv3 | Adaptive v3 |
| --- | --- | --- |
| Full-length shots with a yield | 17 of 51 | 35 of 38 |
| Shot time, median (IQR) | 31.9 s (30.0–33.8) | 32.1 s (29.6–35.1) |
| Coefficient of variation | 8 % | 11 % |
| Whole-shot weight flow | 1.11 g/s | 1.10 g/s |
| Shots with a bean recorded | 0 | 0 |

Dose was 18.0 g on every shot, yield 34–37 g (stop at weight, about 1:2), and
grind 17 except three LRv3 shots at 20 on Oct 24–25. Consecutive shots at the
same settings differed by a median of 3.2 s. The listed σ of 6.5 s was inflated
by a 7.7 s and a 9.3 s flush and a 63 s stall.

Changes made from it:

- **Pace is judged against the profile's own recent shots** (`paceAgainstBaseline`,
  `paceHistory`): fast ≥ 1.2 × the profile median weight flow, slow ≤ 0.82 ×,
  about ±2 SD at this noise level, once 8 shots are recorded. The absolute
  thresholds apply until then; a stall (≤ 1.0 g/s) is always slow.
- **Aborted pulls are ignored**: no tasting prompt and no baseline entry below
  15 s, or below 60 % of the target yield.
- **Today warns when the scale isn't connected** (32 LRv3 shots had no yield).
- **The tasting sheet asks "Which coffee is this?"** with the three most recent
  bags when none is loaded (no shot had a bean recorded).
- **"My dose stays the same"** (Gear) stops advice from changing the dose; a thin
  cup shortens the ratio instead.

Still needed: the shot curves (Decaid gateway or JSON export) to calibrate the
channel and stall findings, and tasted shots to check the advice itself.

## References

- Decent Espresso, "An Insight about different espresso recipes": puck resistance = pressure / flow².
- Cameron, M. I. et al. (2020). Systematically improving espresso: insights from mathematical modeling and experiment. *Matter* 2(3).
- Schmieder, B. K. L. et al. (2023). Influence of flow rate, particle size, and temperature on espresso extraction kinetics. *Foods* 12(15), 2871.
- Waszkiewicz, R. et al. (2026). Under pressure: poroelastic regulation of flow in espresso brewing. *Physics of Fluids*. doi:10.1063/5.0319611.
- Rao, S. Blooming espresso and flow-profiling articles (scottrao.com).

## Review

`/review/dial-in/index.html` (development server) shows the production live, finished, history and Coffee components with labelled sample data: a 5 Hz shot whose flow surges at 17 s, a blooming shot mid-soak, and a sample bean. Use it to check the morning view, soak state, live flag, chart marker, tasting prompt, Coffee tabs, light mode and phone width. It sends no machine commands. Automated tests and UI review do not replace real-machine validation.
