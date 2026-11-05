# Brewing insights — first-cut product specification

Status: integrated for v0.1.28 using Decaid's existing saved-shot API. API-contract and browser verification includes offline recovery; physical-device testing remains distinct from those checks.

Branch: `feat/brewing-insights-preview`

Integrated app: `/` → Past 7 days insight → Insights. The separate fictional-data design reference remains at `/review/brewing-insights/index.html` and is not included in the test ZIP.

Product destination: **Insights**. Homescreen entry: **Past 7 days insight** + **Latest shot**.

## 0. Approved test cut — latest 1,000 records, per device

The user approved starting with the existing local saved history rather than waiting for Decaid aggregation. This section supersedes backend-dependent requirements below for this bounded test build; those remain the longer-term contract.

- **Source of truth:** Decaid's saved-shot database, exposed through `GET /api/v1/shots?limit=100&offset=0&orderBy=timestamp&order=desc`, then offsets 100–900 as needed. The API limit is per page. No new plugin or backend endpoint is required. Insights never writes, deletes or imports shot records.
- **Offline data:** the latest 1,000 record summaries are persisted in IndexedDB on each browser/device, separately per gateway. Existing 100-record caches remain readable offline and expand on the next successful connection. A completed full sync replaces the snapshot and removes cached entries for deleted or aged-out records. Corrections to a shot invalidate its cached detail. Gateway changes do not mix histories.
- **Scope:** 1,000 raw records, not necessarily 1,000 espresso shots or a guaranteed year. Overview separates Espresso, Pour-over and Other / unknown. History additionally has All activities. Known cleaning, calibration and explicitly simulated/discarded/aborted records are excluded from drink totals. Manual stops are not automatically discarded. Older records may not identify simulations, which the UI explains.
- **Period integrity:** the options are 7, 30 and 180 completed calendar days. Each compares with the immediately preceding equal-length window, so the maximum analysis spans 360 days. Counts and drill-down use exactly the same cached records. Comparisons and profile-shift claims require coverage of both windows; an oldest day cut by the 1,000-record limit is conservatively incomplete. Partial and stale offline periods are labelled. Today appears in All cached history and Latest shot, not completed-days reports. Older 28-day bookmarks map to 30 days.
- **180-day availability:** hide this option entirely until a usable cached record reaches the start of the last 180 completed calendar days and the cache covers that window. This is elapsed calendar history, not 180 records or 180 active brewing days. A young, completely fetched archive does not qualify. Old links to an unavailable 180-day view fall back to 30 days after loading finishes; direct shot links remain usable. Seven/30-day choices remain available.
- **Measurements:** list summaries contain neither telemetry nor actual duration. `GET /api/v1/shots/{id}` loads the existing shot-detail chart on demand and saves it for offline reuse. Only the latest shot is also fetched automatically for the home thumbnail; no bulk download of curves. Until a detail is loaded, unknown duration displays `—`. Yield uses the saved annotation, then the existing saved-telemetry adapter only when that annotation is absent; never target yield, water volume or a made-up default.
- **Dose/profile provenance:** prefer the shot's saved dose annotation, then its historical target dose; the UI says this may be a target rather than a measured dose. After RC device feedback, profile usage groups the saved profile name within a drink type, ignoring case and whitespace differences. Temperature/target/recipe revisions do not split a profile; named variants such as `(x)` and `Gentle` stay separate. Decaid's saved workflow has no stable profile-library ID, so unrelated profiles with the exact same name/type cannot be distinguished and renamed profiles remain separate. Full snapshots still invalidate edited detail caches. Existing offline caches are regrouped without removing graphs. No lookup from today's profile settings.
- **Refresh:** on entering a history/home view, shortly after a completed shot, on reconnect/tab visibility and every 60 seconds while a relevant view is active. Within 15 minutes of a full sync, the first page updates recent edits and prepends provably new shots without re-downloading older summaries. A deletion, gap, large import, old/undersized cache, explicit Refresh, or elapsed 15-minute interval triggers full pagination. Thus older metadata edits may wait until that sweep; explicit Refresh checks them immediately. Multi-page sync checks totals, duplicate IDs and the first page again before committing; a moving history retries once. Failure preserves the prior snapshot rather than treating a half-download as complete. Background, live-shot, utility and sleeping views do not initiate the periodic Insights refresh. Concurrent reads are deduplicated. Offline-storage failure is disclosed, with in-memory data still usable.
- **First-cut presentation:** Home explicitly shows Espresso / seven completed days; Overview has its own beverage selector. Profile-share shift is the only change narrative implemented initially (10 records in each period, 5 uses of the leading profile, at least +15 percentage points). Other narrative templates below are deferred. Missing comparisons and values are not filled with preview data.
- **Latest-shot chip:** show `dose → yield • duration`, with seconds attached to the duration (`20 → 36.2 g • 30s`). Duration comes from the recorded graph, not the planned profile; until available it displays `—s`. A missing dose omits the arrow prefix.
- **Navigation:** home entry, weekday/hour/profile drill-down, search and filtered History are integrated into the main app. Detail reuses the existing full-width chart and stage cards. Close returns to History with the same filter/search and scroll; browser Back follows the route. The old `previous-pull` entry opens Insights History.
- **Boundaries:** this caches data, not the web app itself. Offline use still requires installed/available skin assets. Browser storage can be evicted or cleared. Reopening a graph offline requires that graph to have loaded once. No cloud sync, lifetime totals or cross-device history merging yet.

