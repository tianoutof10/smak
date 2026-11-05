# Stage move-on reasons

Branch: `feat/stage-move-on-reasons`. Display-only; no changes to machine execution, profile exits, or stop logic.

## Presentation

Live and history share the same stage strip. Finished stages show a left-aligned, regular-weight 12px explanation beneath the title, above telemetry. A leading 14px advance icon identifies a transition; a stop icon identifies the final stage. Adjacent conditions share “reached,” such as “Time limit or Pressure threshold reached.” Reasons use the value color; “or” uses the muted label color. Active stages show green “Active stage” text with a leading circular loader and a green timer. Reduced-motion preferences disable the loader animation. Unknown evidence is displayed as “Unknown.” The row hugs its tallest content; all stage cards and the manual advance button share that height without a fixed height.

Pressure and flow reasons include the saved recipe's direction, value and unit, for example “Pressure >7 bar reached” or “Flow <2.5 ml/s reached.” The compact >/< symbols represent the profile's over/under settings; firmware comparisons include equality. The displayed value is the configured threshold, not the observed sample or its encoded rounding.

## Evidence priority

1. An explicit, stage-matched request from Decaid's `ws/v1/machine/shotState` weight exit, or an accepted Bestpresso manual advance, within two seconds before an observed adjacent transition. Explicit competing requests remain OR alternatives.
2. Telemetry and the shot-time profile: duration boundary interval, pressure/flow exits, actual stage weight, or integrated stage volume. A first adjacent-stage sample can confirm a nearby sensor crossing only when the departing stage was already trending toward it and both sampling intervals are within 1.5 seconds. Arbitrary new-stage jumps do not qualify. Earlier gaps do not discard valid boundary evidence, but prevent volume integration. Duration and sensor comparisons account for firmware rounding; unknown machine families retain plausible encoded thresholds as inferred alternatives. No assumed weight look-ahead. Opposite-axis limiters are not exits.
3. Unknown. Without a specific recorded stop reason, natural completion can be inferred only at the final configured stage. Explicit stop reasons take priority; missing stages are never labelled skipped from a frame jump alone.

These are best-effort explanations, not firmware-reported causality. Derived reasons expose a “Derived from saved profile and telemetry” title. Firmware `profileAdvance` alone is not a specific cause. `profileSkip` with a positive `stepExitWeight` means stage yield, not manual skip. Manual actions from another app cannot be reconstructed unless explicitly reported in a future API.

## Live / persistence

- Snapshot the active workflow's steps at shot start, independently of library-card chart data.
- Capture optional shot-state events without requiring that channel for normal live telemetry. Older Decaid builds fall back to inference.
- Retain a source-scoped local journal, bounded to 1,000 shots. Explicit requests use machine-aligned timestamps and match the persisted shot ID where available. Events must precede the observed boundary; late or wrong-frame requests never override inference.
- Persist analyses alongside detailed graphs in the existing IndexedDB cache. The final shot's `stopReason` is separate from stage exits.
- Explicit evidence is device-local; it is not uploaded to Decaid. Another device with only historical telemetry will derive its own reasons.

## Existing history

- Version-3 migration rechecks earlier analyses, including generic threshold labels and Unknown, five cached graphs per batch, with one-second scheduling gaps. It pauses outside idle home/history/insights views and when hidden, resumes later, and works offline.
- Old cache revision signatures retain the shot's workflow and are used to recover its profile. Never use the currently selected profile to analyse an old shot.
- Summary-only records are deferred; loading their detail performs reconciliation immediately. This migration does not download all 1,000 graphs.
- Versioned results, including Unknown, persist so successful work is not repeated after every launch. New recorded evidence can invalidate an earlier derived result on detail access.

## Review

`/review/stage-reasons/index.html` uses the production live/history components with labelled sample data and no machine commands. It includes OR exits, weight advances, manual advances and an active-stage indicator; switch to History to inspect the final stop reason. Test at 1024×768 and 1024×650 in both themes. Automated tests and UI review do not replace real-machine validation.
