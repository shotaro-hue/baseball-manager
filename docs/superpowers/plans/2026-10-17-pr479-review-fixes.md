# PR #479 review fixes and long-run validation

Goal: preserve real players and save compatibility, handle malformed initial rosters,
and complete fixed-seed before/after evidence without claiming partial runs passed.
Authority: user review-fix instructions dated 2026-10-17; roster-capacity-design.md.
Execution: inline, existing PR #479 only; no merge, main push or balance changes.

## Tasks
1. Freeze baseline 122d02b and after source in separate checkouts. Run existing
   real-hook harness for seeds 20261015/16/17, ten years each, one worker per
   variant. Keep normal IndexedDB rows and application history. Record source
   hashes, atomic per-seed JSON and final assertion completion; aggregate only
   completed runs. Preserve postseason bypass limitation.
2. Add failing initialRoster tests for catcher/field/pitcher shortages, 66–70
   valid inputs, impossible supplementation within 70, 71 inputs, both development
   flags, real player identity/history and sync/async equivalence. Reserve catcher
   and field minimum slots before allocating 32/33 targets. Permit up to 70 only
   to meet minimum coverage; fail explicitly if impossible. Run targeted Vitest
   and existing 100-seed real/fallback initialization checks.
3. Analyze annual counts, pick/stop reasons, rookie opportunities, FA reservations,
   payroll/budget, departures/conversions and save continuity. Fix only reproduced
   regressions; leave balance constants unchanged absent evidence. Update SPEC,
   CHANGELOG, implementation record and ROADMAP with actual limitations.
4. Review final diff, push to feat/roster-planning-65 after rechecking remote head,
   and verify exact updated commit Build/all Unit/core E2E CI. No new PR or merge.

## Review focus
- Above-65 supplementation cannot alter original records or exceed 70.
- Development players cannot satisfy controlled catcher/field counts.
- Ordinary initialization and RNG consumption stay identical.
- A ten-year JSON without final assertions cannot be accepted as passed.
- Application files cannot change during a long-run variant.

## Progress and decisions
- main 122d02b, PR head 75c38c6, CI #421 all 8 jobs successful.
- Baseline comparison started from isolated 122d02b; existing fake-IDB pruning kept.
- User already authorized implementation and PR updates; no repeated plan approval.
- Ruling: first-team archive expectations must follow recorded participation, while farm-only seasons remain in farmArchives. The failed before/20261017 2032 row had zero first-team activity and 186 farm BF; compare every continuing player's actual eligible years instead of fabricating a missing first-team row. Missing eligible years and duplicate/fabricated rows still fail.
- Trade E2E fixture now waits for the manual-save notification to finish before testing another transient notification; all original rejection and atomicity assertions remain. Target Chromium test passed three runs with retries0.