See `brewing-insights-test-build.md` for installation and device test steps.

## 1. Product point of view

Help someone understand their brewing routine and how it changes, with the evidence always one tap away. Start with a personal journal, then let enthusiasts go deeper. Do not score users, reward increasing consumption, or equate telemetry consistency with better taste.

The unit is a recorded brew, not a cup consumed. Multiple people may use one machine, one brew may serve two people, and some brews are discarded. The first version describes this machine's recorded brewing; it does not claim to describe personal caffeine intake.

Success means a user can answer three questions within a few seconds:

1. How often, and when, have I been brewing?
2. Which profiles am I returning to, and what has changed?
3. Which individual shots explain that observation?

## 2. First-cut scope

Ship a homescreen insight card, an Insights overview, a filterable History section, and a return path to the existing detailed shot analysis. Support 7, 30 and 180 completed local calendar days, each compared with the immediately preceding equal-length window. The home card uses 7 completed days independently of the overview selection.

Four headline measures:

| Measure | Definition | Display |
| --- | --- | --- |
| Brews | Count of eligible distinct shot IDs | Count and absolute difference from previous period |
| Brewing days | Local dates with at least one eligible brew | Count out of selected period length |
| Typical yield | Median final recorded beverage mass among usable records | Grams, absolute median difference, coverage |
| Most-used profile | Largest share of eligible brews | Profile name, count and share |

Three supporting views:

- **Your weekly rhythm:** counts grouped Monday–Sunday. Current and previous periods use the same scale. Tapping a weekday opens its shots in History.
- **By hour:** a 24-hour coxcomb with twelve local two-hour windows, arranged clockwise from midnight. Sector area represents count; a compact current/previous toggle switches periods without changing the scale. Selecting a window shows its count and a link to matching History. Retain four broad time bands for narrative summaries: overnight 00:00–05:59, morning 06:00–11:59, afternoon 12:00–17:59, evening 18:00–23:59.
- **Profiles you return to:** ranked profile counts/shares plus previous-period share. Tapping a row filters History. Preserve profile identity, not just the displayed title.

Use typical duration as a secondary summary in History; no need for another headline card. Yield means beverage output, not coffee beans consumed. Do not combine coffee, tea and unrelated beverage categories for a misleading typical-yield story: overview filters to a beverage type; default Espresso, with other recorded drink types selectable. The home insight card uses the same chosen beverage scope (Espresso in this preview), so its shot count and average refer to the same population. The latest-shot card remains an independent shortcut to the newest eligible drink brew.

### Deliberately not in v1

