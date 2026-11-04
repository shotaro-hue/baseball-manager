# GM-01 A1-2c-3 FA declaration implementation plan

> Execute inline with superpowers:executing-plans and TDD; independent final review.

**Goal:** Turn an explicit domestic/overseas FA intention into a validated, persistent NPB market entry using the common annual command/save path.
**Architecture:** `declare-fa {id,teamId,playerId,contractId,kind}` is v2/offseason December 1 only, for expiring controlled employment. Optional engine FA declaration records join the validated departure projection; independent club/year contexts freeze ranking provenance. Existing market/acquisition/compensation/receipt and save barrier APIs remain authoritative.
**Spec:** approved 2026-10-30 A1 integration design §5.1/5.2 and the accepted next-task plan in the conversation.
**Tech stack:** JavaScript / Vitest / existing annual world and IndexedDB generations.

## Constraints and decisions
- Base latest main ea27ee4970234cdbb0d78374aa046b18d463fed8 (#540 merged). Dedicated feature branch; gate OFF, schema/DB unchanged, legacy/scout policy unchanged, no merge/main push.
- Only this next PR; overseas-club departure, posting/income, UI, CPU probability, Worker and automatic rollover remain later tasks.
- Qualification uses existing getFaProgress; preserve measured/estimated provenance. kind is explicit, never inferred from nationality. Foreign FA eligibility/exempt behavior stays consistent with existing validateMarketPlayer.
- Rank uses closing-year November 30 ledger employment and contract annual rates, including farm controlled players, excluding foreign/development players. Freeze the classification roster at declaration. A=positions1–3/B=4–10/C=11 onward; a tied block crossing either boundary is refused, not ID-sorted into a rank. Source amounts/ownership/classes are reconstructed from the ledger at inspection, not from mutable UI salaries.
- Native new-game origins explicitly record game exercise count0 for initial owned/market players; retain historical origin evidence. Independent contractEconomy.faExerciseBirth creation metadata fixes the birth season and initial market membership; initial owned membership comes from retained initial-sign ledger records. Origins must exactly cover this creation source; absent old-v2 creation metadata forbids origin insertion. Old v2 and migrated players remain unknown. Before the first recorded declaration, unknown uses legacy-conservative-max; any proven prior declaration makes later exercises repeat, even if total lifetime count is unknown. faYears remains a UI contract-length selection.
- Pending formal/human renewals, accepted future employment, retirement reservation, invalid dates/owner/source/qualification and duplicate declarations are refused without deleting promises. Unoffered renewal plans remain stored but cease funding this departure.
- Natural expiry adds no end and changes no existing payroll/guarantee. Market/history/declaration/exercise proof/receipt update atomically. Replays survive later acquisition and later seasons. Listings are validated until accepted; accepted proposal metadata remains historical authority afterwards.
- Keep same-year declarations in the common departure projection so winter ownership/floors reconcile. Preserve old v1/v2 records and prevent erasing origin/declaration evidence on overwrite.

## Review focus
- Salary ranking after prior declarations/releases/retirements, later transfers/raises, tied rank boundaries and classification evidence.
- Exact/native first, repeat after unknown, unknown conservative basis; no misuse of faYears.
- Source/receipt/listing/alumni tampering in either direction, including paired deletion and later acquisition/replay.
- Pending decisions, future promises and retirement conflicts; no salary/guarantee changes.
- Real createInitialTeams positive and negative examples; save failure/IDB root paths/cold reload.

## Task 1: common declaration and immutable proof
- [x] Add normal/rejection tests first; run RED for missing declare-fa.
- [x] Implement a focused annualFaDeclarations module, command routing, validated departure projection, optional world persistence and explicit native origin seeding.
- [x] GREEN target tests including real bootstrap, qualification/rank/basis/conflicts, acquisition/cash/personnel handoff and later replay.

## Task 2: persistence, regression and delivery
- [x] Actual commit/save/load with inline/external roots, failure/retry/replay and invalid evidence refusal; old modes remain valid.
- [x] Scoped departure/retirement/market/compensation/renewal/migration/save regressions; reuse exact HEAD CI for full suite/build/browser checks.
- [ ] Independent review; reproduce/fix P1/P2. Record evidence in docs and PR, create new PR, confirm latest HEAD CI; stop unmerged.

## Execution record
- Initial RED25/41; final new55 engine +8 save cases. Final scoped27 files/1003 distinct tests passed. Main CI completed success.
- Independent review2 P2 plus author classification-source-priority repro fixed with RED/GREEN. No new rule inferring unknown history or nationality.
- Added immutable club/year faDeclarationContexts; current source nationality is reconciled, origins cannot attach to legacy-opening players or confuse native owned/market birth. See validation record.
- Real bootstrap starts service0: normal stock refusal and a clearly labeled qualification-only scenario are separate. Seven migration fixture setups drop native birth origins when substituting actual migration source; assertions unchanged.

Additional fixture audit: economyMigrationProjection and useGameState.hydration had the same native-envelope/legacy-ledger setup mismatch (5 RED /12 passing). Removed only their native fixture origins before projection, preserving every behavioral assertion. Both files now17/17 GREEN; previous21-file882 GREEN plus these17 give23 files/899 distinct scoped passes. Production source is unchanged from the882 run.

Full CI on e88b93ab found two additional historical-ledger fixture builders (pendingDevelopmentWorld and mixedWorld): they replace a new-game ledger with real prior transaction history, leaving native initial-sign origins for the discarded ledger. Locally reproduced30 failures/67 passes across4 files. Dropped only the incompatible native fixture origins; all97/97 now GREEN with assertions unchanged. Together with the preceding899, final scoped verification is27 files/996 distinct passes. No production source change; rerun full suite/build/browser CI on the new HEAD.

Final independent review found a remaining variant of the unknown→first P2 in cold old-v2 market acquisitions, without any legacy-opening record. Added5 RED cases and an independent native creation manifest to close origin-only insertion, incorrect birth dates and partial origin removal. Creation metadata is projected transiently and never stored again under engine; overwrite preserves both source and rows. Added cold source-removal and coordinated overwrite-deletion cases: new55 engine +8 save cases. Reviewer independently verified both original findings resolved,17 focused passes and the native-market first→cash/other-club acquisition→spring→repeat/cold replay lifecycle; no new P1/P2. Two prior-year fixture sources also discard incompatible native birth metadata, keeping payroll/guarantee assertions unchanged (11 setups across9 existing fixture files in total). The broad scoped run exposed a suspended-render hook timeout with3 cascading failures; its isolated18 tests passed unchanged. Final regression details are in the validation record and final PR comment.
