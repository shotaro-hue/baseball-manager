# PR-A 順位確定・構造監査 Implementation Plan

> 実装は本セッションで実行し、全差分を別コンテキストで独立レビューする。

**Goal:** 最終公式戦を含む同一の全球団履歴で順位表・CS出場・年度履歴を判定する。
**Architecture:** `rankLeague` の規則を維持。既存の全球団mapと今回結果を純粋に合成し、React更新前に順位を確定する。新しい永続stateや保存フィールドを追加しない。
**Tech Stack:** JavaScript / React / Vitest / Playwright。
**Spec:** 今回の「次工程スコープ確定指示書」PR-A、`docs/npb-playoffs.md`、AGENTS.md。

## 制約・受入

- 基準main `e0b1261da102e959aa8adaf5a4c5f1c7d623b0e8`、#558マージ済み、着手時open PR 0、作業変更なし。
- 順位領域以外の修正、schema変更、旧履歴の推定補完、旧契約挙動変更は禁止。
- テスト削除/skip/緩和、根拠なしtimeout/retry/期待値変更、main push/merge/auto-merge禁止。
- PR-B/Cは実装しない。公開OFF/schema1/DB5を維持。

## レビュー重点

- 最終戦後にのみ同率になる場合、最終日の自球団・相手・CPU全件を含める。
- 単独Workerと一括Workerで、開始時の履歴がReactの更新前でも同じ判定になる。
- 戦術のhome/away、勝敗・引分を同じ球団視点で扱う。
- 旧セーブの不足履歴は既存fallbackを維持し、確定済み旧playoffを再計算しない。
- 不採用/古い結果から履歴・planを公開しない。保存失敗とsessionの既存防御を保つ。

## 作業

- [x] 正本・現在main/PR/変更状況、rank入力形、各試合経路、保存、旧/annualの順序を確認。既存関連4ファイル46件成功。
- [x] 再現: 実名簿・実日程・実hook/Worker core/保存へ、最終戦で同率となる記録を供給しRED。home/away・引分・年度履歴・旧不足履歴も検証。
- [x] 限定修正: 全球団mapを順位表/年度末/CSへ渡す。Worker patchを順位確定前に合成。通常/戦術は最終日mapを候補構築時に確定し、teams依存effectを外す。規則・保存形は維持。
- [ ] GREEN: 対象回帰、保存/復帰、build、対象Chromium/WebKitを確認。
- [x] 全体監査: 正本一覧、P0/P1/P2、既存指摘の再評価、変更前後Mermaid、保存互換とPR-B/C引継ぎを文書化。
- [ ] 独立レビューで指摘を再現・評価。必要修正を検証。
- [ ] 専用ブランチのPR作成、最新HEADの必須CI全14ジョブを確認し報告。マージしない。

## 実行判断

ユーザーの具体的な実行指示とAGENTS.mdを根拠に、設計/計画の再承認は求めず実装へ進む。作業開始時にcheckoutが無かったため新規cloneを専用作業場所とし、専用ブランチを作成した。監査で別領域の問題を確認しても同PRに修正を混ぜない。

## 提出前の追加確認

- 一括metaの勝率/得失点差による別順位も同じ領域として修正。3ケースRED→GREEN。
- 追加19件、関連79件。その後のWorker meta修正は関連23件成功。
- 独立レビュー中に単独Workerへは不要な全球団map輸送を検出。hook側のsnapshot合成だけで足りるため1行除去し、single/batch実coreを含む26件成功。batchのmeta計算に必要な輸送だけを残す。
- PR #559を作成。最終HEAD/必須CI/独立レビュー/最終ブラウザ結果の正本はPR本文。mainへのpush/merge/auto-mergeは行わない。
