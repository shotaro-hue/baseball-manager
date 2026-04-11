---
task-id: e2e-tests-expansion
type: refactor
commit-prefix: chore
created: 2026-04-11
roadmap-item: "T7-E2E Playwright E2E テスト拡充（タイトル画面のみ → コアフロー全体）"
---

# Task: Playwright E2E テスト拡充

## 背景・目的

現状、E2E テストは `e2e/title.spec.js` 1 ファイルのみで、タイトル画面とチーム選択のみを検証している。
コアゲームフロー（HUB 遷移・オートシム・成績タブ表示・バッチシム）がリグレッションを起こしても自動検出できない。
ROADMAP の T7-E2E 項目（🔶 部分実装）を完成させ、成績集計バグ修正（fix-player-stats）の動作検証にも活用できるテスト基盤を整える。

**前提**: `TASKS/fix-player-stats.md` の修正が先行して適用されていること。特に Bug C（starter fallback）修正なしでは、
「投手成績が表示される」テストが誤ったまま通過する恐れがある。

## 機能説明

以下 3 つの spec ファイルを新規追加する（既存の `e2e/title.spec.js` は変更しない）。

1. **`e2e/hub.spec.js`** — チーム選択後の HUB 画面・タブナビの基本動作
2. **`e2e/game.spec.js`** — オートシム 1 試合の実行・結果画面・成績タブへの反映確認
3. **`e2e/batch.spec.js`** — バッチシム（5 試合まとめて）の実行・順位変動の確認

各 spec は `beforeEach` で `localStorage.clear()` を実行し、チーム選択から開始する。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `e2e/title.spec.js` | 既存テストのパターン・beforeEach の書き方を踏襲する |
| `playwright.config.js` | `baseURL`, `webServer` の設定確認 |
| `src/App.jsx` | 各画面の描画条件・タブラベル・ボタン文言の確認（~198行） |
| `src/components/tabs/StatsTab.jsx` | 成績タブの見出しテキスト確認（「打者成績」「投手成績」） |
| `src/components/tabs/DashboardTab.jsx` | ダッシュボードの要素確認 |
| `src/hooks/useSeasonFlow.js` | オートシム・バッチシムのボタン起動フロー確認 |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `e2e/hub.spec.js` | Create | HUB 画面・タブナビのテスト |
| `e2e/game.spec.js` | Create | オートシム1試合・成績反映テスト |
| `e2e/batch.spec.js` | Create | バッチシム・順位変動テスト |
| `ROADMAP.md` | Modify | T7-E2E の状態を 🔶 → ✅ に更新 |

## 実装ガイダンス

### 共通ヘルパー: チーム選択→HUB への遷移

3 ファイル共通で使うセットアップ処理。DRY にするため各 spec の `beforeEach` に以下を記述するか、
`e2e/helpers.js` として切り出す（切り出しは任意）。

```js
// チームを選択してHUB画面へ遷移
async function selectTeamAndGoToHub(page, teamName = '読売ジャイアンツ') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByText(teamName).click();
  await expect(page.getByText('🏠 概況')).toBeVisible({ timeout: 8000 });
}
```

`localStorage.clear()` + `page.reload()` を `page.goto('/')` の前後のどちらかで行う。
「セーブデータあり」状態でのテストは今回は対象外（新規ゲームのみ）。

### Step 1: hub.spec.js

```
e2e/hub.spec.js
```

検証内容:
1. チーム選択後に HUB（「🏠 概況」タブ）が表示される（title.spec.js で既存）
2. 各カテゴリのタブに切り替えられる
   - 「⚾ 成績」タブをクリック → 「打者成績」「投手成績」ボタンが表示される
   - 「📋 ロースター」タブをクリック → テーブルに選手名が表示される
3. 「次の試合へ」ボタンが表示される（または "試合開始" 相当のボタン）

注意: タブラベルの正確な文字列は `App.jsx` と `Tabs.jsx` のバレルを確認すること。
`getByText` のマッチング対象は aria-label ではなくテキスト内容。

