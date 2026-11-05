# Unified Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 全選手のposting/FAを確定判定し、旧保存と歴史を保全する。
**Architecture:** version2選手根拠、共通純粋判定、固定開幕journal、冪等移行。旧snapshotのversion1検証を残す。
**Tech Stack:** JavaScript/React/Vitest/IndexedDB/Vite/GitHub Actions。
**Spec:** `docs/superpowers/specs/2026-11-05-unified-eligibility-design.md`

## Global Constraints

mainへ直接push/マージ/自動マージ禁止。#548の元ブランチ非変更。公開OFF/schema1/DB5。元のserviceYears/entryAge/daysOnActiveRosterを再定義しない。出典と推定を区別。2026-03-27より未来の事実を初期化へ入れない。

## Review Focus

- FA権の取得・行使・市場中の資格証明・再契約後再取得の境界。
- 過去のsnapshotを現在所属/現在ルールで無効化しない。
- 移籍と試合再処理での二重加算。
- 旧保存の未記録0と実測0、台帳/receipt内の歴史を変更しない。
- 架空新人の入団年と生年月日が翌年度でも固定される。

### Task 1: 共通判定と履歴版

Files: `src/engine/playerEligibility.js`, `postingQualificationSnapshot.js`, `annualPostingQualifications.js`, `contract.js`, focused tests.
Interfaces: `initializePlayerEligibility(player,{year,...})`, `getPlayerFaProgress(player)`, `assessGamePostingQualification(player,{signingDate,completedSeasonYear})`, `accrueFaService(player,{year,gameDay})`, `exerciseFaRights(player,year)`。
- [x] 年数/誕生日/145日閾値/再取得/重複日/決定的欠損のRED。
- [x] 共通純粋ロジックとruleVersion2 snapshot、旧履歴検証を実装。
- [x] 対象テストGREEN。

### Task 2: 固定初期journalと実経路

Files: `src/data/openingEligibility2026.json/js`, producer、realplayer/bootstrap、生成/加入/更改/日次/年度、saveload、UI。
Consumes: Task1の共通関数。Produces: 全実名/架空の固定eligibilityと公開関数共通判定。
- [x] 公式104人/行使8人・未来拒否・実名簿・旧保存・日次/年度・人CPU一致をRED。
- [x] 一次情報から必要な事実だけjournalへ。未確認の非公式登録日数は同梱しない。
- [x] 新規ゲームと既存保存の移行を分離、契約/市場/履歴の接続。
- [x] 実保存/失敗回復/移籍/育成/退団と関連回帰をGREEN。

### Task 3: 提出

- [ ] buildと全unit/integration。独立レビューと必要修正。
- [ ] SPEC/ROADMAP/検証記録へ式・人数・出典・移行・限界を記録。
- [ ] 専用branchをpushしmain向け依存PR作成、正確なHEADの必須CI全件確認。
- [ ] PR URL/HEAD/計算式/変更ファイル/人数/検証/限界を報告。
