# Streamline hot-water integration in Bestpresso

Branch: `fix/streamline-hot-water-sync`. Scope: issue #51's hot-water settings and readback path, not a replacement of Bestpresso's interface or the native sequencer.

## Implemented

- Home amount/temperature adjusters and Settings use one ordered writer.
- Edited amount and temperature are stored under Streamline's existing shared keys (`last-hot-water-volume`, `last-hot-water-temp` in `streamline-app`) before PUT /workflow.
- Settings sends only edited hot-water fields. Editing flow or duration cannot republish an old amount or temperature.
- Home subscribes to /ws/v1/machine/shotSettings. Amount, temperature and duration are parsed defensively; amount and temperature update the existing card and monitoring target.
- Workflow polling cannot overwrite an available physical hot-water readback.
- Boot, changed live readback, reconnect and return to idle can reconcile remembered targets with the workflow. Missing intent never invents a default.
- Duplicate frames do not repaint; a per-field 30-second guard prevents alternating machine echoes from creating write storms.
- Explicit edits invalidate pending drift lookups; Home and Settings share a queue.
- Settings broadcasts refreshed values after Save instead of broadcasting its old draft.

## Deliberate adaptations

Unlike Streamline, automatic corrections wait for a connected, explicitly idle machine and completed initial workflow loading. They do not run during a dispense, espresso or cleaning restoration.

Shared-store failure is surfaced and blocks the hot-water target write. Bestpresso does not silently fall back to an old device-local target for automatic repair: that could fight another device's newer shared choice. A workflow failure can leave remembered intent saved for a later retry; it is not an atomic transaction.

The existing Bestpresso policy remains: scale stopping is enabled when a scale is connected. Independent espresso/hot-water calibration remains unchanged. The machine's volume/time backstops, flow, tare handling, projection formula and native stop controller are not modified by reconciliation. No new machine start/stop command was introduced.

## Verification

- Full unit suite: 373 passing tests, including 13 new hot-water ordering, failure, invalid-data, readback, cooldown and active-state tests.
- Production build succeeds; existing bundle-size warning remains.
- Changed-source lint passes.
- Real browser interactions at the existing 1052 × 734 viewport, against an in-memory REST/WebSocket fixture:
  - Settings amount 20 → 30, Save, then Home shows 30.
  - Home dial 30 → 31, Save. Request log proves shared-store POST before workflow PUT on both surfaces.
  - Simulated dispensing readback 24 / 55° updates the card and overlay without a workflow write.
  - Return to idle restores 31 / 60° in one hot-water patch. Flow and duration remain unchanged.
  - Shared-store 503 leaves Save retryable and does not send the target to the workflow. Subsequent save succeeds once the fixture recovers.
- Fixture: `test/hot-water-api-fixture.mjs`, loopback port 5395. It is not a native Decaid simulator and makes no hardware calls.
- Screenshot: `review/hot-water-streamline-settings.png`.

## Still requires hardware validation

Flutter is unavailable here and no real Decent/Bookoo scale is connected, so the decent-app hot-water stop-at-weight scenario could not run. Do not close #51 based on this fixture.

A successful workflow response is not independent proof of a physical BLE write. In the inspected native controller, an identical workflow patch may skip machine writes. This implementation intentionally does not bypass that with a raw shot-settings POST, replace unrelated settings, or inflate safety backstops.

Retest the reporter's 20 g dispense with the same calibration, flow and duration as Streamline. Capture arming, tare/scale freshness, projected-weight stop logs and the final state transition. If it still stops early without a native projected-weight stopping log, investigate the native exit cause rather than claiming this skin change fixes it.
