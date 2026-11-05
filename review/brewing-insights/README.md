# Brewing insights design preview

Product spec: [brewing-insights-v1.md](../../docs/brewing-insights-v1.md).

Run the normal Vite development server and open `/review/brewing-insights/index.html`.
This is a separate entry, not a production route. The normal build does not bundle this prototype.

## Demonstrated

- Existing coverflow and utilities, with paired seven-day insight and latest-shot entry cards matching the supplied reference.
- Computed 7/28-day summaries from 56 days of fictional espresso records, anchored to 12 September 2026.
- Weekday, two-hour window and profile drill-down; comparison evidence sets; profile search and clear filter.
- Existing shot-detail graph and stage components; returning retains the contextual filter.
- Page-local dark/light toggle. No machine connection, commands or settings writes.
- Shared rounded, solid-fill bars across the home entry, weekday comparison and profile usage. Previous-period bars and their legend use a muted fill, not an outline; telemetry curves are unchanged.
- A 24-hour coxcomb shows twelve two-hour windows. Current/previous views share one area scale and a compact period toggle; counts and history links appear on selection.

The detail curves are illustrative demo telemetry, not real measurements for the fictional shots.
Backend aggregation, beverage filters, pagination, caching, full browser navigation and production integration remain specified work.

## Verification — 12 September 2026

- All 300 repository tests passed, including prototype aggregate/filter/average and shared navigation guards.
- Production build passed; existing bundle-size warning remains.
- Separate prototype TypeScript check and targeted lint passed.
- Actual browser clicks exercised home → overview → history → detail → back.
- Switched 7/28 days; checked 37 current profile matches versus 9 previous matches.
- Checked weekday filtering, empty search, clearing search/filter, chart legend toggle and stage selection.
- Corrected the demo timestamp mapping and verified the list/detail local times match.
- Visually checked dark/light at 1194×834 and the dark overview/history at 1024×768; no document-width overflow at 1024.
- Home layout was corrected after visual inspection so the new module does not clip the utilities.

Entry refinement checks:

- Both whole-card buttons open their intended destinations; the insight card selects seven days, and the latest-shot card opens the correct profile/time/yield.
- The coverflow and entry-row bounds remained identical at the initial 1120×897 viewport.
- At 1024×768 the entry cards align with the scale card's bottom edge, with no horizontal overflow. The insight card remained clickable.
- Dark/light entry visuals checked at 1194×834. The preview now opens on Home.
- The home average is a mean, not the overview median; missing yield is excluded. Dose in the chip is explicitly fictional shot metadata.

Current entry evidence: `home-entry-dark.png`, `home-entry-light.png`, `home-entry-1024.png`.
Earlier overview/detail evidence: `overview-dark.png`, `overview-light.png`, `history-dark.png`, `shot-detail-dark.png`. `home-dark.png` preserves the initial entry design for comparison.

These checks verify the design prototype, not a Decaid aggregation implementation or real hardware behaviour.

## Shared navigation and standalone detail refinement

- Insights and the actual Settings screen use the same `SidebarBrand` and `SidebarNavItem` components.
- Both close controls are 42×42px. Selected items share their green color, solid surface, thin outline, 14px radius and 46px height.
- Only Insights opts into the standalone shot-detail layout. The legacy main-app history route retains its existing list browser until integration.
- Actual clicks verified Settings section selection, Insights Overview/History selection, and Close from a latest shot returning to Insights History.
- A filtered Adaptive V2 history retained its filter after detail; repeated detail visits restored a 273px list scroll position exactly.
- Visually checked full-width detail and navigation in light mode at 1024×768 and dark mode at 1194×834.
- Settings was checked in local/disconnected mode. No settings were saved and no machine operations were performed.

Evidence: `detail-full-width-dark.png`, `detail-full-width-light-1024.png`, `sidebar-insights-dark.png`, `sidebar-settings-dark.png`.

## Filled bar styling refinement

- Home, weekday and horizontal bars share one rounded solid-fill rule; comparison bars and legend markers use a theme-specific muted fill. No bar borders, shadows or gradients.
- Actual browser clicks verified Monday → nine matching brews and the home insight card → seven-day Overview.
- Visually checked dark/light at 1194×834 and light at 1024×768, including the zero-count Tuesday. No horizontal document overflow at 1024px; computed bar borders are 0px.
- All 300 tests and the production build passed. Existing bundle-size warning remains. No telemetry, filters or aggregation logic changed.

