# PR84 + PR85 integration test build

Version: `0.1.30-patch004-test001` (unpublished).

Branch: `test/pr84-85-integration`.

## Included

- Released main `5405f97` (Patch004), including the recent safety, animation-preference and home-rendering changes.
- PR84 `51c5be5`: typed English tokens, German catalog, language preference, regional numbers/dates, structured stage-reason labels, translation validation and documentation.
- PR85 `5cbefa6`: profile-library memoization and bounded explicit-timezone date formatter caching. Its carousel and scale optimizations were already in Patch004 and are retained without duplicate implementations.

## Integration corrections

- Memoized home cards subscribe to language/catalog changes, including lazy-load completion. Day names are localized at render time; the underlying seven-day summary stays memoized and language-neutral.
- Steam updates use metric IDs, never translated labels. Reservoir and scale model values remain canonical; only presentation is localized.
- Keep current stop-confirmation, timeout, auto-tare and background-search safeguards. New stop messages and the animation setting are included in both catalogs.
- Preserve older-WebView viewport fallbacks and static animation rendering. Phone settings controls hug content instead of inheriting desktop flex-basis as vertical space.
- Normal skin ID and preference/history keys are unchanged. This is a replacement Bestpresso skin for testing, not a separate installation.

## Verification

- 556 automated tests passed, including locale/decimal input, cached history and stage labels, render-model identity, date formatter reuse, carousel scheduling and tablet-safety tests.
- 1,001 English/German entries validated: no missing translations, stale review fingerprints or unapproved interface literals. This is revision/structure validation, not native-speaker proofreading.
- Production build and lint passed (five pre-existing preview Fast Refresh warnings; existing bundle-size warning).
- Mocked browser checks: Settings language switch without reload; memoized home labels; comma decimals with numeric machine payloads; language persistence; 1024×768 and 390×844 layouts; keyboard/swipe selection; animation opt-out/re-enable and reduced-motion handling.
- Production stop scenarios: confirmed, unconfirmed with bounded retry, disconnect, new-shot supersession, and preparation-only auto-tare.
- Instrumented single-mount browser: 40 pairs of unchanged machine/scale readings caused zero home-card renders; a changed steam degree rendered only the steam card. This checks rendering work, not real-device FPS or battery use.

All machine traffic in browser tests was mocked. No physical machine was started. On-device testing and native German wording review remain outstanding.

## Suggested device checks

1. Install the ZIP through the usual custom-skin flow. Select Language under Settings → App experience.
2. Switch between English, Deutsch and Follow device; check home, profiles, history, insights and stage reasons.
3. Adjust a decimal setting; confirm the displayed comma/dot and the saved value agree. User profile/stage names should remain unchanged.
4. Browse/search/reorder favorites, select a profile, and expand/collapse utilities. Check with Animations both on and off.
5. Verify existing cached history, a newly completed shot, and offline use on the actual tablet.

No GitHub PR merge, tag or release was published for this test build.
