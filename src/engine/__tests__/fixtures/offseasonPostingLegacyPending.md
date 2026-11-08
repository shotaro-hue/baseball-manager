# Frozen phase before retirement ordering guard

`offseasonPostingLegacyPending.json.gz` was captured from `7548de37` before adding
the fresh-phase retirement admission guard. The posting phase implementation at
that commit is unchanged from merged #556 (`cpu-posting-v2`).

Source: `offseasonPostingWorld()` (real reserve-retirement commands, active CPU
and human farm reservations, explicit winter fixture), then
`reducePostingGenerationRequest(world, postingGenerationRequest(world))`.

The published phase is valid historical evidence even though reservations are
still pending. Load and standalone phase replay must preserve it byte-for-byte;
the new composite entry must report the order conflict. Fresh UI/native phases
must no longer create that sequence. Do not regenerate this fixture with a
newer policy to make a compatibility failure pass.
