# New game initialization implementation plan

Goal: expose pending/success/failure, yield without changing generation order, remove measured duplicate evaluations, and wait for semantic completion in E2E.
Base: main fb1fb59053222f9ffd8582932b11d27315d91ae0; spec: user requirements 2026-10-09.
Architecture: transient initialization state in useGameState drives TitleScreen; bootstrapTeams shares a single-team builder between synchronous and sequential async generation. Evaluation reuse remains local to each unchanged input calculation. Existing IndexedDB persistence and save formats stay intact.

## Constraints / review focus
- Preserve PR420 and all existing main changes, random/ID order, evaluation formulas, rosters and history persistence.
- Failed history persistence must not publish partial teams or enter home; retry must contain only the final attempt's records.
- Ref guards must block stale/repeated actions before React commits, including load and deletion.
- Failures in generation, persistence and final preparation must release pending state with an actionable error.
- Reuse must expire at calculation boundaries, including player/team changes and DH modes.
- E2E completion is finite, fails promptly on errors, and checks the selected team plus home controls.

## Task 1: reproduce / measure
- [ ] Restore latest GitHub tree exactly; read AGENTS, CONTRIBUTING, design, CI, existing startup/history tests.
- [ ] Run npm ci and baseline CPU/browser measurements (multiple fixed seeds; normal and artificial slowdown), capture profile/long tasks and phase durations.
- [ ] Record duplicate evaluation CPU evidence before optimizing.

## Task 2: state and scheduling
Files: src/hooks/useGameState.js, src/components/TitleScreen.jsx, src/App.jsx, src/engine/bootstrapTeams.js, new browser-yield helper, hook/UI/bootstrap tests.
Interfaces: createInitialTeamsAsync(): Promise<Team[]>; newGameInitializationStatus: idle|initializing|ready|error; UI consumes status and error.
- [ ] Write failing tests for pending-before-work, duplicate start/load, failure and retry, no partial publication, and async vs synchronous full result equality with fixed random/IDs.
- [ ] Verify RED, implement minimal state/ref guards and yield before computation and between teams, verify GREEN.
- [ ] Keep generated data local until history save and final preparation succeed; retain existing history initialization.

## Task 3: evaluation work
Files: src/engine/rosterAutomation.js; equivalence and evaluation call-count tests.
- [ ] Write RED tests pinning unchanged input evaluation once per player in sorting/order/recommendation calculations; compare full outputs against baseline across multiple seeds and policies.
- [ ] Cache within buildPositionAssignments, orderAssignedBatters and buildRosterRecs only; do not reuse across team updates or options changes.
- [ ] Verify GREEN plus unchanged evaluation outputs/rosters and repeat phase/long-task measurements.

## Task 4: E2E and completion
Files: e2e/helpers/progression.js, all independent new-game starts, e2e/initialization.spec.js, package.json smoke list, docs/validation/new-game-initialization.md.
- [ ] Write RED browser checks for visible pending/disabled actions under slowdown and forced IndexedDB failure/retry with complete history/rosters/schedule; normal 5 games/save/reload.
- [ ] Wait for explicit ready/error condition with finite initialization-specific budget derived from measurements; then verify team and usable home controls. No fixed sleeps/global timeout changes/retries/skip.
- [ ] npm test, build, smoke, full E2E workers=1/retries=0, physics CI validation; retain logs/traces and distinct outcomes.
- [ ] Review changes, create independent PR base main, inspect latest-head CI, report residual limits and historical 36/1 separately.
