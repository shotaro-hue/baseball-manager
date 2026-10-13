# 結果画面の相手打率参照修正

基準: main `fade70dd427f46638e9474c6fab462f1fe87bedc`（#461反映）。

## 再現・原因

開幕fixtureを既存保存APIでロードし、390pxの実Appから1試合のオートシムを実行。
相手打者のAVGを取得し、ホームへ戻って保存した相手選手のAB/Hと照合した。
修正前は打数あり・H=0の選手が `.000` ではなく `.---` と表示され、E2Eが失敗。

`singleDayCore` は試合前の `currentOpp` を結果へ保持する。一方、試合後の成績は
`nextState.teams` へ反映される。ResultScreenは前者を優先し、playerIdentityも
preferredTeam内の同一IDを先に返すため、今季AVGが試合前の値になっていた。

## 変更・非対象

ResultScreenは相手球団ID（0も有効）で現行teamsを参照し、見つからない場合だけ
旧スナップショットへフォールバック。AVGの既存「今季」定義を維持する。
ゲーム処理・集計・Worker・保存形式・共通playerIdentity・丸め精度は変更しない。

## 検証

- 新規unit: 開幕／途中のスナップショット、ID=0、実測0、打数0、欠測、旧履歴fallback。
  修正前3失敗、修正後4成功。近傍と合わせて25成功。
- 新規実App E2E: 修正前失敗→修正後1成功。結果表示と保存AB/Hを照合、保存再開でteams一致。
- 新規E2Eを通常CIのmatch-historyへ追加。既存specは維持。
- 手動采配・全自動シーズン・iPhone実機はこの追加E2Eでは未検証。
- 全unit/build/中核E2EはPRの同一SHA CIで別途確認。