Evidence: `bars-unified-dark.png`, `bars-unified-light.png`, `bars-unified-light-1024.png`.

## Home bar and period-control consistency

- Removed the remaining home-only opacity scaling. Nonzero bars now share solid theme color, 20px width and 7px rounding with Overview; both use neutral baseline ticks for zero counts.
- Home remains seven chronological dates; Overview remains weekday aggregates with previous-period comparison. The compact home chart keeps its smaller available height.
- Period select uses an inset custom chevron (18px from the right before rotation), with space reserved for its label at compact widths. The native select behavior and keyboard focus indication remain.
- Browser clicks opened the menu, switched 7/28 days and opened Overview from Home. Verified dark/light at 1016×720 and the compact light layout at 640×900; no horizontal overflow at 640px. All 300 tests and the separate preview TypeScript check passed.

Evidence: `bars-matched-home-dark.png`, `bars-matched-home-light.png`, `bars-matched-overview-dark.png`, `period-chevron-light-compact.png`.

Current observation scope: the prototype chooses one profile-share increase story, otherwise a dominant time-band routine summary, otherwise brewing-days fallback. Time-band changes are specified but not implemented. These are deterministic fictional-data examples, not connected machine analytics.

## Shared home surfaces and 24-hour heat strip — 13 September 2026

- The neutral home profile panel, insight entry and latest-shot entry share an identical opaque surface per theme. The selected profile's animated gradient art remains unchanged.
- The insight entry chart has 24px top padding at both regular and short-screen breakpoints.
- Current and previous heat-strip rows share one count-to-color scale. Empty windows are neutral; selecting a cell shows its exact count. View brews opens that time window in the selected reporting period.
- Actual browser clicks verified prior-period 14:00–16:00 → 9 brews, switching that filter to the current period → 8 brews, and prior-period 10:00–12:00 → an empty list.
- Visually checked dark/light at 1194×834 and dark home/overview at 1024×768. Home entry content and the heat strip had no horizontal overflow; top padding remained 24px. Temporary viewport overrides were reset after testing.
- All 302 tests, production build, separate preview TypeScript check and targeted lint passed. Existing production bundle-size warning remains.
- This remains a fictional-data design preview on the Insights branch, with no machine connection. Touch targeting on real tablet hardware and backend aggregation are not verified.

Evidence: `heat-strip-dark.png`, `heat-strip-light.png`, `heat-strip-1024.png`, `shared-home-surfaces-dark.png`, `shared-home-surfaces-light.png`, `shared-home-surfaces-1024.png`.

## Open charts above the summary — 13 September 2026

- Weekly rhythm and When you brew now precede the four summary metrics in both visual and document order. Both chart sections have transparent backgrounds and no card outlines; the summary retains its divided card.
- The two charts use a wider gutter and 28px separation from the summary. Below 1000px they stack before the summary without changing data or filtering behavior.
- Browser verification checked both themes at 1054×901 and the stacked light layout at 980×800, including scrolling to the summary. No horizontal document overflow at the narrow breakpoint.
- Actual clicks verified Monday → two matching brews and the previous-period 14:00–16:00 heat cell → three matching brews. All 303 tests, separate preview typecheck, targeted lint and production build passed; the existing bundle-size warning remains.
- This is still a local fictional-data preview, not a connected-machine or hardware-touch verification.

Evidence: `open-charts-dark.png`, `open-charts-light.png`, `open-charts-light-stacked.png`, `open-charts-light-stacked-summary.png`.

## Coxcomb and quieter chart copy — 13 September 2026

- Replaced the heat strip with a 24-hour coxcomb: twelve equal-angle, two-hour sectors arranged clockwise from midnight. Sector area (excluding the center) is proportional to count; switching This period/Previous keeps one shared scale. Zero values never create colored petals.
- Kept only By day / By hour, essential period controls and clock/weekday labels. Removed the subtitles, weekly helper footer and heat-scale legend. Exact count and a compact history link appear only after selecting a sector, with space reserved so the summary does not jump.
- Selection supports pointer input plus Enter/Space. Browser clicks verified current 06:00–08:00 → 4 brews; switching Previous → 5 brews and five matching history records. Keyboard selection of 22:00–24:00 → 0 and an empty history list. Monday drill-down still opened nine records in the 28-day view.
- Visually checked both themes at 1054×901, plus a selected coxcomb and summary in the stacked light layout at 980×800. The SVG stayed 236×236 with no horizontal document overflow; temporary viewport overrides were reset. Real tablet touch remains unverified.
- All 305 tests passed, including area-scaling, zero-value and clock geometry tests. Separate preview typecheck, targeted lint and production build passed; the existing bundle-size warning remains. This remains a local fictional-data preview, not a released analytics feature.

