# UI-02B — 詳細編成・起用設定

基準main: `b98ffe0e27d28eef720ae8a0f95b7c4c175686cc`（PR #455反映後）。着手時とPR準備時にGitHubのmainを再照合した。仕様は `docs/DESIGN_SYSTEM.md`。UI-02Aの検証記録と既存の `RosterTab` → `MobileRoster` の共通描画経路、CSS読込順を確認した。

## 目的・変更範囲

編成概要から詳細設定へ進み、起用と編成の変更を確認して概要・試合へ戻れるようにする。

- 既存のdetails入口を残し、野手・投手・方針の対象を表示。上下に「編成概要へ戻る」を追加し、閉じたsummaryへフォーカスを戻す。変更は既存stateへ随時反映されると説明し、保存済みを捏造しない。試合への導線は既存「ホーム」メニューを使用する。
- DES-01のネイビー見出し、白い設定面、青い操作、14pxの一覧、16pxの主操作、44px以上の操作領域。`Button` / `DataTableFrame` と既存トークンを再利用。
- 野手の全列と打順・上下移動・守備・DH・強化・コンバート・降格を維持。PCは打順と名前を固定。760px以下は名前だけを固定し、守備selectの全体を露出・クリックできる幅を確保する。全列を表内の横スクロールで閲覧できる。
- 先発の追加・上下移動・削除、役割別継投、優先順の追加・上下移動・削除、既存自動編成を維持。操作ラベルに選手名と対象を付け、方針rangeには現在の方針名を読み上げ用に設定する。
- 一括自動編成は既存のプレビュー→検証→反映を維持し、未反映の説明と候補打線・先発を追加。制約エラー・注意、昇降格推薦、個別実行・全実行・キャンセルは残す。
- `rosterSettingMetrics`は表示ガードだけ。AVG/OPS/ERA/WHIPは既存のformatter/計算を使用し、分子・分母欠落は「未記録」、分母0は「算出不可」、実測OPS0/ERA0は0.000/0.00。能力・状態・モラル0を欠落へ変換しない。共通fmtEraの仕様は変更しない。

ゲームロジック、編成制約、Worker、更新callback、保存形式、ナビIDは変更していない。負傷打順の禁止は既存selectのguardを上下ショートカットにも表示した。二軍育成・会話は元の描画・操作を残し、`roster-settings-ui`のCSS対象に含めない。選手詳細・比較・成績の全面移行、FIX-S3の計算精度の変更は対象外。

## 検証

- RED: 新規コンポーネントテスト4件で戻り導線・名前付き操作・実測0・未記録の不足を修正前に確認。レビュー後、スマホ固定列の配置テストのREDと守備selectの実測遮蔽を確認して修正。
- Vitest: `npx vitest run src/components/rosterSettingsDesign.test.js src/components/mobileRosterDesign.test.js src/components/mobileFlow.test.js src/components/tacticalRosterRoute.test.js src/engine/__tests__/rosterAutomation.test.js src/hooks/useSeasonFlow.cpuRoster.test.js` — 33件成功。追加の`npm test`でも1049件成功・既存条件付きskip 2件。
- Playwright: `npm run test:e2e -- match-history.spec.js --grep 'UI-02[AB]' --workers=1 --retries=0` — 21件成功（UI-02A 10件＋UI-02B 11件）。
- UI-02Bの7幅（360/390/760/761/1023/1024/1440px）×6状態（通常・長い名前・未記録・実測0・空・負傷）。各移行済みパネルを表示している間にページ横溢れと44px操作を計測。固定列・守備selectの全体露出と実クリック、スクロール領域のキーボードフォーカス、概要へ戻るフォーカスを確認。二軍・会話の到達も確認。
- 実Appの360/390/1440px: 方針と編成モード、DHあり/なし、自動打線、打順、守備重複警告と復元、先発順変更・削除・追加、抑え変更・重複役割の禁止、中継ぎ優先順の追加・移動・解除、自動投手、一括プレビューが未反映であることと適用を確認。変更→実1試合→保存→ロードでteams一致→実もう1試合で第3戦・二軍第3roundまで再開。UI-02A実昇降格テストで負傷候補・登録クールダウンを回帰確認。
- 空の組織で一括プランの反映不可理由・無効button・キャンセルを確認。
- 初回CIでは旧F03テストが「二軍へ」の操作ラベルを二軍タブと同時に拾い、PCでstrict mode違反になった。ローカルでもREDを再現し、タブ選択の範囲を既存toolbarへ限定した。二軍記録・保存再開・選手詳細のassertionは変更していない。`npm run test:e2e -- progression.smoke.spec.js --grep 'F03 farm records' --workers=1 --retries=0`の360/390/1440px 3件が成功。
- build成功（既存の500kB超チャンク警告）。全Vitest・中核E2Eは同一headのCIで確認する。CI設定・依存・旧assertion・retriesは維持。UI-02Aの降格操作の照合は新しい選手名付きラベルに更新した。

