# GM-01C-2G-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 保護名簿に基づく人的補償の裁定・契約移管・減額金銭・翌春入団を原子的に実現する。

**Architecture:** 既存の共通quote/applyにbatch指名と加入commandを追加する。金融履歴はannualSpending/faCompensation、資格はfaProtection、人的移管のsnapshotと裁定は専用faPersonnelが所有する。

**Tech Stack:** JavaScript、Vitest 2.1.9、Vite 5、既存ledger。

**Spec:** docs/superpowers/specs/2026-10-30-gm01c2g2-fa-personnel-design.md

## Global Constraints

- 本番hook/CPU/Worker/UI/旧保存移行/年度更新は接続しない。
- 見積・失敗は全state非変更、JSON後の同一取引は一度だけ。
- 原年俸・期間・保証と過年度給与を変更しない。
- 金額は整数万円、初回A50/B40・反復A25/B20を切上げ。
- 新規負担は全年度予算と70人枠を審査。main直接push/merge/auto-merge禁止。

## Review Focus

- 12月の満了/未更改と翌年度更改の給与付替えが過年度負担を変えない。
- 複数FAで同じ候補を指名したとき入力順やIDが勝者を決めない。
- 加入待ちの新人/FA/人的補償が70人枠と最低維持費に一度だけ計上される。
- 全年度の給与と受取金銭を相殺して赤字の新規契約を許可しない。
- JSON後の孤立receipt/移管action/補償record、後の移籍・翌年再適用を照合する。

### Task 1: 減額金銭と金融履歴

**Files:** src/engine/faCompensation.js、annualSpending.js、src/constants.js、src/engine/__tests__/faPersonnelMoney.test.js。

**Interfaces:** faCashCompensationManYen(p, method='cash-only')、faCashCompensationCosts(p,method)を拡張。player-and-cash recordにplayerId/transactionIdを追加。金銭のみの既存APIを維持。

- [ ] 4区分と切上げ、pending→player-and-cash両側費用/原案件の照合テストを追加してRED。
- [ ] 定数と既存金融準備/審査へ追加しGREEN。
- [ ] 既存annualFaCompensation回帰を実行しcommit。

### Task 2: 一括裁定・移管・加入

**Files:** 新規src/engine/faPersonnel.js、annualTransactions.js、annualAcquisitions.js、tradeTransaction.js、新規src/engine/__tests__/annualFaPersonnel.test.js。

**Interfaces:** normalizeFaPersonnelSelections、createFaPersonnelSettlement、inspectFaPersonnelMoves、joinFaPersonnel。共通commandにsettle-fa-personnel/selectionsとjoin-fa-personnel/proposalId、quoteにpersonnel結果。

- [ ] 単独指名/翌春加入・金銭・台帳・非変更、同一リーグ/勝率の競合をREDで実証。
- [ ] 信頼順位snapshot、元名簿と現在資格、全pendingの一括裁定、将来契約移管とpending snapshotを実装。
- [ ] 70人枠/最低維持費と既存所属検査へpending personnelを接続しGREEN。
- [ ] 入力順、欠損/同率、同じ旧球団の重複、満了/更改、全年度予算拒否、給与承継、JSON/再適用/孤立履歴、後の移籍、日付巻戻しを追加してRED→GREEN。
- [ ] FA・新人・育成・台帳・取引・予算・保存の関連回帰を実行しcommit。

### Task 3: 受入・公開

**Files:** SPEC.md、ROADMAP.md、CHANGELOG.md、docs/validation/gm-01c-2g2/README.md。

**Interfaces:** 公開branchのtreeを検証済み差分と照合し、新PRの親は基準main。

- [ ] 独立reviewでReview Focusと仕様/差分を確認。重大指摘は再現RED→GREENで修正。
- [ ] build・diff check。関連回帰の結果を記録し、CIで同じ全件を重複実行しない。
- [ ] 制度根拠・ゲーム簡略化・未接続範囲・検証の限界をdocsへ記録。
- [ ] 専用branchへcommitを公開しPR作成、同一head CIを確認。mergeは行わず報告。

## Progress

- 基準のFA金銭補償53件・保護名簿69件、計122件成功（3.08秒）。
- 最新mainの実行テキスト・設定・対象docsをGit blob SHAで検証。添付は旧版でgit未同梱のため、APIで最新sourceを取得した独立作業ディレクトリを使用。テスト依存はlockfileどおりoffline npm ciで準備。バイナリE2E fixtureは未取得、ローカルE2Eを合格扱いしない。
- Task 1/2完了。金額5 RED→GREEN、基本裁定6 RED→GREEN、過年度draft割当1 RED→GREEN。独立レビューImportant 2件も2 RED→GREENで修正。最終関連20ファイル803件成功、build/diff check成功。新規62件。検証詳細はdocs/validation/gm-01c-2g2/README.md、同一公開headのCIはPR本文を正本とする。
