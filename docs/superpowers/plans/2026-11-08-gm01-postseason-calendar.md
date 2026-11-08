# GM-01 Postseason Calendar Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; implement in this session, then request one independent whole-branch review.

**Goal:** 実際の最終公式戦日からCS・日本シリーズの日付を生成し保存・再開と閉幕日照合へ接続する。
**Architecture:** 日付policyを純粋moduleに集約し、既存playoff遷移と通常入口へ接続する。旧未記録履歴は変更しない。
**Tech Stack:** JavaScript, React, Vitest, Playwright.
**Spec:** [設計](../specs/2026-11-08-gm01-postseason-calendar-design.md)

## Global Constraints

- 公開OFF/schema1/DB5、既存年度時計/予算/保存防御を維持。
- UI・Worker・海外市場・年度全体は変更しない。
- テスト・CIのskip/timeout/retry緩和禁止。

## Review Focus

- All-Star配列末尾を閉幕日と誤認しない（実scheduleで検証）。
- 両リーグ処理順/早期決着で日程を引き直さない（途中再開テスト）。
- 旧未記録に新規日付を付けない（旧履歴比較）。
- 保存済みdate/resultと元scheduleの矛盾を拒否（改変例）。
- 追加戦と年/12月境界を切り詰めない（境界例）。

### Task 1: Dated playoff and closing selector

Files: `src/engine/postseasonCalendar.js`, `src/engine/playoff.js`, `src/engine/__tests__/postseasonCalendar.test.js`.
Interfaces: `initPlayoff(teams,{year,schedule})` keeps optional schedule for legacy callers; `nextPlayoffFixture` includes date for dated series; `postseasonClosingDate(playoff,{year,schedule})` returns date or null after validation.

- [x] Add real generated schedule, early finish/resume, legacy, corruption and boundary tests; observe RED.
- [x] Implement calendar v1, propagate dates, validate dated histories and completed bracket.
- [x] Run focused playoff/calendar/calendar-economy tests, observe GREEN.

### Task 2: Existing producer/save path and verification

Files: `src/hooks/useSeasonFlow.js`, hook regression tests, `src/App.jsx`, `src/hooks/useGameState.js`, `src/engine/saveload.js`, `e2e/progression.smoke.spec.js`, validation record, ROADMAP.

- [x] Assert date production through real final-game entry and save/reload E2E before connecting hook.
- [x] Pass real schedule at fresh entry and validate dated resume against schedule; preserve undated history.
- [x] Review corrections: retain 14-game JS capacity; validate raw source at save/load/hydration boundaries before legacy schedule fallback, retain title retry/backup recovery and legacy fallback.
- [ ] Run relevant hook/save and Chromium/WebKit final-game E2E plus build.
- [ ] Independent review, resolve evidenced findings; create PR and verify exact HEAD full CI (no merge).