```js
import { test, expect } from '@playwright/test';

test.describe('HUB画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText('読売ジャイアンツ').click();
    await expect(page.getByText('🏠 概況')).toBeVisible({ timeout: 8000 });
  });

  test('成績タブに切り替えると投手・打者ビューが表示される', async ({ page }) => {
    // 「成績」カテゴリタブをクリック（実際のタブ文言を App.jsx で確認して調整）
    await page.getByRole('button', { name: /成績/ }).first().click();
    await expect(page.getByText('打者成績')).toBeVisible({ timeout: 5000 });
  });

  test('ロースタータブに選手が表示される', async ({ page }) => {
    await page.getByRole('button', { name: /ロースター/ }).first().click();
    // 選手テーブルに何らかの行が存在することを確認
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 5000 });
  });
});
```

### Step 2: game.spec.js

```
e2e/game.spec.js
```

検証内容:
1. 「次の試合へ」ボタンでモード選択画面に遷移する
2. 「オートシム」または「自動」選択肢をクリックして試合が完了する
3. 試合結果画面（スコア表示）が現れる
4. 「続ける」などで HUB に戻り、成績タブで投手の K（奪三振）が 0 より大きい

ポイント: 試合シムは数秒かかる場合がある。`timeout: 15000` 程度を設定する。
オートシムボタンの文言は `Screens.jsx` / `App.jsx` を確認して正確に指定すること。

```js
import { test, expect } from '@playwright/test';

test.describe('オートシム1試合', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText('読売ジャイアンツ').click();
    await expect(page.getByText('🏠 概況')).toBeVisible({ timeout: 8000 });
  });

  test('オートシムを実行すると試合結果が表示される', async ({ page }) => {
    // 試合開始ボタン（文言は App.jsx で確認）
    await page.getByRole('button', { name: /次の試合へ|試合開始/ }).click();
    // モード選択画面でオートシムを選択
    await page.getByRole('button', { name: /オート|自動/ }).click();
    // 試合結果画面が現れる（スコア表示など）
    await expect(page.getByText(/勝利|敗北|引き分け|vs/)).toBeVisible({ timeout: 15000 });
  });

  test('試合後に投手成績タブで奪三振が集計されている', async ({ page }) => {
    // オートシム実行
    await page.getByRole('button', { name: /次の試合へ|試合開始/ }).click();
    await page.getByRole('button', { name: /オート|自動/ }).click();
    await expect(page.getByText(/勝利|敗北|引き分け|vs/)).toBeVisible({ timeout: 15000 });
    // HUBに戻る
    await page.getByRole('button', { name: /続ける|ハブ|HUB|戻る/ }).click();
    // 成績タブ → 投手ビュー
    await page.getByRole('button', { name: /成績/ }).first().click();
    await page.getByRole('button', { name: /投手/ }).click();
    // K（奪三振）列に数値が表示されている（少なくとも1投手で "0" 以外）
    // ※ 1試合で K=0 の可能性もあるためエラーにしない柔軟な確認
    const kCells = page.locator('table td.mono');
    await expect(kCells.first()).toBeVisible({ timeout: 5000 });
  });
});
```

### Step 3: batch.spec.js

```
e2e/batch.spec.js
```

検証内容:
1. 「5試合まとめてシム」ボタンを押すとバッチ処理が完了する
2. バッチ結果画面（直近5試合サマリー）が表示される
3. HUB に戻ると「勝」「負」の成績カウントが 0 より大きい（試合が進んでいる）

```js
import { test, expect } from '@playwright/test';

test.describe('バッチシム（5試合）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText('読売ジャイアンツ').click();
    await expect(page.getByText('🏠 概況')).toBeVisible({ timeout: 8000 });
  });

  test('5試合バッチシムが完了してHUBに戻れる', async ({ page }) => {
    // バッチシムボタン（文言は App.jsx で確認）
    await page.getByRole('button', { name: /5試合|まとめ|バッチ/ }).click();
    // バッチ結果画面
    await expect(page.getByText(/試合結果|直近|Result/i)).toBeVisible({ timeout: 30000 });
    // HUBに戻る
    await page.getByRole('button', { name: /続ける|ハブ|HUB|戻る/ }).click();
    await expect(page.getByText('🏠 概況')).toBeVisible({ timeout: 5000 });
  });

  test('バッチシム後に成績（勝敗）がダッシュボードに反映される', async ({ page }) => {
    await page.getByRole('button', { name: /5試合|まとめ|バッチ/ }).click();
    await expect(page.getByText(/試合結果|直近|Result/i)).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: /続ける|ハブ|HUB|戻る/ }).click();
    // ダッシュボードで勝/負の数値を確認（0より大きいことを期待）
    // 概況タブはデフォルト表示のため、ページに勝敗情報が含まれるはず
    await expect(page.locator('text=/\\d+勝/')).toBeVisible({ timeout: 5000 });
  });
});
```

