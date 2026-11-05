# Issue 51: Streamline hot-water implementation map

Reviewed 13 September 2026. Read-only investigation; no implementation or issue changes made.

## New evidence

[Reporter retest](https://github.com/xinghendri/bestpresso/issues/51#issuecomment-5651875879): updated Bestpresso 0.1.28, hot-water look-ahead saved at 0.30 s, target 20 g, stops at 14.2 g. Decaid logs arming at 20 g but no weight-target stop message. Same machine/Bookoo Themis Mini succeeds using Streamline.

This shows the previous calibration-copy fix was insufficient. Assuming the log is complete, the predictive weight controller did not request this stop. It does not yet identify which other stop path won. The two tests establish a skin-dependent outcome, not that all machine settings were identical.

Source scope: Streamline origin/main `d8f9eb2d8f7df8645d18d74c1b07eb6e0b0988aa`, including changes beyond the older local checkout; Bestpresso released revision `a63c3c0`; authoritative local Decaid source `/Users/hendri/Downloads/decaid-main`. Reporter’s Decaid and Streamline versions remain unconfirmed. No hardware trace reproduced locally.

## Ownership map

| Stage | Streamline | Bestpresso | Owner |
|---|---|---|---|
| Calibration | Separate weightFlowMultiplier and hotWaterFlowMultiplier; latter defaults to 0.3 s, step 0.05 | Now independent, same default and precision | Decaid settings |
| Scale stop switch | Honors stored stopHotWaterAtWeight; control disabled without scale | Forces true when a scale connects, per product decision | Decaid settings |
| Amount / temperature | Workflow hotWaterData.volume / targetTemperature | Same fields | Workflow and machine |
| Flow / timeout | Workflow hotWaterData.flow / duration | Same fields | Workflow and machine |
| Home changes | Shared intent saved first, then workflow PUT | Workflow PUT first, shared intent saved afterward | Skin |
| Settings changes | Workflow change plus corresponding shared amount/temp keys | Workflow change only; corresponding shared keys not updated here | Skin |
| Initial reconciliation | Reads workflow and shared intent; repairs differing amount/temp | Reads workflow; does not reconcile hot-water intent | Skin |
| Live settings | Subscribes to machine shotSettings; repaints and checks drift | No shotSettings subscription; workflow polled every 15 s | Skin |
| Start | Header water button / W key requests hotWater | No hot-water start API path in current skin; monitors externally started operation | Skin or physical controls |
| Tare, prediction, automatic stop | Delegated to Decaid | Delegated to Decaid | Decaid |
| Native volume/time stop | Retained | Retained | Machine firmware |
| End display | Utility pouringDone handled as post-action tail | Overlay cleared when top-level machine state ceases to be hotWater | Skin |

## 1. Streamline settings and persistence

`src/settings/settings.js` defines independent REA fields. Hot-water UI reads workflow temperature/volume/duration/flow, displays defaults only when absent (75 C, 50, 30 s, 2.5 ml/s). These UI fallbacks are not proof of the reporter’s active values. Local Decaid’s HotWaterData.defaults has flow 10, so actual readback matters more than either fallback.

Calibration changes are staged by updateReaSetting and sent through setReaSettings on Save. Hot-water +/- uses 0.05 and two-decimal formatting. Scale connection changes the stop-switch presentation without itself overwriting calibration.

Home amount and temperature setters in [api.js](https://github.com/decentespresso/streamline-js/blob/d8f9eb2/src/modules/api.js#L1534) now await shared-store persistence BEFORE PUT /workflow. This ordering was explicitly changed to prevent a live echo from interpreting an old shared value as intended and restoring it over a new edit.

Settings flushPendingChanges also persists `last-hot-water-volume` and `last-hot-water-temp` when their workflow values change. It queues workflow writes and shared writes differently from the awaited Home setter; it should not be described as one universal atomic transaction.

Bestpresso Home uses these same shared keys but writes them after the workflow response. Bestpresso Settings does not maintain these keys. Consequently a later Streamline session can restore a different remembered target after a Bestpresso Settings edit. This is a confirmed consistency gap, not proof that it caused the reported stop.

## 2. Streamline workflow versus physical machine settings

In [app.js](https://github.com/decentespresso/streamline-js/blob/d8f9eb2/src/modules/app.js), loadInitialData reads the workflow and compares remembered hot-water volume/temp. resyncIfDrifted re-pushes a remembered value only on disagreement; it does not blindly rewrite every field.

handleShotSettingsData receives the machine shotSettings stream, updates the display, and calls resyncDriftedShotSettings. Amount/temp are among tracked fields. Corrections have a 30-second per-field cooldown to avoid repeated writes and BLE instability. This is not continuous weight-control logic.

Bestpresso applies the workflow to its home model and polls every 15 seconds. It does not consume machine shotSettings. Thus the overlay’s “20” is a workflow/model value, not independent confirmation of all physical stop settings.

Important Decaid limitation: local updateWorkflowSettings compares old/new workflow values and returns early if no relevant values changed. Re-sending an identical workflow field is therefore NOT guaranteed to force a physical-machine rewrite. Any proposed repair must verify the actual device settings rather than assume PUT success proves resynchronization.

## 3. Dispensing and automatic stop

Streamline’s header hot-water button and keyboard mapping call PUT /machine/state/hotWater. The generic call does not implement a skin-side predictive stop or replace volume with a special large limit.

Local Decaid HotWaterSequencer listens to the controller’s hotWaterData stream (not merely the skin’s displayed model), scale connection/weight, and machine snapshots. On hotWater it arms only when a machine and scale are connected, stopHotWaterAtWeight is true, gateway mode is not full, and target > 0.

It snapshots target, flow and look-ahead, requests scale tare, and waits for tare confirmation (weight <= 3 g), at least the 600 ms smoothing window, and a fresh scale frame (< 2 s). Arming alone does not establish that these later guards passed.

Prediction is weight + controlWeightFlow * lookaheadSeconds. Missing/nonpositive control flow falls back to configured flow. Nonpositive look-ahead falls back to 0.3 s in the reviewed source. At threshold it emits the “Hot water target … reached … stopping” log and requests idle. On scale disconnect or leaving hotWater it disarms. Neither skin replaces this controller.

Decaid separately programs the machine with hot-water flow, volume and duration. The same numeric amount is used as the scale gram target and the firmware volume limit. A firmware volume cap need not equal grams that reached the cup. Firmware time/volume can end dispensing before the scale prediction; then the sequencer clears without its target-reached message.

## 4. Overlay disappearance

Bestpresso LiveUtilityOperationOverlay is presentational: no click-to-stop, timer-to-stop, weight comparison stop, or unmount stop effect. useBrewingData clears it when a snapshot leaves hotWater; a device disconnection can also remove the monitored operation. Disappearance is evidence of the observed lifecycle ending, not a cause established by the UI.

The displayed 14.2 g is the most recent scale value shown then, not guaranteed settled cup weight after drips. The reporter should capture both where possible.

## What to capture next

Perform two controlled runs, one per skin, same target, cup, physical start method, machine readiness and no other skin tabs actively controlling the machine. Record values rather than assuming skin switching preserves them:

1. Decaid + skin versions and gateway mode.
2. GET workflow: complete hotWaterData (amount, temperature, flow, duration).
3. GET settings: both multipliers and stopHotWaterAtWeight.
4. Actual machine shotSettings stream: targetHotWaterVolume, targetHotWaterDuration, targetHotWaterTemp. Use the documented machine settings/readback path for flow as well; do not invent a GET endpoint for shotSettings (the reviewed REST spec only documents POST there).
5. Shared last-hot-water-volume and last-hot-water-temp values.
6. Machine snapshots from before start through the stop, including timestamps, state/substate, flow and volume where exposed.
7. Scale timeline and full Decaid log, including tare/connection events and any state-changing API request. Do not paste account secrets or unrelated logs.

Compare stop elapsed time against duration, physical volume accumulation against the volume limit, and whether settings change between skins. If no target-reached log and no external idle request appear, native stop/state reasons become the main investigation path. If the machine/scale connection drops or tare never settles, arming alone was insufficient.

## Recommended response, not yet implemented

- Keep the independent calibration fix; do not lower it further without evidence.
- Close the settings/shared-intent consistency gap and add actual machine settings readback, with bounded reconciliation and safeguards against competing clients or active-dispense writes.
- Capture the two runs before selecting a stopping-behaviour change. A machine-side cap is the leading candidate consistent with the missing prediction log, but remains unproven.
- Do not disable firmware backstops, inflate volume to an arbitrary number, or introduce a second competing skin-side weight stopper. Streamline’s reviewed code does not justify those changes.
