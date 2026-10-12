# UI-01A — 共通基盤の最小実装

基準: main d08e5a1002bae266df46a135fcda5c471009feae。仕様: docs/DESIGN_SYSTEM.md と2026-10-12統合開発指示書。

目的はホーム・結果で使う表示部品の共有。画面構成の刷新はUI-01B/Cに残す。既存ナビ、操作ハンドラ、数値計算、保存形式は変更しない。

## 実装計画

- [x] RED: Buttonの操作/無効、StateLabelの処理/失敗、MetricBandの0/未記録/算出不可、Sectionの見出し、DataTableFrameの局所スクロールとラベルをReactで検証。
- [x] GREEN: `src/components/design-system/primitives.jsx` と `foundation.css`。CSSは専用 `data-ds` スコープのみに適用。依存追加なし。
- [x] 既存利用: MobileHomeの主操作・要約・要確認見出し・進捗、DashboardTabの主副操作・打線表枠、ResultScreenの戻る操作・進捗・イニング表枠。既存データ/コールバックへ委譲。
- [x] 検証: 対象Reactテスト、build、Chromium実ゲームのホーム/結果/戻る/保存再開、360/390/1440と760/761/1023/1024境界、前後画像・旧画面CSS比較。

## 部品の契約

- Button: native button props、variant primary/secondary。既存classNameも保持。
- StateLabel: tone neutral/success/warning/danger/processing、具体的な文字は呼出側から渡す。成功状態を生成しない。
- MetricBand: `items=[{label,value,unit,state,reason}]`。value0を保持、nullはstateで未記録/算出不可/対象外を説明。数値は呼出側で既存formatterにより整形。
- Section: title、headingId、children。囲いを増やさず見出しと区切り。
- DataTableFrame: label、stickyColumn(1/2)、childrenの実table。ソートや集計を担当しない。数値セルはdata-number属性で右揃え。

将来の用途: MetricBandはPCホーム/最終スコアにも利用可能。StateLabelは公開された保存実状態へUI-01Bで接続。Section/表枠は結果の打者・投手成績へUI-01Cで展開。旧結果の公式投手判定統一はFIX-S4。


## 最新mainとの照合と分類

#430/431/433〜446は履歴と現行コードで確認。#436/DES-01はマージ済み。ROADMAPに残る#436反映待ち記述は過去時点。旧Calm UIは実装済み、新DES-01トークン・部品は未実装だったため本PRで追加。CSS順はAppのstyles→HubShellのcalm-ui/mobile-flow（detail/resultsをimport）、Result単独ではmobile-flow。新CSSはdata-ds属性に限定し、旧!importantを増やさず、表のインライン指定はイニング表の専用styleのみ整理。旧打者/投手表、シェル、ナビは維持。

## 検証結果

- 新部品未存在のRED→4件GREEN。既存ホーム・結果・シムパネルを含む対象5ファイル34件成功。
- fast130ファイル916件成功、既存の条件付きskip2。build成功（既存の500kB以上chunk警告）。
- Chromium実fixture保存→ロード→モバイルのまとめ設定開閉／PCの選手選択と成績表示→実1試合オートシム→結果表の書体/数値右揃え→既存戻る→手動保存→再ロード一致：360/390/1440の3ケース成功。
- 状態/0/算出不可/長い名前/表の局所スクロール/固定セル選択面/キーボード操作の1ケース成功。計4 E2E成功、console pageerrorなし。
- 360×800・390×844・1440×900と760/761/1023/1024境界の14表示状態で全体横はみ出し0。新Buttonは16px文字・高さ48.39px。編成画面のcomputed styleは前後一致。
- 独立レビューの重要指摘1件（イニング表の旧inline書体・色・揃え）を修正。実試合のResultScreenで再確認、重大指摘残0。

[前レイアウト](../validation/ui01a/before/layout.json)／[後レイアウト](../validation/ui01a/after/layout.json)。前後は同一の既存new-game保存fixtureと固定結果fixtureを使用。結果画像は描画比較用の合成試合、実試合・保存検証は上記E2Eで別途実施。画像だけで実シム成功と扱わない。

|画面|360 前→後|390 前→後|1440 前→後|
|---|---|---|---|
|ホーム|[前](../validation/ui01a/before/home-360.png) / [後](../validation/ui01a/after/home-360.png)|[前](../validation/ui01a/before/home-390.png) / [後](../validation/ui01a/after/home-390.png)|[前](../validation/ui01a/before/home-1440.png) / [後](../validation/ui01a/after/home-1440.png)|
|結果fixture|[前](../validation/ui01a/before/result-360.png) / [後](../validation/ui01a/after/result-360.png)|[前](../validation/ui01a/before/result-390.png) / [後](../validation/ui01a/after/result-390.png)|[前](../validation/ui01a/before/result-1440.png) / [後](../validation/ui01a/after/result-1440.png)|

再取得: `node scripts/capture-ui-foundation.mjs after`。beforeは基準mainのworktreeに同じe2e/fixtures/ui01aと取得スクリプトを置いて実行。通常のregressionは `npm run test:e2e -- ui-foundation.spec.js --project=chromium --workers=1 --retries=0`。新E2Eは通常CIの既存対象を変更せず追加のローカル/手動フル検証。

未検証: iPhone実機・Safari/WebKit・読み上げ・200%拡大・全タブ全状態。新5部品の代表状態を検証し、旧UIの全問題が解消したとはしない。ヘッダー保存表示は既存のまま、StateLabelの保存成功/失敗は表示fixtureでのみ検証し、未公開の実保存成功を画面に作らない。既存トップバー40px等の全旧操作領域はUI-01B/Cで扱う。CIは公開PRの同一commitで別途確認。
