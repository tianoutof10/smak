# Bestpresso v0.1.28 — Brewing insights

## Your brewing, at a glance

- A new **Past 7 days insight** card on Home shows your recent brewing rhythm, shot count and average yield.
- The adjacent latest-shot card keeps the recorded graph one tap away. Its chip now shows **dose → yield • duration**, for example `20 → 36.2 g • 30s`.
- Open Insights for weekday and time-of-day patterns, brewing frequency, typical yield and the profiles you return to.
- Choose **7 or 30 days**, with **180 days** appearing only when cached history covers at least that many completed calendar days. Comparisons use the preceding equal-length period and are withheld when coverage is incomplete.

## History behind every insight

- Tap a weekday, time window or profile to see the matching brews. Search the list, then open a shot for its full-width chart and stage breakdown.
- Dose, yield and duration appear together in history. Closing a shot returns to the list and preserves your place.
- Repeated uses of the same profile name are grouped together, even when recipe settings change. Named variants remain separate.

## Saved on this device

- Cache up to **1,000 saved-shot summaries** from Decaid, with incremental recent updates and periodic checks for older changes.
- Previously opened graphs remain available offline. Full graphs load on demand; the latest shot also loads automatically for its home-card preview.
- Existing 100-shot caches expand automatically. Interrupted downloads preserve the previous cache, and missing values are never replaced with invented results.

Insights describes recorded brewing, not personal caffeine consumption. The cache is specific to this browser/device and gateway; 1,000 records do not guarantee a full year. Today is included in latest-shot and all-history views, while reports use completed days.

Install **bestpresso-v0.1.28.zip** in Decaid.

## Profile controls patch

- Delete created and imported profiles from their detail page, with confirmation. Saved shots and graphs remain intact; built-in profiles are protected. Select another profile before deleting the one currently loaded.
- Sleep is now the leftmost home-screen control, followed by Cleaning and Settings. Resolves [#52](https://github.com/xinghendri/bestpresso/issues/52).

This patch updates the existing download; the version remains **0.1.28**.
