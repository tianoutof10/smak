# Tare protection during a shot

## Confirmed gap

Bestpresso exposed Decaid's `blockTareDuringShot` setting, but its scale card and
tare handler did not enforce it locally. The handler sent `PUT /api/v1/scale/tare`
and only displayed an error if Decaid rejected it.

Decaid's documented server policy explicitly exempts full gateway mode and depends
on its own tracked shot state in other modes. This is a confirmed bypass path, not
confirmation of the reporter's gateway mode or input method.

## Local fix

- Track shot activity directly from machine snapshots, independently of Decaid's
  shot sequencer. Protect preparation, extraction, skipStep and espresso cleanup.
- Disable the scale-card tare control and independently guard the command handler.
- Consume the saved setting immediately; refresh it through the existing settings
  read and before an otherwise permitted command. No additional polling timer.
- Recheck current state after the settings request, including scale disconnects.
- Retain protection on lost telemetry until machine state is known again. Unknown
  settings do not permit tare during a possible active shot.
- Cancel a delayed automatic preparation tare if preparation has already ended.
- Allow tare at idle and retain the explicit setting-disabled opt-out.

Decaid's internal shot-start tare is unchanged. Physical tare buttons on scales
are outside this app-side protection; the settings hint already states this.

## Verification

- 578 unit/regression tests passed, including eight new tare-safety tests.
- Build passed; lint has only the existing five review-page warnings.
- Browser test mounted the real brewing hook and scale card with mocked REST and
  WebSocket traffic. A permissive full-gateway server accepted every tare request,
  while Bestpresso prevented requests throughout protected shot phases. Verified
  idle recovery, the setting-disabled opt-out and settings-read failure.
- No real machine or scale commands were issued. Reporter hardware validation is
  still needed, especially to distinguish on-screen from physical-button tare.