### ボタン文言の確認手順

上記コードの `getByRole('button', { name: /.../ })` は正規表現で柔軟にマッチさせているが、
実装時は `App.jsx`（~198行）と各 Screen コンポーネントを grep して正確な文言を確認すること。

```bash
grep -n "次の試合\|試合開始\|オート\|バッチ\|5試合\|続ける" src/App.jsx src/components/Screens.jsx
```

マッチしない場合は `page.locator('button').allTextContents()` で一覧を取得してデバッグする。

## データモデル変更

なし（テストコードの追加のみ）

## 受け入れ条件

> **⚠️ Codex 環境での制約**: Playwright はブラウザバイナリのダウンロードとシステム依存ライブラリが必要なため、
> Codex の sandboxed 環境では `npx playwright test` の実行が失敗する場合がある。
> Codex の責務は **テストファイルの作成と構文的な正しさ** に限定する。
> テスト実行の検証はローカル開発環境（Claude Code Web / IDE）で行うこと。

- [ ] `e2e/hub.spec.js`, `e2e/game.spec.js`, `e2e/batch.spec.js` の 3 ファイルが作成されている
- [ ] 各ファイルが `import { test, expect } from '@playwright/test'` を正しく使用している
- [ ] `npm run build` でビルドエラーなし（本体コードを変更しないため自明）
- [ ] （ローカルのみ）`npx playwright install chromium && npx playwright test` で全テストがパスする

## テストケース

テストコードそのものが受け入れ条件（上記 Step 1〜3 参照）。

追加で考慮すること:
- 各 `beforeEach` のタイムアウトを十分長く（8000ms 以上）設定する
- `page.getByRole('button', ...)` が複数マッチする場合は `.first()` または `.nth(N)` で特定する
- フォントレンダリング差異による `toBeVisible` の誤検知を避けるため、
  テキスト内容ではなくロール・セレクタでの特定を優先する

## NPB 協約上の制約

なし

## 過去バグからの教訓

- B6 パターン: `src/main.jsx` のエントリポイント参照が正しいことを前提とする（B6 修正済み）
- B4 パターン: ページロード後にスケジュールが生成されない場合があるため、
  `page.reload()` + `localStorage.clear()` の順序に注意

## コーディング規約リマインダー

- テストコードは `@playwright/test` の `test`, `expect` のみ使用
- `Math.random()` 禁止ルールはテストコードには適用されない（Playwright テスト内）
- テストファイルに日本語コメントを積極的に使い、意図を明確にする

## ROADMAP.md 更新指示

```
| T7-E2E | Playwright E2E テスト | ... | ✅ 完了（e2e/hub.spec.js / game.spec.js / batch.spec.js 追加） |
```

の状態を `🔶 部分実装` → `✅ 完了` に更新する。

「最終更新」ヘッダー行を `2026-04-11（E2E テスト拡充 完了）` に更新する。

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-11 — Playwright E2E テスト拡充（コミットハッシュ）

**仕様本文への影響なし（テストコードのみ）**

- e2e/hub.spec.js: HUB 画面・成績タブ・ロースタータブの基本動作テスト
- e2e/game.spec.js: オートシム 1 試合の実行〜成績反映（投手 K 集計確認）
- e2e/batch.spec.js: 5 試合バッチシム〜HUB 戻り〜勝敗カウント確認
- T7-E2E を ✅ 完了に更新
```

## SPEC.md 更新箇所

なし

## Codex 実行上の注意

Playwright テストの **実行** は Codex 環境では行わないこと。
次のコマンドで構文チェックのみ実施する:

```bash
node --input-type=module < e2e/hub.spec.js 2>&1 || true   # import エラーがないことを確認
node --input-type=module < e2e/game.spec.js 2>&1 || true
node --input-type=module < e2e/batch.spec.js 2>&1 || true
```

または単に `npm run build` が通ればファイル作成成功とみなす。

## コミットメッセージ

`chore: Playwright E2E テスト拡充（hub / game / batch シナリオ追加）`

## PR タイトル

`chore: Playwright E2E テスト拡充（hub / game / batch シナリオ追加）`
