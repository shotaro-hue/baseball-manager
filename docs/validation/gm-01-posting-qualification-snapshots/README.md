# Posting qualification producer and snapshot validation

Base `9ea1468f1f45e5dda97c7db16e16d5d1bb00715e` (#547 merged).
[Design](../../superpowers/specs/2026-11-05-gm01-posting-qualification-snapshots-design.md)
and [plan](../../superpowers/plans/2026-11-05-gm01-posting-qualification-snapshots.md).

## Scope and source audit

The #547 pure assessor trusts a collection of already-recognized facts. A January
snapshot listing the current year cannot establish its completion from a year
label. The new producer requires a documented confirmation date per supplied
season and rejects confirmations after the collection's asOfDate. This retains
valid current-year December facts without changing #547's evidence contract.
Confirmation is an attestation date, not a guessed official recognition date.

The existing 1059-player master still has no recognized-season dataset. The
opening producer reuses source-linked birth facts and retains missing seasons;
an unmatched real ID remains identified with unknown birthday. No performance,
serviceYears, foreign flag, entry year or annual age supplies missing facts.
No new real-player data was imported or published. Positive six-season fixtures
are explicitly synthetic. Actual generated real players exercise both restricted
and unknown with null professional-season evidence, through native commands.

The signed native command freezes one snapshot for an approved request and
binds runtime/source player, source contract, season/team, save/epoch and date.
Existing world adapter, history extension, acknowledged save and recovery own
persistence. Neither approval nor snapshot causes a departure, fee or budget
change; the old direct completion bypass remains blocked for new applications.

## Executed checks

- Baseline: existing assessor/lookup/application commit, 3 files / 73 passed.
- Producer RED: 24 failed / 12 existing passed (missing new functions). GREEN:
  36 passed. A further RED exposed unmatched source ID loss; producer preserves
  the valid ID without inventing a birthday.
- Native RED: new successful record cases rejected as unsupported commands.
  Save RED: all 7 cases rejected at command preparation. Implemented command,
  receipt inspection, adapter whitelist and published-history retention.
- Initial save test revealed the existing cold-load career-summary expansion;
  compare pre/post persisted rosters through the same real load boundary. No
  production save normalization or expectations about financial effects changed.
- Scoped GREEN: 4 files / 63 passed. Includes January/future confirmation,
  December same-year facts, rule/source/date errors, missing/partial/complete-zero/
  stale, sorted detached JSON, exact birthdays, approved/source-ID checks,
  paired evidence corruption, deletion/rewrite of both row and receipt, and actual
  generated opening rosters. Both inline and external bodies pass real commit,
  cold load, failure/rebuild/retry, interrupted adoption recovery and stale session.
- Related regression: 21 files / 478 passed. Build passed with existing
  mixed-import/large-chunk warnings. The commit suite then passed 8 cases with an
  additional real generated opening club → request/approval → snapshot → external
  commit → cold load → replay journey. Its actual adult source keeps the documented
  birthday and unknown seasons even after name/gameAge/serviceYears/quota changes.

Related regression/build, independent review, submitted SHA and exact-HEAD CI
are recorded in the PR. No CI/test weakening, skips or timeout changes.

## Follow-up constraints

- Rule/source references do not authenticate recognition or completeness.
  NPB/overseas/development rules, fictional birthday generation and automatic
  annual certification require separate policy decisions. The API is ready for
  explicit finalization facts; no actual year-close/Worker producer is connected.
- This prerequisite freezes one observation per application. Replacement or
  correction semantics must be designed before enabling user-facing workflows.
- The assessment uses recordedDate. It does not choose an MLB signing date;
  future market must assess preserved facts at its own explicit signing date.
- Source facts and saved assessment must agree; no live-master reread occurs at
  restore. The immutable master snapshot does not authenticate caller attestation.
- Prices, acceptance, major/minor capacity, market outcomes, UI, CPU, annual
  Worker and long-play economy remain unimplemented. No public activation or
  real-device qualification journey was performed. Task7/A1 remains unfinished.

Public gate OFF, schemaVersion1/DB5, existing saves and legacy unchanged.
