# UI-01E: 日程・試合履歴・保存ボックススコア

基準main: `081622401bdfdfc9891797b3fa7a806bcecf6789`（#464マージ、2026-10-14再照合）。添付ZIPは古い版のため実装基準に使わない。
本ブランチの実装・検証記録。未マージでありmain反映済みとは扱わない。

## 目的・対象

試合の年度・日付・球団と保存記録の範囲を把握し、日程から詳細を見て元の表示へ戻る。
対象は `ScheduleTab`、`TeamDetailScreen` 内の日程タブ、`BoxScoreModal`、日程から既存 `ResultScreen` へ進む接続。
DES-01のネイビー・ホワイト・青アクセント、44px操作、局所スクロール表を使用。写真なし。
球団詳細の他のタブ、既存ナビ、試合計算・Worker・保存形式・キュー・成績計算は変更しない。

## 実装とデータ

- `Button`・`StateLabel`・`DataTableFrame` を再利用。スコア・球団名と保存記録の範囲、年度・日付・ホーム／ビジターを表示。
- ボックススコアは保存時の `my*/opp*` を優先し、旧 `home*/away*` をフィールド単位でフォールバック。明示的な空配列を旧データで置き換えない。今季成績・現在ロスターから再計算しない。
- 詳細は左右両側のいずれかに記録があれば描画。未記録は `—`、記録された0は0、ホームイニングの明示的null（攻撃未実施）は `−`。年俸・成績の丸め等は対象外。
- 過去年度は年度別 `gameResultsMap` と `myTeamResultsMap` の保存記録を解決。片側だけの表も隠さない。記録のない選手行を生成しない。
- 今季は既存 `ResultScreen` へ進む。表示月／日・一覧／カレンダー・スクロール・開いたボタンを一時的な `_scheduleView` へ保持。年度・試合日・save ID・球団・progress session一致時だけ復元し、一度消費する。セーブへ追加しない。
- CSSは対象クラス／`data-ds` のみ。日程を含む実HubShellの背景も対象へ限定し、他タブへ配色を波及させない。
- イニング・選手表は名前列を固定。横方向のはみ出しは表／カレンダー内のみ。閉じる・Escape・Tab循環・背景スクロールロックは既存 `useResultDialog` を再利用。

## 検証

関連Unit 3ファイル23件成功: `npx vitest run src/components/BoxScoreModal.test.js src/components/scheduleLeagueFlow.test.js src/components/detailScreens.test.js`。
年度・日付・視点、相手だけの表、未記録と0、過去年度の相手だけの表、初期復帰表示、一度のみの復帰情報消費についてRED→GREENを確認。
既存のWorker home/away・戦術旧形式・空配列・JSON保存後の互換テストを維持。

`e2e/helpers/history-design-cases.js` は既存の通常CI対象 `match-history.spec.js` から登録。CI設定とブラウザ対象は変更しない。
Chromium141、対象E2E計10件成功（fixture7件＋実App3件）。7幅（360/390/760/761/1023/1024/1440）×通常・長い名前・空・読込中・詳細なし・部分記録・球団日程を確認。
年度／月／一覧／カレンダー、引き分け／ビジター、44px操作、ページ全体の横はみ出し、Tab循環・Escape・フォーカス復帰を検証。
実App360/390/1440は実Workerで10試合進行し、日程→結果→月／表示／フォーカス・横スクロール復帰、後のタブ移動で古い復帰情報が再適用されないこと、球団の保存表の選手名・スコア、保存／再開でteamsと履歴が変わらないことを照合。

独立レビューで日程Shellの背景と過去の相手だけの詳細を検出・対応。復帰情報の再適用とカレンダー横スクロール復帰にも回帰テストを追加。
環境の日本語書体にNoto Sans JPを導入し、以下のfixtureは同じデータで変更前後を撮影。

## 変更前後

同一fixtureの年度2026・第2戦、過去2025・3/31ホーム2対0、同じ球団日程。ボックススコア画像は844/900pxのviewport内の状態であり、全テーブルの全高表示ではない。画像のfixtureと実Worker試験は区別する。

| 幅 | 日程 | ボックススコア | 球団日程 |
|---|---|---|---|
| 360 | [前](../validation/ui-01e/before-schedule-360.png) / [後](../validation/ui-01e/after-schedule-360.png) | [前](../validation/ui-01e/before-box-360.png) / [後](../validation/ui-01e/after-box-360.png) | [前](../validation/ui-01e/before-club-360.png) / [後](../validation/ui-01e/after-club-360.png) |
| 390 | [前](../validation/ui-01e/before-schedule-390.png) / [後](../validation/ui-01e/after-schedule-390.png) | [前](../validation/ui-01e/before-box-390.png) / [後](../validation/ui-01e/after-box-390.png) | [前](../validation/ui-01e/before-club-390.png) / [後](../validation/ui-01e/after-club-390.png) |
| 1440 | [前](../validation/ui-01e/before-schedule-1440.png) / [後](../validation/ui-01e/after-schedule-1440.png) | [前](../validation/ui-01e/before-box-1440.png) / [後](../validation/ui-01e/after-box-1440.png) | [前](../validation/ui-01e/before-club-1440.png) / [後](../validation/ui-01e/after-club-1440.png) |

## 限界・残工程

iPhone実機、この画面のSafari/WebKit・スクリーンリーダー・200%拡大、実複数年の年度移行・全E2Eは未検証。
球団詳細のロスター／移籍履歴と周辺Shellは旧配色を保持。UI-03、FIX-S3、財務疑義、長期バランスは別工程。
既存のbuild chunk-size警告は残る。新依存・skip・テスト削除はない。
最終headのCIと実測件数はPR本文に記録する。同一commitの全Unit／中核E2Eを理由なくローカル重複実行しない。