Evidence: `coxcomb-dark.png`, `coxcomb-dark-selected.png`, `coxcomb-light.png`, `coxcomb-light-stacked.png`.

## Coxcomb contrast and phone-only stacking — 13 September 2026

- Light mode now uses an opaque pale-sage clock face, dark neutral hour labels and a stronger previous-period sage shared with the weekday chart. Both data fills exceed 3:1 contrast against the face and hover fill; zero windows remain uncolored. Dark chart colors and opacity are unchanged. No outlines added.
- By day and By hour stay side by side above 650px, with wrapping chart headers at compact tablet widths. At 650px and below they stack. The lower panels and summary keep their existing tablet layout. Also constrained the shared brand image height and compact history columns in this preview to prevent stretching/overflow at the narrow-tablet boundary.
- Browser clicks verified Previous selection and 14:00–16:00 → nine matching history records on phone. Visually checked light at 980×800, 768×900, 651×850, 650×900 and 390×844, plus dark at 768×900. Chart geometry stayed circular and chart content did not overflow; temporary viewport settings were reset.
- All 307 tests, separate preview typecheck, targeted lint and production build passed. Contrast and phone-only stacking have regression tests. Existing production bundle-size warning remains. This is fictional preview data; real device touch remains unverified.

Evidence: `coxcomb-contrast-light-tablet.png`, `coxcomb-contrast-light-651.png`, `coxcomb-contrast-light-phone.png`, `coxcomb-responsive-dark-tablet.png`.

## Taller weekday chart and cooler light palette — 13 September 2026

- Increased the weekday plot from 90px to 200px on desktop/tablet (160px on phones). At 1054×901 the summary remained at the same vertical position, so the plot fills existing space rather than pushing content down. Count labels now line up with the current-period bar, not the midpoint of both bars; they remain current-period totals only.
- Replaced the light-mode olive/sage chart treatment with cooler green `#328a6b`, neutral green-grey comparison `#6f7e77`, and a lighter neutral clock face `#e7e9e5`. The palette is shared by preview home, weekday, hourly and profile-usage charts. UI accents and dark chart colors are unchanged. Both fills retain at least 3:1 contrast against the coxcomb face/hover states.
- Browser clicks verified Monday → nine current-period brews and the zero-count Tuesday in the seven-day view → an empty history list; previous-period coxcomb switching still works. All seven count-label centers match their current bar centers. Visually checked both themes at 1054×901, light tablet at 768×900 and light phone at 390×844, with no content overflow. Temporary viewport overrides were reset.
- All 308 tests, separate preview typecheck, targeted lint and production build passed; the existing bundle-size warning remains. This is still a fictional-data preview on the Insights branch, not a released feature or a real-device touch test.

Evidence: `tall-weekday-cool-light.png`, `tall-weekday-light-tablet.png`, `tall-weekday-light-phone.png`, `tall-weekday-dark.png`.

## Softer previous-period comparison — 13 September 2026

- Light comparison bars and their legend now use `#98a59d`, receding behind the unchanged current green. The selected Previous coxcomb also softens to `#79867f`, with a lighter hover face to retain 3:1 contrast. It is slightly stronger than the secondary bars because it is the primary dataset when selected. Dark mode is unchanged.
- Browser-checked This period/Previous switching at 1052×734 and restored the light/current view; verified the dark comparison token was unchanged. All 308 tests passed, including the selected coxcomb contrast check. No layout, data, or machine behavior changed; real-device touch was not tested.

Evidence: `soft-comparison-light.png`, `soft-comparison-previous-light.png`.

## Dose in brew lists — 13 September 2026

