# UI-02D1 — 球団別一軍成績一覧

基準main: `91fad367c357180eeddcad56e40952a678204687`（PR #457マージ後）。最新mainのGitHub SHAとローカルfetchを照合。添付の旧ZIPは実装基準にしていない。

## 目的・対象

成績一覧で候補を探し、詳細・2人比較を確認して編成へ戻れる状態にする。ユーザーが合意したUI-02Dの最初の独立PRとして、既存StatsTabの球団別一軍成績一覧をDES-01へ移行する。球団・現在所属・名前の絞り込み、主要／詳細指標、ソート、記録範囲・状態、詳細／比較の導線を扱う。

リーグ全体のLeaderboardTab、二軍FarmRankingsのデザイン移行、二軍育成・会話、まとめ結果・試合詳細、UI-03は後続。計算式・丸め精度の変更はFIX-S3で分離する。保存形式、ゲーム処理、Worker、編成制約、ナビIDは変更しない。UI-02全体の完了とはしない。

## 確認・実装判断

- 開始時にAGENTS/CONTRIBUTING/ROADMAP、DESIGN_SYSTEM/TEST_STRATEGY、青写真とSPECの関連部分、UI-02A/B/C検証記録・呼出元を確認。14件の関連Vitestが基準mainで成功。
- StatsTabの旧母集団は`team.players`だけだった。既存`seasonParticipants(team)`を再利用し、現在二軍でも一軍出場記録を持つ選手を含める。`stats`だけを一軍として読み、`stats2`・二軍実測・年度別／通算を合算しない。FA／退団者など現行selectorが扱わない母集団の拡張はしない。
- `firstTeamStatsMetrics`は一覧専用の読取表示ガード。指標ごとに必要な記録項目と分母を検証し、実測0／未記録／算出不可／不正値を区別。欠測・算出不可はソートにもnullを渡し、昇順・降順とも末尾。独立して記録された本塁打や防御率まで他の欠落項目で隠さない。
- AVGの表示・ソート、OPS/ISO等の既存saber丸め、投球回のfmtIP/inningsToOuts、百分率fmtPctを維持。LAの負値・WARの負値は有効。打球速度も記録数があれば実測0を表示する。分母はBABIPの打数−三振−本塁打＋犠飛など指標固有の条件を使う。
- 球団は既存IDから選択。現在所属と名前は表示だけの一時state。主要／詳細切替、詳細・比較の開閉中もフィルタ・並び順・局所スクロールを保持する。年度は今季を明示し、過年度は既存選手詳細へ委譲する。
- 名前はnative button、比較追加は独立button。比較buttonのEnter/Spaceが行の詳細操作を同時実行しないようにする。タブはtab/panel関連付けと矢印/Home/End、説明は表の外へ表示しEscape・閉じる後に起点へfocusを戻す。
- DES-01共通Button/DataTableFrameを再利用し、ネイビーの範囲見出し、白い表、青い操作色、固定名前列を採用。新CSSは一軍一覧へ限定し、二軍タブは既存FarmRankingsを維持。旧STAT_TIPSを公開して一覧で再利用し、他のThCell利用者の動作は変えない。
- 初期画像でスマホのフィルタ欄が一覧を押し下げたため、球団・所属・名前を開閉式へ調整。比較列は指標の後へ配置し、スマホ初期表示で名前と数値を読めるようにした。打者はOPS、投手は防御率を先頭にし、並び順の基準値を最初に確認できる。直接追加は表の末尾、名前から開く詳細にも既存の比較操作がある。fixtureの旧CSSをcomponent前に読み、実Appのshell→lazy一覧という順序へ合わせる。

## 検証

- 新規component回帰5件で変更前REDを確認。一軍出場後の二軍選手脱落、欠落pitcher.statsでのエラー、新フィルタの不足を含む。実装後に関連19件成功。
- `npx vitest run src/components/firstTeamStatsMetrics.test.js src/components/firstTeamStats.test.js src/components/detailScreens.test.js src/components/FarmRankings.test.js src/components/playerDetailDesign.test.js src/components/scheduleLeagueFlow.test.js --maxWorkers=2 --minWorkers=1`：38件成功。記録条件、分母0、実測0、旧不完全記録、負値、既存計算精度、入力非変更を検証。
- `npm run test:e2e -- first-team-stats.spec.js hub.spec.js --workers=1 --retries=0`相当：14件成功。ローカルは既存サーバーとの衝突を避け、同じソース/testDirでport5190のみ変更した一時configを使用。
- 360/390/760/761/1023/1024/1440pxで野手・投手、通常・実測0・未記録・分母0・旧不完全記録・長い名前・負傷を確認。44px以上の可視操作領域、ページ横溢れなし、表だけの横・縦スクロール、固定名前列、空結果、他球団・二軍所属の一軍記録を検証。
- 実Appの360/390/1440pxで一覧→詳細から2人追加→比較→終了／クリア→編成、保存・再読込を実施し、teams（選手、成績、起用、契約等）が閲覧前と同じことをassert。fixtureではフィルタ・ソート・局所／ページscroll保持、キーボード比較追加、Escape、Tab循環、focus復帰、比較解除を検証。
- 独立読取レビューは重要な指摘なし。`git diff --check`成功。
- 最新headの全Vitest・build・重要E2EはPR CIで確認する。既存roster-settings群へ11件の一覧E2Eを追加し、他のCI対象・workers=1・retries=0・集約全成功ゲートを維持する。

## 変更前後の画像

同じ2026年・同じ球団・同じ合成表示データ・主要指標をChromiumで撮影。変更前は基準mainのStatsTab。二軍所属の一軍出場者が変更後に増えるのは母集団修正の結果。これは合成fixtureであり、長期プレイ・実端末の検証ではない。

| 幅 | 打者 前／後 | 投手 前／後 |
|---|---|---|
| 360px | [前](../validation/ui02d/before-batter-360.png) / [後](../validation/ui02d/after-batter-360.png) | [前](../validation/ui02d/before-pitcher-360.png) / [後](../validation/ui02d/after-pitcher-360.png) |
| 390px | [前](../validation/ui02d/before-batter-390.png) / [後](../validation/ui02d/after-batter-390.png) | [前](../validation/ui02d/before-pitcher-390.png) / [後](../validation/ui02d/after-pitcher-390.png) |
| 1440px | [前](../validation/ui02d/before-batter-1440.png) / [後](../validation/ui02d/after-batter-1440.png) | [前](../validation/ui02d/before-pitcher-1440.png) / [後](../validation/ui02d/after-pitcher-1440.png) |

## 未検証・後続

iPhone実機、UI-02D専用WebKit、スクリーンリーダー、200%拡大は未検証。既存CIのWebKit保存・財務・進行を一覧専用Safariの証明にしない。リーグランキング、二軍ランキング、FIX-S3の精度整合はこのPRで完了認定しない。PR本文に対象headとCIの最終結果を記録する。

最終表示調整後：一覧11件の単独E2Eが成功。CSS読込順修正では影響する8件だけ再実行し成功。主要列の順序調整後は代表3幅の表示ケース3件と関連16件が成功し画像を更新。最新headのCIで全対象を再照合する。過去の実行件数は重複して合算しない。