AI-written narratives, population comparisons, caffeine/health claims, coffee cost, predictive maintenance, water or energy totals, full-machine uptime, automatic dial-in/session labels, taste scores, taste recommendations, new editing of shot annotations, and bean/bag input. Existing detail telemetry stays available, but cross-shot curve averaging and repeatability grading are later work.

## 3. Touchpoints and navigation

### Homescreen

Replace only the current history-card footprint with two adjacent cards, retaining coverflow, profile settings and machine utilities. The wider left card takes about 60% of the row; the latest-shot card takes 40%, with a 12px gap. Do not steal height from profile selection.

- Left card: seven chronological daily bars above a bottom-aligned `Past 7 days insight` title, shot count and `Avg. yield`. Both rows fill the card's padded width: title left, metrics right. A full-size inner container owns this layout so native button sizing cannot shrink-wrap the contents. Whole card opens the seven-day Overview. No routine `Espresso · completed days` subtext; scope remains accessible to screen readers, and offline/incomplete/loading notices appear only when needed.
- Bars use the same solid Bestpresso green, 20px width and rounded shape as the Overview; height alone indicates count, with neutral weekday initials. A known zero day has a baseline tick, not a fabricated positive bar. Full dates/counts remain accessible. Home shows seven chronological days; the Overview groups by weekday and adds previous-period comparison bars.
- Home `Avg. yield` is the arithmetic mean of usable final yields, excluding missing values, not zero-filling them. Overview's `Typical yield` remains the median. Production must surface coverage and the selected beverage scope alongside the period; the prototype includes coverage in the accessible description.
- Right card: pressure/flow thumbnail above the shot-time profile name and timestamp, with a compact dose → yield chip. Show only known fields; never borrow dose from today's selected profile. Whole card opens the latest eligible shot, including today.
- Each card is a single generous keyboard/pointer target; charts inside are not separate tiny touch targets. Dark surfaces follow the reference; light mode uses matching light-theme surfaces.
- At narrow widths stack the pair rather than squeeze its labels. No timed rotation, flashing insight, or automatic carousel.

After a shot, immediate analysis remains accessible through the latest-shot card. The completed-days insight does not pretend to include today's activity. In production the latest-shot card updates independently from the aggregate period.

### Insights overview

Use Bestpresso's quiet charcoal/warm-grey surfaces, thin outlines, green accents, neutral metric text and generous spacing. Dark remains the initial theme; honour the user's saved theme. Light mode uses the existing light surfaces and darker accent text. No blur or background animations.

Persistent shell:

- Compact left rail with the same logo + circular close control as Settings, plus Overview and History. The close control returns Home. Both sidebars share the Insights selected-item surface, green label and thin outline. History is a child destination inside Insights, not a new unrelated top-level feature.
- Main header: `Your brewing`, selected dates, comparison dates and period selector.
- Beverage-type filter on the overview in production; hidden when only one drink type exists.
- The weekday and hourly charts sit directly on the page above the summary, without card backgrounds or outlines. They share one row on desktop and tablet widths, including below 1000px; stack in that order only at the phone breakpoint (650px and below). Visible headings are just `By day` and `By hour`; omit repeated subtitles, helper footers and heat-scale keys.
- Weekday bars use a 200px plot on desktop/tablet and 160px on phones. The number above each pair is the selected period's total for that weekday (all Mondays in a 30-day view, for example), not an average or a sum of both periods; align it over the current-period bar. Light charts share a cooler green current fill, neutral grey comparison fill and light neutral clock face. Keep UI text/accent colors separate from the chart palette.
- In light mode, secondary previous-period bars and their legend use a softer grey-green than the coxcomb's selected Previous dataset. The latter is primary information in that view and retains 3:1 contrast against its clock face and hover state; keep both within the same neutral hue family.
- Four metrics follow the charts in one divided surface, not four oversized cards.
- Weekday bars remain the main chart; a 24-hour coxcomb sits to the right. Twelve equal-angle sectors cover midnight through 24:00, with only 00/06/12/18 clock labels. Account for the empty center when calculating area: squared outer radius minus squared inner radius is proportional to count. Current and preceding periods share one maximum; zero counts have no colored sector. Use solid theme fills without outlines. The center starts as `24h`; selecting a sector replaces it with the count and reveals a compact time-window link below. Preserve selection when switching comparison periods, and reset it when changing the 7/30/180-day range. Keep broad time bands available for narrative summaries.
- Bar charts share rounded ends and solid Bestpresso-green fills, with a muted solid fill for the previous period and matching legend markers. No outlines or gradient strokes on bars. Keep the existing shot-detail telemetry styling separate.
- Home's profile panel, insight entry and latest-shot entry share one neutral surface in each theme; the selected profile's animated art remains separate. The entry bar chart has a 24px top inset, including short-screen layouts.
- Profile ranking and one restrained observation card below.
- Recent brews preview and a `View all history` entry point below the overview.

