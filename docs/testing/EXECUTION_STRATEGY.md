# テスト実行戦略（2026-10-10）

対象: Baseball Manager / main `1808bb0`（PR #429、#430取り込み済み）。[全121ファイルの棚卸し](./TEST_INVENTORY_2026-10-10.md) と [PR #430 CI](https://github.com/shotaro-hue/baseball-manager/actions/runs/38010758680) を根拠にする。

## 目的・守るもの

**目的:** Workによる無駄な再実行・ログ読込・時間消費を減らし、保存破損、進行停止、試合・成績の不整合を見逃さない。**テスト件数削減を目的にしない。**

- 対象テストの失敗をskip・削除・根拠のない期待値変更で隠さない。
- 最終判断は**PRの最新SHA**に対する検証で行う。古いSHAの緑CIを使い回さない。
- バグ修正では修正前に失敗を再現する最小の回帰テストを作り、修正後に同じテストを通す。
- 独立した検証観点（DHあり/なし、ホーム/ビジター、Chromium/WebKit、保存・復旧）は維持。
- テスト待機時間とAIのトークン利用量は同一ではない。**Work側の無意味なループや大量ログの再読込**を優先して抑える。

## 4段階の実行順序

| 時点 | Work/ローカル側 | GitHub側 | 終了条件 |
| --- | --- | --- | --- |
| **T0 調査・実装修正のたび** | 変更点に関係するVitestファイルだけ（通常数秒）。再現時は1ケースに絞る | なし | 原因・期待・修正後のRED→GREENが説明できる |
| **T1 機能単位の完了時** | 関連するVitestと、必要なPlaywrightファイル/ケースだけ。最初はChromium、スマホ固有ならWebKitも | なし | 対象フローのテストが安定し、変更の影響範囲が明確 |
| **T2 PR候補の固定時** | 原則`npm run build`と`npm test`を**一度**。同じSHAに対するCI結果が確保できるなら、無人Workでの同一全件再実行は省略可能。保存・年度進行・試合エンジンの広範変更は最終コードで全E2Eを一度検証 | 通常PR CIでBuild、全Vitest、重要E2E（47件）を強制 | 最新head SHAですべて必要なゲート成功、失敗と未検証を明示 |
| **T3 定期・重要リリース** | 手動/定期ワークフローに全E2E（65件）を委譲。バランス変更時だけ指定のベンチマーク | 週次または手動のフルE2E。重要なマージ前は必要に応じてWorkで先行実行 | 低頻度のUI・長期進行・100試合テストも失われない |

**重要:** `npm run test:e2e:smoke`（21件）と`npm run test:e2e`（65件）は包含関係。**同一SHAで両方を連続実行しない。** 全件を実施するならスモークを別途実施する必要はない。スモーク失敗後に原因修正して全件を実行するなど、対象SHAが異なる場合は例外。

## 変更種別別の最小検証セット

| 修正種別 | T0/T1の主な対象 | T2の追加判断 |
| --- | --- | --- |
| セーブ/ロード/バックアップ/通算履歴 | `tests/save-generations.test.js`, `tests/career-generations.test.js`, `src/hooks/careerPersistence.integration.test.js` と新規ゲーム・年度進行関連 | `e2e/save-generations.spec.js`, `e2e/career-generations.spec.js` をChromium/WebKitで実行。構造的変更なら最終全E2E |
| 試合エンジン、成績、物理、Worker | `src/engine/__tests__/simulation.test.js`, `tests/game-stats.test.js`, `src/workers/__tests__/seasonBatchPayload.test.js` など変更ロジックに紐づくファイル | `e2e/match-history.spec.js`, `e2e/progression.smoke.spec.js`; 物理変更時の`npm run validate:physics-hr`は局所実行可（`npm test`と同一SHAでは重複実行不要）。広範なら全E2E |
| 契約/FA/オフシーズン/財務 | 対象のengine/hook/UI回帰テスト | `e2e/posting.spec.js`, `e2e/contract-renewal.spec.js`, `e2e/finance.spec.js`, `e2e/progression.smoke.spec.js` から影響範囲に応じて選択。経済バランスを変えた場合のみ任意ベンチマーク |
| レイアウト/ナビ/表示 | 対象コンポーネントテスト、該当の`e2e/hub.spec.js`等 | 390px・360px・desktop、必要なら境界の前後で同一状態の画像/操作確認。全画面のE2Eは不要。ただし大規模ナビ変更は全E2E |
| 文書、コメントのみ | 差分のリンク・構文確認 | CIが最新SHAで成功することを確認。ローカルの全E2E再実行は不要 |

この表は**最小セットの例**。変更による波及範囲と過去の不具合を優先してテストを追加すること。狭すぎるテスト選択を合格とみなさない。

