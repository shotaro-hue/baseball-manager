# Posting Qualification Snapshot Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with TDD and one independent whole-branch review.

**Goal:** Produce dated explicit recognition evidence and persist one immutable qualification snapshot for an approved posting application.
**Architecture:** Pure facts builder plus opening-data adapter; native annual command/inspection; existing world/save history extension.
**Tech Stack:** JavaScript, Vitest, existing civil dates and acknowledged persistence.
**Spec:** [design](../specs/2026-11-05-gm01-posting-qualification-snapshots-design.md).

## Global Constraints

- Public gate OFF; schemaVersion1/DB5; old saves and legacy behavior unchanged.
- No market policy, recognition inference, automatic annual/Worker integration.
- No real-player recognition/birthday data fabrication or new data publication.
- No merge, auto-merge or main push.

## Review Focus

- January facts cannot consume a season confirmed only later that year.
- Fixed runtime/source IDs and approved source employment must agree.
- Missing, incomplete, stale and complete-zero evidence stay distinct after JSON.
- Paired record/receipt deletion or rewrite cannot evade published history guards.
- Failed publication/restart reuses exactly the same input and assessment.

### Task 1: Explicit dated producer

Files: create `src/engine/postingQualificationSnapshot.js`, its engine test;
extend `src/data/postingQualificationFacts.js` and its existing test.
Interfaces: `buildPostingQualificationSnapshot(facts,assessmentDate) -> {facts,assessment}`;
`createPostingQualificationProducer(master?) -> (player,professionalSeasons=null) -> facts`.
- [x] Add failing date/coverage/provenance/JSON/real-opening adapter tests; observe RED.
- [x] Implement strict producer using existing normalizer and assessor; confirm GREEN.

### Task 2: Native record and persistence

Files: create `src/engine/annualPostingQualifications.js` and engine tests;
modify `annualTransactions.js`, `contractEconomy.js`, `economyPersistence.js`;
create `tests/posting-qualification-commit.test.js`.
Interfaces: normalize/inspect/create for `record-posting-qualification`;
optional `engine.postingQualifications` with paired native receipt.
- [x] RED for approved-only binding, ID mismatches, replay/duplicate/forged snapshots,
  unchanged employment/money, inline/external cold load, failed save/retry,
  adoption recovery and paired history modification.
- [x] Add command dispatch, inspection, world whitelist and append-only preservation.
- [x] GREEN, then relevant existing application/income/commit/master regressions and build.

### Task 3: Review and submission

- [x] Update SPEC/ROADMAP/integration plan and scoped validation record.
- [ ] Commit and request independent review of base..HEAD; reproduce findings before fixes.
- [ ] Push feature branch; create draft PR; verify exact-HEAD required CI; mark ready.
- [ ] Report remaining source/policy limits; do not merge.

## Execution ledger

- Latest main 9ea1468; no open PRs. Clean dedicated branch in the session's task clone;
  reuse installed dependencies and existing same-tree tests rather than another checkout.
- Ruling: only explicit attested facts are produced in this PR. Automatic league,
  development and generated-birthday rules remain pending user policy selection.
- Ruling: producer confirmation dates record when recognition is attested, not an
  invented official eligibility date. Existing #547 input/ruleVersion stays unchanged.
- Builder check: preserve unmatched realPlayerId with unknown birth facts; do not
  reread the live master at restore to authenticate caller-supplied birthdays.
- Baseline 73 passed; producer RED 24 failed; command/save RED observed. Initial
  focused GREEN 63 passed; related regression 21 files / 478 passed; build passed
  (existing mixed-import/large-chunk warnings). One additional actual opening
  roster → native request/approval → external commit → cold load/replay test
  passed in the final 8-case commit suite, including changed display/age fields.