### History

- Keep the selected insight period and beverage filter on entry from Overview.
- Display an active context chip, e.g. `Morning · 06:00–12:00`, `Mondays`, or `Adaptive V2`. Include Clear filter.
- Row fields: time/date, profile, dose, yield, duration. Unknown values display an em dash. Do not download curves for list rows.
- Search by profile name; newest first. Filters and insights use all 1,000 cached records. Render the first 100 matching history rows and reveal another 100 with `Show more brews`; opening and closing detail preserves the expanded list. New filters/periods start with 100 rows again.
- Allow a period choice `All cached history` in History, in addition to the shared 7/30/180-day windows. It includes today's shots; no previous-period comparison is attached to it.
- Show the current period count and the filtered count; never label a loaded first page as the complete total.
- A separate accessible row action opens full-width shot analysis. Close returns to this history list, retaining the same query, loaded pages and scroll position. Browser Back follows the same navigation stack in production.
- Overview may preserve its own scroll independently from History. Returning Home does not change selected brew profile or machine workflow.

### Shot detail

Reuse the current pressure/flow/temperature/yield chart, legend filtering, hold inspection and stage cards. Do not implement another graph engine. The detail has no sidebar or embedded shot list: title, chart and stages use the full available width. Its Close button always returns to Insights → History, including when detail was opened from the homescreen's latest-shot card or Overview's recent rows. Keep a current History filter when present; otherwise open the list for the originating period. Choose another shot from that list, not from a duplicate rail inside detail.

## 4. Observations: transparent rules, not invented intelligence

Use deterministic templates. Every observation includes its scope, sample sizes, comparison dates and a route to evidence. Rank by the priority below; show one on Home and at most two on Overview. No observation must appear simply to fill a card.

| Priority | Eligibility | Example / interpretation |
| --- | --- | --- |
| Profile share shift | At least 10 brews in each window, profile used at least 5 times currently, increase of at least 15 percentage points | `Adaptive V2 appears in 55% of your brews, up from 30%.` Show both period evidence sets. This is usage, not enjoyment. |
| Time-band shift | At least 10 timestamped brews in each window, band used at least 5 times currently, share change of at least 15 points | `More of your brewing happens in the afternoon.` Show the counts and dates. |
| Routine summary | At least 5 brews, largest band contains at least 60% | `Most of your brewing happens in the morning.` No change claim. |
| Neutral fallback | Any eligible records | `You brewed on 5 of the last 7 days.` With no records: `Your brewing story starts with your first brew.` |

Profile/time change stories require complete coverage of both periods, not merely 10 records from a partial import. Tie-break by largest absolute share change, then count, then stable ID. Recompute after new history/corrections, but freeze the selected story during a mounted view so it does not move under a user's finger.

Show median-yield and count differences as factual metric annotations, not an automatic quality story. A profile mix change can explain yield changes; do not imply a change in technique. Do not infer preference, improvement, channeling or machine faults from these aggregates.

## 5. Data contract and Decaid collaboration

### Current foundation

Bestpresso reads shot IDs, timestamps, workflow/profile snapshots, stop reasons, annotations and time-series measurements. Its UI adapter currently retains only a subset; the default history request is a 30-item page. Do not derive a monthly report from that page.