## コマンド例

```bash
# 開発中: 再現した単体/統合テストだけ
npx vitest run tests/save-generations.test.js tests/career-generations.test.js

# 開発中: 該当ブラウザフローだけ
npm run test:e2e -- e2e/save-generations.spec.js --project=chromium --workers=1 --retries=0

# 最新のPR候補: 全単体/統合（ベンチマーク2件は環境変数でopt-in）
npm test
npm run build

# 保存構造/進行/試合の広範変更で必要な最終全E2E（スモークを重ねない）
npm run test:e2e -- --workers=1 --retries=0

# バランスを触ったときのみ（通常テストには含まれない）
RUN_FA_ECONOMY_BENCHMARK=1 npx vitest run scripts/fa-economy-benchmark.test.js
RUN_SALARY_BENCHMARK=1 npx vitest run scripts/salary-demand-benchmark.test.js
```

## CIの改善

### 通常PR CI

- `build-and-test`でBuildと`npm test`。`scripts/validate-physics-hr.test.js`は既に`npm test`内で走るので同じコミットで再実行しない。単独コマンドは削除しない。
- E2E対象は従来と同じ47件を維持する。`history-and-posting`の23件（実行約8分）を`history`・`posting`・`finance`へ**別ジョブ化**。実行総量はほぼ維持し、ジョブ並列化でPRゲートの所要時間を短縮する。ブラウザセットアップの重複・GitHub Actions使用時間増には注意。
- `progression-e2e`という既存必須チェック名は維持し、**全ジョブが成功したときだけ緑**。一部失敗やcancelで緑扱いにしない。
- 同じPRの新しいpushが来た場合、古いCIをcancelして古いSHAの検証に計算時間を使わない。

### 全E2Eの補完

- 通常PR CIの対象外は**8ファイル・18ケース**。削除せず、週1回と手動の`full-e2e`ワークフローで全65件を1 worker/retry 0で実行する。
- 保存形式、進行、試合コアなど重大変更では週次の結果だけに依存せず、**そのPRの最終SHAで**対象外の影響範囲も検証する。必要に応じて最終全E2Eを実行。
- フルE2E失敗はリリース/次PR判断に反映し、基準不明のまま無視しない。

## Workの停止・報告・トークン節約

- 「同じ失敗が2回」で機械的に停止はしない。別原因が判明し、次の検証に根拠があれば続行。
- **同一SHA・同一環境・同一設定で失敗したテストを、原因や仮説を変えずに繰り返さない。** 失敗テストのみ修正・再実行し、全件を毎回やり直さない。
- 失敗時は関連ログの最後・差分だけを見る。毎回CIの全ログやtraceを丸ごと読み直さない。テストの削除、skip、リトライ追加は解決とみなさない。
- CIが動いている間はPR URL/head SHAを報告して成果を残す。継続的な短間隔ポーリングはせず、CI完了後に確認する。
- ブロッカーになったら`完了した内容 / 根本原因の事実 / 未解決 / 次の1手 / PR URL`を報告。ユーザーへ継続の判断を委ねる。**返答せず無制限に調査を続けない。**
- 完了報告は実行コマンド、対象SHA、成功/失敗/未実行、CIとローカルの区別、残存リスクを明記する。

## 残課題（別PRで扱う）

1. `src/components/tacticalGame.test.jsx`の3テストが`vitest.config.js`から漏れている。globを変えるだけではなく`jsdom`の依存導入、UIテストの実行確認、テスト収集漏れ検知を追加する。
2. 100試合×3 seed（約35秒）と10万打席検証（約10秒）が`npm test`時間の大部分を占める。**今回はケースを削らず**、開発中の局所実行で回避。今後、代表seedの常時実行と全seed定期実行への分離を、故障検出実績と実時間を計測して判断。
3. CIの5ジョブ分割後、実CIの所要時間・flake・GitHub Actions利用量を比較。実測で逆効果なら元に戻す。
4. 週次フルE2Eの結果をレビューし、通常PRで落としてよい観点がないか定期的に見直す。変更だけで隠れた依存が検出できない場合はCI対象を拡張する。

## 受入条件

- 全121ファイルとケース数・通常CI対象の対応表を保存。
- テスト削除・skip増加なし。Playwright通常PR対象47件、フル65件は変更しない。
- `progression-e2e`の既存必須チェックは維持。
- CIの`build-and-test`、E2E全ジョブが最新PR SHAで成功。
- 新ワークフローは手動・週次を設定し、初回の全件結果が得られるまでは「実行済み」と主張しない。
- テスト収集漏れ（.test.jsx）は未解決として記録し、別PRで修正する。
