# native期末引退判断 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this authorized stage, test-driven-development, then independent whole-branch review.

**Goal:** native 12/1の人/CPU新規引退判断を保存し、履歴・保証を保持して既存postingへ渡す。

**Architecture:** 既存annual retirement子取引/一candidate/保存barrierを再利用。期中と区別した期末sourceと親receiptを既存配列へ記録する。

**Tech Stack:** JavaScript/React/Vitest/Playwright/既存IndexedDB。

**Spec:** [設計](../specs/2026-11-09-year-end-retirements-design.md)。

## Global Constraints

- 基準main 259c200b18518a228f69abd12274c304be57a027、公開OFF/schema1/DB5。
- legacy/旧冬/保証・過去成績・保存barrier維持。成長/翌春/Workerは含めない。
- 同一scopeの乱数固定。入力/失敗は非変更。マージ/main pushなし。

## Review Focus

1. 期中予約と12/1新規引退の元日付/雇用照合を混ぜない。
2. farm・低意欲・予約済み・将来契約を人/CPUとも正しく扱う。
3. 再試行/旧session/公開後中断で二重career/抽選/公開をしない。
4. posting済み旧冬のロード/再利用を妨げず、新規の後付け引退は拒否する。
5. 改ざんreceiptと合法な後続契約/成長を区別し、過去判断を再抽選しない。

## Task 1: 期末引退のnative合成取引

**Files:** annualYearEndRetirements.js（新規）、annualRetirements.js、annualTransactions.js、contractEconomy.js、economyPersistence.jsと対応unit。

**Interfaces:** yearEndRetirementsId(season)、yearEndRetirementCandidates(state,humanTeamId)、normalizeYearEndRetirements、createYearEndRetirementsSteps(state,c,signature,applySteps)、inspectYearEndRetirements(state)。新reserve-year-end-retirementは既存finalize-retirementと合成する。

- [x] 成功・0件・人の意向/CPU/予約混在・保証・入力不変・JSON/順序・改ざん・競合/古い入力の回帰を追加しRED確認。
- [x] 期末source/親receipt/審査と保存履歴保護を実装、unit/隣接群GREEN。
- [x] 実bootstrap/PR-C入口と性能を確認しcommit。

## Task 2: 既存画面/保存操作への接続

**Files:** humanYearEndRetirements.js（新規）、useGameState.js、useOffseason.js、既存画面/route、対応hook/UI/E2Eと検証文書。

**Interfaces:** yearEndRetirementsRequest(world,decisions)、reduceYearEndRetirementsRequestAsync、commitYearEndRetirementsRequest(request,sessionToken)、handleYearEndRetirements(decisions)。UIは結果ではなくaccept/retain意向を渡す。

- [x] 実保存の失敗/再試行・cold reload・career・旧session/revision・barrier・公開後復旧、UI選択/結果/旧冬互換をRED確認。
- [x] 既存commit/復旧と画面に接続しGREEN。postingは別操作。
- [x] 360/390/1440pxの前後/操作・Chromium/WebKitを検証、既存必須CIの対象へ追加。
- [ ] 独立レビュー→指摘実証/修正は完了。exact HEAD必須CI→PR提示は進行中。

## 実行記録

- AGENTS.mdに従い新規cloneの専用ブランチで作業。新規worktreeの追加は不要。既存計画/コードの照合と独立scopeレビューから本工程を選定し、追加承認待ちは設けない。

- core新規27/hook5、計32件。初期RED→GREENと独立レビューのP2整合性5ケースRED→GREENを確認。関連8ファイル195件成功。
- Chromium4件、公式WebKit4件（360/390/1440pxと公開後復旧）成功。WebKitの不足依存を公式配布から/tmpへ展開し実起動。実iPhoneとは区別。
- レビュー対象082f55fのP2は完全worldでの逆参照検証で修正。中間子candidateの既存共通審査は維持。その他の確定P0/P1/P2なし。
- 追加の実装側確認でreloadなしの同画面連続操作に成功済みUI lockが残ることを再現。hook/UIの同一旅程RED→GREEN、操作ごとに既存lockを分離し、実ブラウザ回帰を追加。旧CI #735は旧HEADの記録とし、修正後HEADの必須CIを最終根拠とする。
- 連続操作修正後hook/UI43件・Chromium5件/WebKit5件が成功。旧HEADから開始したローカル全suiteは最終HEAD根拠として流用しない。通常CIで同じ全セットを理由なくさらに重複実行しない。
- 受信箱別入口のP1回避を実装側と独立レビュアーで再現し、共通world入口と同じUI predicateへ修正。両準備/直接生成/実保存4RED→GREEN、受信箱往復/判断保存/希望生成の両ブラウザ2件成功。関連8ファイル160件成功。最新追加core30/hook5計35件。
- 旧e636103の実producerから旧posting保存fixtureを固定し、再利用を検証。独立レビュアーが限定修正差分と互換fixtureを再確認、対象4件成功。受信箱パネルの3幅比較画像と限定レビューを完了。旧CI #736は停止し、最終HEADの必須CIを確認する。
- 最終ソースのChromium6件/WebKit6件、計12件成功。受信箱経由・reloadなし連続操作・3幅の保存/再試行/再開・公開後復旧を含む。
- CI #737で受信箱E2Eの汎用status指定が一時的な2要素に一致して失敗。保存済み表示を特定し、処理中表示が消えるまで確認する。製品・期待する保存結果・timeout/retries/CI設定は変更しない。別の既存open-offseason単体テストの10秒超過は基準mainのCPU負荷下でも再現し、待機デッドロックは否定した。詳細は検証記録。修正後HEADの必須CIを確認する。

## 2026-11-14 PR #562レビュー指摘の調査・最小修正

ユーザーの調査・追加コミット・最終CI確認指示に従って同じPRを継続する。基準mainは`259c200b`、調査開始HEADは`88f081ad`で変化なし。公開OFF/schema1/DB5、既存テスト・保存順序・履歴保護を維持し、新機能・新形式・暗黙移行は加えない。

- [x] 実producer→`validateEconomySave`/`toAnnualState`→初回保存/冷読込/backup復旧でcontinued欠落・入力/ID改変、accepted欠落、子ID改変を調査。
- [x] 判断: continuedの過去母集団は既存証跡から証明不能。現在名簿で遡及再計算せず、検出限界を検証文書とPRへ明記する。公開済みreceiptの変更拒否と正常なcontinued履歴はテストで維持する。
- [x] 旧native冬で人向けAPIは拒否、共通APIは新規判断を受理する不一致を再現。修正前の実producerから保存済み操作fixtureを固定する。
- [x] `annualYearEndRetirements.test.js`/hookに新規共通API拒否の回帰を追加しREDを確認。正常open済み・保存済み再実行・旧posting・不正revision/年度/sessionを対で検証する。
- [x] `contractEconomy.js`の`runCommand`で新規期末判断だけ`requiresYearEndRetirements(world)`を要求しGREEN。読込検証と既存receiptのreplayには開始条件を遡及適用しない。
- [x] 関連12ファイル351件・Chromium6/WebKit6件成功。追加回帰16件、既存3件の失敗→成功を確認。実iPhoneは未検証。
- 最終提出: AGENTS.mdに従う独立レビュー、既存ブランチへの追加コミット、最終HEAD必須CI確認、PRへの結果記録を行う。最終SHA/CI/レビューの確定結果はPR本文を正本とし、マージせず停止する。