Decaid's local models already support grinder and bean-batch context, barista/drinker labels, dose/yield annotations, enjoyment and notes. Their presence in a model is not evidence that existing records populate them. In particular, dose annotations can be derived from a target dose: a field named `actualDoseWeight` is not sufficient proof of weighing.

### Future aggregation capability (not required for the 1,000-record test cut)

Request an aggregate for an explicit inclusive local start date, exclusive end date, IANA timezone, beverage type and eligibility policy. Return:

- The interpreted date bounds, source-data revision and generated-at timestamp.
- Current and previous period totals, active days, median yield/duration and usable sample counts for each metric.
- Seven weekday buckets, twelve two-hour buckets, four narrative time-band buckets, and profile identity/count/share buckets for both periods.
- Earliest available record, completeness/coverage status and excluded/unknown counts.
- Filter descriptors that the paginated history query can apply to return exactly the contributing records, for either period. Do not return thousands of IDs in every overview response.

History queries must support the same dates, timezone, beverage, eligibility, weekday/local-hour window and stable profile identity predicates. Hour windows are start-inclusive and end-exclusive, with 24:00 ending the local day. Detail remains lazy-loaded by shot ID. Existing endpoints remain unchanged; add capabilities rather than changing their response meanings.

Bestpresso owns explanation templates, insight ranking and UI. Decaid owns canonical eligibility, deduplication, aggregation and matching queries so totals and drill-down do not disagree between skins. Do not silently compute an approximate result from a partial client cache if the capability is missing.

### Eligibility and provenance

- Default counts include recorded drink brews; exclude known cleaning, calibration and simulation records. Keep those accessible through an explicit History activity filter later, not consumption totals.
- A manual stop can be a perfectly valid brew. Do not classify manual stops as failed shots solely by stop reason or short duration. Honour explicit aborted/discarded classification if available; otherwise show the limitation.
- Unknown category/provenance is reported separately, not guessed from a profile title. Production release is gated on reliable eligibility or an explicit conservative unknown bucket.
- Deduplicate by stable shot ID. Imports with missing/conflicting identity require backend resolution rather than heuristic merging of similar timestamps.
- Prefer canonical final yield/confirmed user correction over later scale readings. Missing yield is not zero and does not remove that brew from frequency counts. Never substitute water volume for beverage mass.
- Profile usage rolls up by stable profile/lineage identity; detail retains the shot-time title and recipe revision. A new revision of the same profile does not create a fake new favourite; separately created copies remain separate unless explicitly linked.
- If old shots lack stable identity, group by exact immutable snapshot signature and label legacy groups; do not use fuzzy title matching.
- Historical dose, grind, bean and profile context must be captured at shot time, not looked up from today's settings.

### Dates, comparisons and coverage

Use a persisted reporting timezone, initially the device IANA timezone. Aggregate in calendar dates, not `N × 24 hours`; daylight saving must not shift buckets. A reporting timezone change re-buckets both comparison periods with that timezone.

`Last 7 days`, `Last 30 days` and `Last 180 days` mean that many complete local calendar days before today. The preceding comparison window has the same length. Only the 7-day window guarantees the same weekday composition: 30/180-day weekday charts show raw totals, not normalized per-weekday rates. Show zero count on a known empty day, but gaps on dates for which source history is unavailable. Comparison requires both windows to be complete; otherwise show `More history needed for comparison`.

Median calculations use usable finite non-negative values, with yield values rounded only for display. Typical yield needs at least 5 usable records; otherwise show `Not enough yield readings`. Percentage share uses all eligible brews in that exact filtered scope; unknown profiles count in the denominator and are visible as Unknown profile. Use absolute deltas if the previous value is zero—never infinite percentages.

## 6. Loading, privacy and performance

