# GM-01 A1-2c-3 — common FA declarations

## Baseline / scope

Latest main `ea27ee4970234cdbb0d78374aa046b18d463fed8` (#540 merged), source tree matched the previous submitted retirement tree. Main CI [41753604642](https://github.com/shotaro-hue/baseball-manager/actions/runs/41753604642) completed successfully. Work is on `feat/gm01-a1-fa-declarations`.

This PR implements the next task in the accepted plan, not the entire later roadmap. Gate remains OFF; schemaVersion1 / DB version5, legacy behavior and old scout retirement policy remain unchanged. No live UI, CPU probability, Worker, overseas-club departure, posting/income or automatic annual rollover connection. Existing legacy FA functions are not plugged directly into annual state.

## Interface / authoritative data

`declare-fa {id,teamId,playerId,contractId,kind:'domestic-fa'|'overseas-fa'}` uses the existing world identity envelope, quote/reduce API and commit publication/adoption barrier. Only v2/offseason December1, expiring controlled employment with valid existing `getFaProgress` qualification is admitted. Intention and kind are explicit; nationality never chooses overseas FA automatically. Existing foreign/exempt market qualification semantics are retained.

- `engine.faDeclarations` holds source record/player, notice/effective dates, measured/estimated qualification, closing-year ranking, exercise proof and canonical market entry. Receipt and alumni retain matching evidence.
- `engine.faDeclarationContexts` holds one immutable closing roster/classification/rate snapshot per club/year, created atomically by its first declaration. Later declarations reuse it. Contract identities, owner, class and annual rates are reconstructed from the November30 ledger. For the current closing year classifications also match current owned players or immutable departure/retirement/FA/acquisition/personnel snapshots. Current released-listing metadata has lower priority than historical departure evidence.
- Rank A is positions1–3, B4–10, C11 onward among domestic controlled players, including farm. Foreign/development peers are excluded. A tied salary block crossing either boundary is refused; no ID tie-break or invented rank. Foreign qualified FA is exempt under existing market rules.
- `engine.faExerciseOrigins` is explicitly seeded only by the native new-game constructor, count0 as a game fact rather than real-player history. Owned origins link exact initial sign/contract IDs. Initial market origins retain their original listing snapshot after delisting/relisting/acquisition. Origins cannot be added/changed/erased on later same-game overwrites, attached to any legacy-opening player, or used to misrepresent an initially owned native player as an initial-market birth.
- Old v2 without origins and migration remain unknown. The first observed unknown exercise uses `legacy-conservative-max`; a proven prior declaration makes later exercise repeat while unknown total count stays null. Known native count increments by recorded declarations. `faYears` remains a UI offer-length setting.
- Natural expiry produces no ledger end. Current/past salary and guarantee rows are unchanged. Roster references, alumni, market, exercise proof and receipt are atomic; no refund or extraordinary income is added. Original renewal plans remain stored and are excluded from active funding through the validated departure projection.
- Formal/human pending renewals, accepted future employment and retirement reservations are refused without deleting promises. Existing acquisition/cash/personnel routes consume the generated entry, including original-club stays without compensation. Later acquisition/new season does not invalidate old declaration replay.

These are consistency/provenance checks against independently retained evidence and ledger/history extensions, not cryptographic protection against replacing every source/evidence copy in an entire save.

## Test evidence

Initial TDD RED: 41 cases, **25 failed / 16 existing refusal paths passed** because declare-fa was absent. Implementation normal paths then turned GREEN.

Final new tests: **49 engine + 7 actual persistence = 56**. Coverage includes active/farm/player and command ID0; domestic/overseas qualification thresholds and estimated service; A/B/C/exempt, same-rank ties/boundary ties, foreign/development exclusions, prior declaration/release rank stability; source ledger rate rather than displayed demand; native first/repeat and unknown conservative/repeat; real migration unknown guarantee; pending human/formal renewal, accepted future, retirement, dates and invalid overrides; natural expiry with unchanged liabilities/plans; original/cross-club acquisition, funded cash/personnel settlement; later spring joining/re-declaration and cold old-command replay; single/paired/context-inclusive proof tampering.

Actual fake-IDB/localStorage tests exercise compressed inline and padded external root bodies (rootBodyReference/readRootBody and actual size checked), failed publication retaining old roots/world, retry, fresh storage surface/cold load/replay, unknown-origin preservation and blocking fabricated origin insertion, two commits sharing one frozen ranking context and refusing later edits.

**Real data:** current `createInitialTeams()` produces 1,059 players with initial active-roster service0. There is no naturally FA-qualified player at bootstrap; the test verifies the actual stock refusal first. It then changes only one expiring, domestic controlled player's qualification days to1080, preserving the real roster, salaries, classification and terms, and verifies successful declaration/cold validation. This is an explicitly qualified scenario, not a claim that stock bootstrap players can declare immediately or that a multi-year production journey was tested.

**Migration fixture corrections:** five existing tests previously replaced a native factory ledger with real legacy-opening data. Their setup now also removes the native-game exercise origins: real migration does not emit native birth evidence. Their behavioral assertions/expected guarantee/payroll outcomes are unchanged.

**Existing market regression:** initially requiring the original initial-market listing to remain live rejected valid delisting/relisting scenarios (26 failures). Retained immutable birth snapshots instead; old acquisition/missing-listing invalidation behavior is preserved, while overwrite and legacy-source guards prevent a fabricated zero.

Final scoped run: **21 files / 882 passed**, zero failures, containing all56 new tests and826 existing departure/retirement/transaction/budget/market/compensation/renewal/migration/hook/save tests. Full suite/build/important browser E2E use the exact-HEAD CI, avoiding a redundant local full run.

## Independent review / reproduced corrections

Independent reviewer inspected base→`aed3047`, the current classification-priority change, actual producer and standalone cases. Independently ran53 targeted tests, actual1,059-player rejection/qualified acceptance, and native initial-market signing→first declaration→cross-club acquisition/cash→spring joining→overseas repeat declaration/cold replay. Observed small real-roster reduction ≈852ms, cold validation ≈192ms; these observations are not release/performance thresholds. Full suite/build/browser CI and the final correction patch were not independently certified by that reviewer.

Confirmed P2 findings, reproduced before correction:
1. Changing peer nationality in ranking plus declaration/receipt/history/listing could turn B into A while the real peer remained domestic. Added independent club/year contexts and current closing-year classification reconciliation. Reproduced both without and with coordinated context edits (RED); both now rejected.
2. An owned real migration player could be assigned a fabricated initial-market count0 and change unknown to first. Added a real-migration RED and rejected all native origins for legacy-opening players; native owned/market source confusion is also refused. Unknown overwrites already rejected added origins and retain that protection.

Author also reproduced/fixed a separate classification-source priority issue: after winter release, mutating a released listing's foreign flag changed another player's B rank to A. Historical departure metadata now wins over mutable listing data. Dedicated RED→GREEN retained.

No other confirmed P1/P2 from independent review; no deferred minor finding. All reproduced fixes and nearby normal cases are included in the final882 GREEN run.

## Delivery / remaining work

PR and exact final HEAD CI results are recorded in the PR description/conversation after completion, so recording CI does not change its own tested commit. End state remains unmerged for the user's decision.

Next tasks remain overseas departure/termination agreements, posting/retirement-game extraordinary income, then human operation integration. Task10 owns automatic year-end/spring/daily/Worker integration. Initial-player eligibility accumulation and policy calibration must be validated before eventual public activation; this PR grants no FA qualification or extra annual funding automatically.
