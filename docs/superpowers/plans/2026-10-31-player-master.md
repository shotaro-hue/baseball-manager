# DATA-PLAYER-2026 implementation plan

> **For agentic workers:** Use superpowers:executing-plans. User authorized implementation without further design approval.

**Goal:** Reconcile the opening-day population and safely connect evidence-aware, pre-opening player data to new games.
**Architecture:** Keep the legacy source untouched except removing unsafe heuristics. Normalize facts/provenance separately; project ratings at new-game creation. Stage updates and reject invalid/incomplete/unlicensed release inputs. Never transform loaded saves.
**Tech Stack:** JavaScript, Vitest, Python/lxml for local source examination.
**Spec:** `docs/implementation/player-master-2026-reconciliation.md` and user's DATA-PLAYER-2026 A–E instruction.

## Global Constraints
- Existing PR #522 / fix/player-master-audit-2026-10 only; no merge, main push or new PR.
- Population date 2026-03-27; ratings use completed seasons <=2025.
- No fabricated players to claim coverage. No bulk redistribution without adequate source rights.
- Existing saves must not be rewritten; annual salary uses 万円; preserve contract end years.
- User requires focused local tests and exact-head CI, without redundant full-suite runs.

## Review Focus
- Transfers/retirements and development conversions before/after the date must change the correct population.
- Missing exposure, zero innings, split-year rows, future stats must not inflate ratings or fabricate history.
- Development players must stay out of active rosters; complete input must not silently create fictional depth.
- Unknown salary, eligibility and service time must not become asserted facts; old saves remain untouched.
- Import validation and strict audit must fail on unverified sources, extra players, duplicate IDs and >70 controlled.

### Task 1: Source reconciliation and safe staging
Files: scripts/player-master/*, scripts/audit-player-master.*, scripts/fetch-spaia.cjs, docs/implementation/player-master-2026-reconciliation.md.
Interfaces: normalized source records use stable playerId, teamId, registration, asOf, source references, quality. Reference uses all 12 teams and per-team registration evidence.
- [ ] Collect 24 NPB registration pages locally and apply dated removals; retain source hashes and report population/differences. Do not commit raw restricted content.
- [ ] Add failing tests for dates, duplicate IDs, missing team evidence, extras and unsafe update paths.
- [ ] Implement reconciliation/audit and an output-only update path; require explicit rights/evidence for release data.
- [ ] Run focused tests and record remaining external blockers.

### Task 2: Evidence-aware projection
Files: src/data/playerMaster2026.js, src/engine/realPlayerProjection.js, src/engine/realplayer.js, associated tests.
Interfaces: prepareRealPlayer(input,kind) returns age, positions, stats, history, quality, registration, financial and service fields. Exact innings are outs; game IP remains outs/3.
- [ ] Tests: future stats ignored; small sample shrinks; zeros not missing; exact thirds; both hands; documented unknown salary fallback; no service-day inference; explicit eligibility and positions honored.
- [ ] Implement using <=2025 history, sample-size shrinkage and explicit fallback metadata. Preserve actual past observations separately from ratings.
- [ ] Verify existing conversion/career/contract tests and new regressions.

### Task 3: New-game wiring, complete-roster mode and compatibility
Files: src/engine/initialRoster.js, bootstrapTeams.js, realplayer.js, tests.
Interfaces: verified complete roster input disables fictional supplementation, while legacy incomplete input retains safe minimum coverage. Development input belongs in farm.
- [ ] Tests: all supplied player IDs retained once; no development active; exact controlled cap; no fiction for complete viable rosters; sync/async parity and source immutability.
- [ ] Connect normalized baseline only on new-game creation. Leave save loading and migration code unchanged.
- [ ] Verify finance, progression, saving and large-roster payload size using synthetic population; label synthetic evidence explicitly.

### Task 4: Review, CI and report
- [ ] Independently review branch under requesting-code-review; fix material findings with regressions.
- [ ] Commit/push existing branch, check exact-head CI build/unit/core E2E.
- [ ] Report actual published counts, official candidate counts, changes, blockers, tests and merge recommendation. Never call full reconstruction complete without all acceptance gates.