初回の表示検証でUI-02Aの省略fixtureを流用したところ、旧二軍画面に必要なpitchingが欠けて画面が停止した。新規fixtureは既存new-game保存fixtureの自球団を全項目そのまま抜粋し、ゲーム側の処理は変更しなかった。並行したローカルPlaywright実行でartifact競合も発生したため、その結果は成功認定せず、最終の単独実行結果を使用する。

独立レビューで固定列の遮蔽、パネル別レイアウト計測漏れ、投手操作ラベルを指摘・修正。継投優先順の実操作と方針の読み上げ値を追加した。

初回CIの他2系統はUbuntu依存パッケージの取得遅延により15分で中断し、1系統はテスト開始前に停止した。成功済みジョブと中断・失敗を分けて扱い、最終CIはPRの最新headで照合する。

## 変更前後の画像

Chromium 141。固定の同じnew-game自球団・2026年・通常状態で比較。ブラウザ環境にはIPAゴシックを導入し、日本語OSフォールバックを使用。画面全体のフォント・依存は変更しない。要素全体画像は内容高さまでの表示であり、初期viewportの可視範囲の保証とは区別する。

| 幅 | 野手 前 / 後 | 投手 前 / 後 |
|---|---|---|
| 360px | [前](../validation/ui02b/before-batters-360.png) / [後](../validation/ui02b/after-batters-360.png) | [前](../validation/ui02b/before-pitchers-360.png) / [後](../validation/ui02b/after-pitchers-360.png) |
| 390px | [前](../validation/ui02b/before-batters-390.png) / [後](../validation/ui02b/after-batters-390.png) | [前](../validation/ui02b/before-pitchers-390.png) / [後](../validation/ui02b/after-pitchers-390.png) |
| 760px | [前](../validation/ui02b/before-batters-760.png) / [後](../validation/ui02b/after-batters-760.png) | [前](../validation/ui02b/before-pitchers-760.png) / [後](../validation/ui02b/after-pitchers-760.png) |
| 761px | [前](../validation/ui02b/before-batters-761.png) / [後](../validation/ui02b/after-batters-761.png) | [前](../validation/ui02b/before-pitchers-761.png) / [後](../validation/ui02b/after-pitchers-761.png) |
| 1023px | [前](../validation/ui02b/before-batters-1023.png) / [後](../validation/ui02b/after-batters-1023.png) | [前](../validation/ui02b/before-pitchers-1023.png) / [後](../validation/ui02b/after-pitchers-1023.png) |
| 1024px | [前](../validation/ui02b/before-batters-1024.png) / [後](../validation/ui02b/after-batters-1024.png) | [前](../validation/ui02b/before-pitchers-1024.png) / [後](../validation/ui02b/after-pitchers-1024.png) |
| 1440px | [前](../validation/ui02b/before-batters-1440.png) / [後](../validation/ui02b/after-batters-1440.png) | [前](../validation/ui02b/before-pitchers-1440.png) / [後](../validation/ui02b/after-pitchers-1440.png) |

実Appの操作後画像: [360px](../validation/ui02b/actual-settings-360.png) / [390px](../validation/ui02b/actual-settings-390.png) / [1440px](../validation/ui02b/actual-settings-1440.png)。

## 残課題・引継ぎ

iPhone実機・詳細設定専用Safari/WebKit・スクリーンリーダー・200%拡大・全所属/全異常状態は未検証。新規E2Eは既存CI対象のmatch-historyへ登録したが、WebKit projectの対象は変更していない。CI外の全E2E・複数seed長期検証は今回の完了認定に含めない。

次工程は選手詳細・比較・成績の段階的な移行。既存selector、年度/一軍/二軍の記録範囲、未記録/実測0を再確認し、計算精度(FIX-S3)や二軍育成・会話の刷新は別工程で扱う。