- First load: fixed-height placeholders; keep Last shot and History available independently when possible.
- Offline: display cached summaries with `Updated …` and `Offline`; never silently present them as fresh.
- Partial data: show coverage beside the affected metric; suppress unsupported observations.
- Backend unavailable: `Insights isn't available with this Decaid version yet`, with a working History entry. No invented totals.
- Empty state: explain what will appear after real brewing; no demo data in production.
- Fetch summaries on entry and invalidate after a completed shot, edit, delete or import; do not request on each live telemetry packet. A completed-days report will usually not change after today's brew, but its latest-shot shortcut will.
- Avoid re-requesting fresh summaries for the same scope/revision. Only fetch full telemetry when detail opens. Scrolling and coverflow should stay independent of aggregation work.
- Local aggregation by default. No cloud export or community comparison. Future per-person views require explicit attribution, never inference from time of day. Shared users should know this is machine-level history.

## 7. Future beans/bags extension

Keep coffee identity, purchased bag/batch and shot association separate. Plan for a shot-time beanBatchId, origin/process/roaster metadata, roast/open dates, grinder ID/setting and optional enjoyment rating.

Then add origin/process mix, repeated purchases, bag × profile usage, roast-age trends, grind evolution within the same grinder and bag, and rated enjoyment by combination. Use association language, not causal taste claims. Blend origins may be multi-valued; avoid double-counting a blend as two entire brews in percentage totals.

Bag depletion and cost estimates need bag weight/price, dose provenance and allowance for unrecorded use, purging and spills. Mark estimates explicitly. Most-used is not most-enjoyed. Unknown beans remain an honest Unknown group. Do not add locked or empty bean panels to the v1 overview.

## 8. Implementation sequence and acceptance

1. Agree canonical aggregate and history predicates with Decaid; obtain fixtures with missing values, eligibility and provenance cases.
2. Extend the read-only client adapter with the aggregate capability and source revision; preserve current shot-detail routes.
3. Implement Overview and History together so every chart and observation has evidence. Add the homescreen replacement only after this flow works.
4. Verify themes, tablet breakpoints, data coverage and navigation; ship behind a development flag until the backend contract passes integration checks.

Acceptance tests:

- Headline totals equal all matching history pages, not just page one; deletions/imports update both.
- Completed-day bounds, midnight, week boundaries, timezone changes and DST give consistent bucket counts.
- Excluded/unknown activities, missing scale readings, manual stops, duplicate imports and changed profile names do not create misleading insights.
- Low sample size and incomplete comparison windows suppress change stories. Zero previous totals never yield Infinity/NaN.
- Tapping weekday, a selected coxcomb window's history link, profile or observation opens the correct scope; selecting Previous in the coxcomb opens the earlier period. Clearing only the contextual filter retains the period and beverage choice.
- Last shot includes today's newest eligible brew; selected period comparison remains completed-days only.
- Open shot → hold chart → select stage → Back restores query and scroll. Existing chart behaviour is unchanged.
- At 1194×834 and 1024×768: headline metrics, labels and touch targets do not overlap. Below 1000px the lower panels stack and the summary becomes 2×2, but the two overview charts remain side by side until 650px. No forced canvas-scale text. Check light and dark; keyboard focus and touch targets at least 44px for primary controls. Light-mode coxcomb data fills must have at least 3:1 contrast against the clock face, including hover; use dark neutral clock labels and keep current/previous colors consistent with the weekday chart.
- Summary loading does not block Home, the existing history path or live shot updates. Production bundle excludes prototype/sample records.

## 9. What this branch demonstrates

The separate review entry uses a deterministic 56-day fictional espresso dataset. Counts, medians, comparisons, bar heights, profile shares and filtered lists are computed from the same data. It offers 7/28-day views, Home, Overview, filtered History, search, clear filter, dark/light preview and shot detail using the existing chart/stage components. Full-history pagination, backend/caching/error states, beverage filtering and browser URL restoration remain specified production work, not completed integration.

The preview's curves are explicitly illustrative, rescaled from the existing demo telemetry. The entry-card dose is explicitly fictional shot metadata, not a homescreen default. They do not validate physical profile execution. The preview makes no API calls, machine commands or account writes. Existing main application entrypoints and homescreen source are untouched. On this branch the real Settings screen now uses the shared sidebar components. The shared shot-detail screen has an opt-in standalone layout used by Insights; the existing production history route retains its browser layout until Insights integration. The prototype starts on Home and uses page-local theme selection, not a settings save.