- Added Dose immediately before Yield in History and Overview's recent brew list, using each record's dose in grams. Missing dose displays an em dash; units stay attached to their values.
- Browser clicks verified History → shot analysis → Close returns to History. Visually checked dark at 1052×734 and light at 768×900, 651×844 and 390×844; the added column fits without horizontal content overflow. Restored the default viewport and dark History view.
- All 309 tests, separate preview typecheck, targeted lint and production build passed. Existing bundle-size warning remains. This is still a fictional-data preview; real-device touch and backend dose data are not verified.

Evidence: `history-dose-dark.png`.

## Saved-shot integration and offline RC — 13 September 2026

- Integrated the main homescreen, Insights and full-width history detail with Decaid's existing saved-shot endpoints. The fictional design preview stays separate and is not shipped in the RC ZIP.
- Persisted latest-100 summaries and lazily loaded detail graphs in IndexedDB, partitioned by gateway. Added explicit partial-coverage/offline/storage-failure states, dose provenance, beverage filters, canonical yield handling and refresh/reconciliation for changed or deleted shots.
- All **324 tests** pass, including corrupt-cache/source isolation, deletion during detail fetch, wrong detail ID, request deduplication, offline restart, summary/detail provenance, DST dates and matching chart/list populations. Production build and targeted lint pass. The existing large-main-chunk warning remains (about 566 kB uncompressed).
- Browser verification used an isolated origin and a **GET-only local HTTP contract fixture**, with 120 saved-record-shaped entries and real-shaped detail measurements. Verified latest 100, Monday → 2 matching records, 06:00–08:00 → 7 records, 28-day incomplete comparison suppression, Pour-over filtering, today's latest shot, detail Close, and browser Back preserving the hourly filter.
- Stopped the local API server, reloaded the app and verified persistent list + previously opened graph. An unopened graph showed the reconnect/retry state. Restarted the API and retried successfully, then refreshed summaries without losing unchanged cached graphs.
- Visually checked dark home/detail at 1024×768 and 1280×720, plus light overview/history at 1024×768 and 390×844. No horizontal content overflow at the checked tablet/phone widths. Light mode was changed through the actual Settings UI in the isolated test origin, not by changing the user's existing preview preferences. Temporary viewport overrides were reset after checks.
- **Not verified:** actual Decaid runtime, physical machine or tablet-touch operation. No Decaid instance/Flutter runtime was available locally. The RC ZIP is for the user's real-device validation; no public push, merge or release performed.
- Also served the actual staged production files and clicked Monday → two records → recorded shot detail (30 seconds, 38 g). Verified the ZIP root and manifest use the separate `rc-bestpresso` ID; archive integrity passes. Closed temporary test tabs/servers, leaving the user's existing preview running.

Evidence (contract fixture, not the user's history): `integration-light-1024.png`, `integration-light-phone.png`, `integration-offline-detail.png`, `integration-hour-filter.png`.

## RC feedback: profile grouping and entry spacing — 13 September 2026

- Replaced recipe-snapshot usage grouping with normalized saved profile name + drink type. Routine recipe/temperature/target changes now share a row. Named variants stay separate. Full shot signatures still protect detail cache invalidation, and old offline groups migrate without dropping saved curves. The UI identifies this as grouping by profile name; it does not claim reliable profile lineage where the saved data lacks it.
- Moved both home-entry layouts into explicit full-size inner containers, with full-width chart/summary rows. Retained 24px top inset, consistent inner padding, title-left/metrics-right hierarchy and separate latest-shot shortcut. Removed the routine Espresso/completed-days footer; kept conditional loading/offline/incomplete warnings and screen-reader scope/coverage.
- **326 tests**, targeted lint and production build pass. Added regressions for same-name recipe changes, named variants, beverage separation, old offline-cache migration with graph retention, and home-layout structure/subtext.
- Browser fixture now varies targets and stage/tank temperatures between shots. Verified one Adaptive V2 row with 9 brews, then clicked it and confirmed 9 matching history records. Inspected light ranking and home, plus dark home; chart/summary widths match and neither overflows at 1440×1000, 1194×834 and 1024×768 (ranking also inspected at 1194×1100). Tablet touch and the user's actual iOS webview remain device checks, not locally verified claims.

Evidence: `grouped-profile-usage-light.png`, `home-entry-spacing-light.png`, `home-entry-spacing-dark-1024.png` (local fixture data).
