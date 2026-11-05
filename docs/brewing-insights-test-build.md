# Brewing Insights — RC device test

The RC instructions below are retained for earlier test packages. The public v0.1.28 package uses the normal `bestpresso` skin ID; see [v0.1.28 release notes](../RELEASE-v0.1.28.md).

This build uses your existing Decaid saved shots. It does not modify that history or upload it anywhere. The package installs as **RC Bestpresso · Insights**, with skin ID `rc-bestpresso`, separate from the public `bestpresso` skin. It replaces an older RC skin with the same ID if one is installed.

## Start

1. Import the supplied RC ZIP into Decaid and select **RC Bestpresso · Insights**.
2. Keep Decaid available and open **Past 7 days insight** from Home. Check the last-sync time and saved-record count (up to 1,000). Existing 100-record caches expand automatically; the first larger sync may take longer.
3. Compare the count, dose and yield against known shots. Select Pour-over for tea/pour-over recipes. Choose History → All cached history to include today's shots.

## Things to test

- Tap a weekday, hourly sector/history link, or profile; the resulting list must match its count and selected period.
- Open a known shot. Check its recorded curve, final yield and stage cards against Decaid. Close should return to the same filtered list.
- Select each period: **Last 7 days**, **Last 30 days**, and **Last 180 days** when the cached archive covers at least 180 completed calendar days. A younger archive must omit 180 days in both Overview and History. For 180 days, confirm the previous period covers the immediately preceding 180 days, not another overlapping range.
- Choose All cached history, then Show more brews. Search should still find matches beyond the initially displayed 100 rows. Open and close a shot from the expanded list; return to the same list position.
- Open several graphs while connected, then disconnect the history source while keeping the installed skin available. Reload: the up-to-1,000 summaries and those graphs should remain. An unopened graph should ask to reconnect.
- Reconnect and Refresh. New/corrected/deleted records should be reflected; retained unchanged graphs should stay cached.
- Complete a new shot and check Latest shot / All cached history. The seven-day report intentionally excludes today's incomplete day.
- Try both themes and tablet orientations. Counts should not change when changing layout or theme.

## Expected limitations

- A 1,000-record cache does not guarantee a year, or even 360 days on a busy machine. Partial coverage is labelled, and comparisons are withheld unless both selected periods are covered. Today is excluded from completed-day reports.
- Automatic recent updates fetch only the first 100 summaries when the cached tail is still trustworthy. Older edits are checked by a full sweep every 15 minutes while active, or immediately with Refresh. Deletions/count changes that cannot be safely merged trigger a full sweep. Interrupted/failed pagination preserves the prior snapshot.
- Duration may initially show `—`: the list API does not provide it. Opening the actual graph fills it. Missing yield is also `—`, never a target substituted as an actual result.
- Dose can be the historical target, not a weighed dose. Older records may lack beverage type or simulation flags; Other / unknown and the provenance note make this explicit.
- Profiles group by saved name within a drink type (case/whitespace normalized), so recipe adjustments no longer create duplicate rows. Named variants remain separate. Without a saved library ID, unrelated profiles with identical names/types cannot be distinguished, and renames are separate. Existing caches regroup automatically, preserving their graphs.
- Cache is per browser/device and gateway. Clearing browser storage or changing skin origin/gateway can start a fresh cache. This is not an offline install/service worker for the app assets.

## Verification before packaging

Read-only integration follows the current Decaid source schema. Automated tests cover normalization, bounded coverage, daylight-saving dates, offline restart, source isolation, edits/deletions, corrupt storage, request deduplication and route preservation. Browser checks use a local HTTP fixture implementing the real saved-shot contract, including a server-off/reload/reconnect cycle and tablet/phone views. **No physical machine or running Decaid instance was available for this verification.** This ZIP is for that next device test, not a published release.

### RC p003 verification — 13 September 2026

- 337 automated tests pass; TypeScript/production build and targeted lint pass. The pre-existing large-bundle warning remains.
- Browser upgraded an existing 100-of-120 cache to 1,000-of-1,200 from the paginated HTTP fixture. API-contract tests cover empty/partial pages, the 1,000 limit, incremental prepends, older corrections, deletions, imports, changing pagination and interrupted downloads.
- Clicked 7/30/180-day selections, previous-period hourly drill-down, Show more, older shot detail and Close. A 163-row expanded filtered list retained its scroll position on return. All activities counted 1,000 while initially rendering 100 rows.
- Stopped the fixture, reloaded and retained all 1,000 records. A previously opened September 2025 graph worked offline; an unopened graph showed a reconnect/retry state and loaded after the fixture restarted.
- Inspected dark/light at 1194×834, light history at 1024×768, and light overview/history at 390×844. Period controls and year-spanning dates fit without horizontal overflow. These are browser pointer checks, not physical iOS touch tests.
- Screenshot evidence: `review/brewing-insights/cache-1000-180-days-dark.png`, `cache-1000-180-days-light.png`, `cache-1000-offline-old-graph.png`, and `cache-1000-history-light-phone.png`.

### v0.1.28 verification — 13 September 2026

- All 340 automated tests pass; production build (including TypeScript) and targeted lint pass. The existing large-bundle warning remains.
- A 100-record / 50-day HTTP fixture omits 180 days in both Overview and History. An unavailable 180-day bookmark changes to 30 days after loading. Boundary tests distinguish elapsed calendar coverage from record count and active brewing days, including truncated and stale caches.
- A 1,000-of-1,200-record fixture exposes 180 days; actual dropdown selection from 30 to 180 days preserves the requested route and displays the equal-length preceding period.
- The latest-shot chip displays `20 → 36.0 g • 30s`. Clicking it opens a shot showing the same 00:30 duration; Close returns to History. The chip fits at 1194×834 and 1024×768.
- Screenshot evidence: `review/brewing-insights/v0.1.28-home-duration.png` and `v0.1.28-180-days.png`. Verification uses a read-only local API-contract fixture, not a physical Decaid/iOS device.
