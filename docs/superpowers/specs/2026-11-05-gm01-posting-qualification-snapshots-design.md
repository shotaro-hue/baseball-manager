# Posting qualification facts and saved snapshots

Base main `9ea1468f1f45e5dda97c7db16e16d5d1bb00715e` (#547 merged).
The user authorized the next PR after the final review. This implements the
explicit-facts producer and persistence boundary; it does not choose any of the
unresolved recognition, price, acceptance, minor-pool or signing-clock policies.

## Intent and alternatives

An approved application currently has no saved, identity-bound qualification
evidence. Re-reading mutable data later could change its assessment. Add a pure
producer for explicitly attested facts and a native command that freezes a
snapshot against an approved application. Reuse #547's evidence and assessor,
the opening lookup, native transaction receipts and acknowledged save pipeline.

Alternatives: infer service from histories/serviceYears (incorrect); build a
complete recognition database and automatic annual rules now (requires undecided
policy); persist explicit dated facts now (selected prerequisite). No new database
or parallel player biography owner is needed. Implementation details below are
engineering choices within the requested prerequisite, not approved game policy.

## Facts producer

`buildPostingQualificationSnapshot(facts, assessmentDate)` accepts exactly the
#547 evidence fields. `professionalSeasons`, when present, additionally requires
`ruleId` (nonblank versioned recognition-rule reference); every season row also
requires `confirmedDate` (strict civil date). A confirmation means the supplied
source/producer attests that season was already recognized by that date; it need
not be the exact legal day eligibility first accrued. Never invent an earlier
confirmation date from a year label or a source retrieval timestamp.

Require `season <= confirmedDate.year`, `confirmedDate <= asOfDate <=
assessmentDate`, and #547's strict dates/provenance/identity/year/duplicate checks.
Pending or future confirmations cannot enter the snapshot. Same-year completed
facts are allowed. Reject sparse arrays and unknown fields. Sort and deep-clone
all facts. Derive #547 evidence by removing producer-only rule/date metadata;
return `{facts, assessment}` using the unchanged ruleVersion1 assessor. This is a
point-in-time assessment, not a claim that assessmentDate is a future signing date.
The market must assess again at its chosen signing date using preserved facts.

`createPostingQualificationProducer(master?) -> (player, professionalSeasons=null)`
uses the existing opening lookup for birth/realPlayerId and combines it with
explicit certified seasons, returning detached facts. Current master data still
supplies no pro seasons. Do not modify the master or manufacture recognition for
real players. Unmatched valid realPlayerId stays the sourcePlayerId; only generated
players have null source identity. Fictional/unmatched players keep unknown birth facts;
the pure producer accepts an explicitly supplied fictional birth fact without
generating it or deriving it from annual gameAge.

## Native snapshot command and ownership

`{id,type:'record-posting-qualification',requestId,facts}` goes through existing
quote/reduce/commit. Require an approved current-season application, matching
playerId and realPlayerId (or null for a generated player), source employment and
current world clock. The command is accepted only on the existing offseason
12-01 boundary. It grants no market permission or exemption from other checks.

Append `engine.postingQualifications` only when used. Each record contains
version1, transaction ID, request ID, season/team/player/sourceContract IDs,
saveId/epoch sourceKey, recordedDate, normalized facts and derived assessment.
The signed command and transaction receipt must reconstruct exactly that record.
One record per application freezes this prerequisite's observation; same command
replays, changed command under the same ID or a second snapshot ID rejects.
Corrections/replacement semantics before market activation need explicit later
design; no UI creates these records yet.

Restore validates identity, approved application, source player, canonical
command, dates, facts, assessment and paired receipt. Missing optional collection
means no recorded snapshot, not qualification or zero seasons. Preserve published
rows append-only, even if someone deletes/rewrites both a row and its receipt.
Extend `fromAnnualState`'s existing whitelist; do not add a second save pipeline.
Approval and snapshot recording leave teams, ledger, guarantees, budgets,
income, RNG and existing application events unchanged.

## Limits and follow-up decisions

Source/rule IDs are auditable references, not authentication. The source owner
still certifies recognition and completeness. Existing NPB history/profile data
does not establish MLB-recognized seasons. NPB/foreign/development rules,
fictional birth generation and annual automatic certification are deliberately
unselected. A later year-close producer can supply confirmed facts to this API
only after those rules and its dated finalization event are agreed.

Public gate OFF; schemaVersion1/DB5; old saves and legacy behavior unchanged.
No market, offers, acceptance/draws, departures, fee-policy changes, UI, CPU,
Worker activation or automatic rollover. Task7/A1 remains unfinished.

## Acceptance

RED/GREEN for January + not-yet-confirmed current season, valid December
same-year season, 5/6, missing/partial/complete-zero/stale, rule/source/date errors,
sparse/duplicate years, birthday and identity mismatches, detached JSON snapshots.
Use real generated opening players for real unknown/restricted cases, never a
fabricated real six-season certificate. Test rejected/pending applications,
replay, duplicate IDs, source change, direct-completion rejection and no financial
effects. Actual inline/external save, cold restart, failed publication/retry,
adoption recovery, paired history deletion/rewrite and stale callbacks must pass.
Independent exact-diff review, relevant regressions, build and exact-HEAD CI are
required before readiness; no merge or auto-merge.
