# Posting Qualification Evidence Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with TDD, then independent whole-branch review.

**Goal:** Assess the documented age/recognized-season exemption conditions without inventing missing facts.
**Architecture:** Pure engine evidence normalizer/assessor; separate read-only
opening data lookup; no existing command or storage changes.
**Tech Stack:** JavaScript, Vitest, existing civil calendar and bundled master.
**Spec:** [design](../specs/2026-11-04-gm01-posting-qualification-design.md).

## Global constraints

- Public gate OFF, schemaVersion1/DB5, legacy unchanged.
- No new price, acceptance probability, random draw or automatic market grant.
- No age/serviceYears/FA/quota/history inference for qualification.
- Null/partial/stale are distinct from complete zero; no new persistent owner.

## Review focus

- Missing or stale pro evidence cannot establish an adult exemption or restriction.
- Duplicate team/league years cannot inflate recognized-season count.
- Birthday calculations cannot use annual gameAge or machine timezone.
- Runtime source linkage cannot use mutable names or silently accept mismatched IDs.
- Snapshot/input mutation cannot alter future lookup or repeat assessment results.

### Task 1: Pure evidence and assessment

Create `src/engine/postingQualification.js` and
`src/engine/__tests__/postingQualification.test.js`.
Interfaces: `normalizePostingQualificationEvidence(input)`;
`assessPostingBonusPoolExemption(evidence,signingDate)` from spec.
- [x] Write boundary/unknown/completeness/provenance/duplicate/JSON tests.
- [x] Observe missing implementation RED; implement smallest strict assessor.
- [x] Run new tests, confirm GREEN without changing expected rule conditions.

### Task 2: Real source lookup

Create `src/data/postingQualificationFacts.js` and
`src/data/postingQualificationFacts.test.js`.
Interface: `createOpeningPostingQualificationLookup(master?) -> lookup(player)`.
Consumes Task1 normalizer, exact NPB profile IDs and realPlayerId from bootstrap.
- [x] Write real generated restricted/unknown pair and identity/mutation/source tests.
- [x] Observe missing lookup RED; implement indexed, detached fact snapshots.
- [x] Run source/bootstrap/application/posting/save regressions and build.

### Task 3: Review and submission

- [ ] Record audit and scope in SPEC/ROADMAP/integration plan/validation.
- [ ] Review exact SHA independently, reproduce and fix confirmed findings by TDD.
- [ ] Push dedicated branch, submit draft PR, verify exact HEAD CI, mark ready.
- [ ] Report source limits and preserve market/public gates; no merge.

## Execution ledger

- Base #546 main 3f6a665. Baseline: 3 files / 70 passed.
- Initial RED: all 48 new tests failed on missing functions. GREEN: 36 assessor
  tests and 12 source lookup tests passed with literal boundary expectations.
- Related regression: 12 files / 183 passed. Build passed with existing
  mixed-import/chunk-size warnings. No runtime/save/command integration changes.
- Independent review found one P2: sparse array holes skipped by map/some could
  be counted as seasons or pass as missing source IDs. Four reproductions were
  RED; materializing every element before validation fixed them. Final scoped
  GREEN: 12 files / 187 passed, including 52 new tests (40 assessor / 12 lookup).
- Initial HEAD CI #677 was cancelled for the reviewed fix. Final HEAD/CI status
  is recorded in the PR; no expectations, timeout or permanent skips changed.
- Native inline implementation. The current stage does not choose market policy;
  recognized seasons remain supplied documented evidence, not inferred data.
