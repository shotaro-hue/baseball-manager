# ROADMAP — NPB Franchise Manager

> 最終更新: 2026-10-16（PR #472マージ反映、FIX-S3 OPS精度・履歴表示整合性）
> 目的: **OOTP / Football Manager のように「何年も遊べる、意思決定が積み重なる経営シミュレーション」**を作る。

> 現在の進捗は第1節を参照。第2・3・5節の旧チェックリストと期日は2026-05-01時点の履歴であり、現在の完了認定ではない。UI/UX改革の一次監査・推奨PR分割は [全体改革の青写真 v1](./docs/REFORM_BLUEPRINT_V1.md)、現行の設計方針は [UI/UX設計基準](./docs/DESIGN_SYSTEM.md) を参照。着手時には最新mainと再照合する。

---

## 0. プロダクトの北極星（立ち返り）

このゲームの面白さは、次の4つが同時に成立したときに生まれる。

1. **不確実性**（情報が完全ではない）
   - スカウト情報は誤差を含み、実力は試合と時間でしか確定しない。
2. **トレードオフ**（何かを取れば何かを失う）
   - 今勝ちに行くか、将来へ投資するか。資金、枠、育成時間が常に不足する。
3. **連続性**（1年で終わらない）
   - 選手の成長・衰退・契約・引退・球団史が繋がり、意思決定に履歴が残る。
4. **人間性**（数字だけで終わらない）
   - モラル、首脳陣、メディア、ファン、オーナー評価が勝敗以外の圧力を生む。

以後の機能追加は「この4つを強化するか？」を採用基準にする。

---

## 1. 現在地サマリ

照合日：2026-10-16（日本時間）。基準main：`5ec2e7672115bb2a4fac2f54a4c00b8818ff7fb1`（PR #472マージ後）。Git cloneとGitHub mainのSHAを照合。QA-D1は#472でマージ済み、FIX-S3は本ブランチで実装・検証しPRでレビューする段階（未マージ）。各工程の対象範囲・実測・限界は[QA-D1](./docs/implementation/qa-d1.md)・[FIX-S3](./docs/implementation/fix-s3.md)を参照。全機能・全年度・実機の完了認定ではない。

**二軍の実測基盤は実装・マージ済み。CPUの編成判断は段階的に改善中。新デザインの全画面移行と長期バランスの完了には至っていない。**

### mainへ反映済みの成果

| 項目 | 完了した範囲 | 根拠PR |
|---|---|---|
| 保存整合性 F3-B | 通算履歴の保存世代統合、年度更新・新規ゲームの保護 | [#430](https://github.com/shotaro-hue/baseball-manager/pull/430) |
| テスト運用 | 棚卸し、Workの段階的検証、CI分割 | [#431](https://github.com/shotaro-hue/baseball-manager/pull/431) |
| DOC-01 | 開発・UI/UX方針の正本と運用基準を整備 | [#433](https://github.com/shotaro-hue/baseball-manager/pull/433) |
| FIX-T | トレードの金額・逆提案・成立時検証 | [#434](https://github.com/shotaro-hue/baseball-manager/pull/434) |
| FIX-D | 手動／全自動ドラフトの抽選・登録枠・保存再開 | [#435](https://github.com/shotaro-hue/baseball-manager/pull/435) |
| F-01 | 二軍日程・選考・軽量試合ドメイン | [#437](https://github.com/shotaro-hue/baseball-manager/pull/437) |
| F-02 | 独立記録、旧セーブ移行、保存復元・年度遷移 | [#438](https://github.com/shotaro-hue/baseball-manager/pull/438) |
| F-03 | 通常進行・Worker・保存と二軍実測の接続、最小閲覧 | [#439](https://github.com/shotaro-hue/baseball-manager/pull/439) |
| F-04 | 年度ランキング・実測表彰・archive、旧pending表示互換性 | [#440](https://github.com/shotaro-hue/baseball-manager/pull/440) |
| 編成の補足修正 | 初期捕手配置、複数故障時の二軍補充、日々の全自動管理での捕手確保 | [#441](https://github.com/shotaro-hue/baseball-manager/pull/441)、[#442](https://github.com/shotaro-hue/baseball-manager/pull/442)、[#443](https://github.com/shotaro-hue/baseball-manager/pull/443) |
| CPUドラフトの補足修正 | 確定指名を次巡へ反映。投手は一軍＋二軍＋確定指名の役割人数・先発年齢層を評価 | [#444](https://github.com/shotaro-hue/baseball-manager/pull/444)、[#445](https://github.com/shotaro-hue/baseball-manager/pull/445) |
| DES-01 | 正式デザインシステムと承認代表画面を確定。全画面移行は別工程 | [#436](https://github.com/shotaro-hue/baseball-manager/pull/436) |
| AI-01／AI-02 | 一軍運用・組織層・確定指名の読取専用評価、CPUドラフトの投手役割別判断 | [#447](https://github.com/shotaro-hue/baseball-manager/pull/447)、[#451](https://github.com/shotaro-hue/baseball-manager/pull/451) |
| FIX-S1／S2 | 降格選手の一軍ランキング・実測0、球団比較の成績・全所属契約年俸を整合 | [#448](https://github.com/shotaro-hue/baseball-manager/pull/448)、[#450](https://github.com/shotaro-hue/baseball-manager/pull/450) |
| UI-01A／B／C | 最小共通部品、スマホ・PCホーム、保存表示・共通進行設定、1試合結果を実装 | [#449](https://github.com/shotaro-hue/baseball-manager/pull/449)、[#452](https://github.com/shotaro-hue/baseball-manager/pull/452)、[#454](https://github.com/shotaro-hue/baseball-manager/pull/454) |
| UI-02A | 一軍・二軍の共通編成概要を移行。詳細設定・選手分析の全面移行は別工程 | [#455](https://github.com/shotaro-hue/baseball-manager/pull/455) |
| UI-02B | 野手・投手・共通の起用設定、自動編成確認、編成概要への復帰をDES-01へ移行 | [#456](https://github.com/shotaro-hue/baseball-manager/pull/456) |
| UI-02C | 選手詳細・2人比較をDES-01へ移行。記録範囲・欠測・キーボード・元画面への復帰を整備 | [#457](https://github.com/shotaro-hue/baseball-manager/pull/457) |
| UI-02D1 | 球団別一軍成績一覧を移行。記録条件・絞り込み・詳細／比較導線を整備 | [#458](https://github.com/shotaro-hue/baseball-manager/pull/458) |
| UI-02D2 | 一軍リーグランキングを移行。候補探索、指標・条件、詳細／比較導線を整備 | [#459](https://github.com/shotaro-hue/baseball-manager/pull/459) |
| UI-02D3 | 二軍ランキング・年度別記録を移行。実績球団と現在所属、記録から現役詳細・起用への導線を整備 | [#460](https://github.com/shotaro-hue/baseball-manager/pull/460) |
| UI-02E | 二軍育成・起用、支配下登録、既存一軍会話を移行。制約理由・確認・フォーカス復帰を整備 | [#461](https://github.com/shotaro-hue/baseball-manager/pull/461) |
| UI-01D | まとめシム結果・詳細復帰・編成見直し導線をDES-01へ移行。保存表示と打撃ハイライトの接続不整合は#464で修正 | [#463](https://github.com/shotaro-hue/baseball-manager/pull/463) |
| FIX-R1 | まとめシムの共通保存追跡・実ログの遅延集計・部分履歴失敗表示と再試行を整合 | [#464](https://github.com/shotaro-hue/baseball-manager/pull/464) |
| 結果画面の相手AVG | 試合後の現行球団の今季AB/Hを参照。開幕単試合オートと保存再開を検証 | [#462](https://github.com/shotaro-hue/baseball-manager/pull/462) |
| FIX-S4 | 結果画面のW/L/Sを既存ボックススコア判定へ接続。公式成績と表示を照合 | [#453](https://github.com/shotaro-hue/baseball-manager/pull/453) |
| UI-01E | 日程・球団詳細の試合履歴と保存ボックススコアをDES-01へ移行 | [#465](https://github.com/shotaro-hue/baseball-manager/pull/465) |
| UI-03A／B | オフシーズン編成・契約更改を移行し、方針表と契約更改を全選手の1一覧へ統合。可逆の放出候補・獲得済み表示・保存復帰を整備 | [#466](https://github.com/shotaro-hue/baseball-manager/pull/466)、[#468](https://github.com/shotaro-hue/baseball-manager/pull/468)、[#469](https://github.com/shotaro-hue/baseball-manager/pull/469) |
| UI-03D | 成長レポートを短い一覧・絞り込み・個別内訳へ整理。狭い埋め込みと復帰を整備 | [#467](https://github.com/shotaro-hue/baseball-manager/pull/467) |
| UI-03C | FA市場を契約更改と共通の一覧・個別条件確認・復帰へ移行 | [#470](https://github.com/shotaro-hue/baseball-manager/pull/470) |
| ドラフト評価・指名体験 | 公開／自球団レポート、調査通算、比較・確認・復帰、競合判断、指名時所見 | [#471](https://github.com/shotaro-hue/baseball-manager/pull/471) |
| QA-D1 | 通常生成20seed六巡・3seed×3年・42保存再開、候補一覧の性能・位置同期修正。最終head CI全8ジョブ成功 | [#472](https://github.com/shotaro-hue/baseball-manager/pull/472) |

PR #432は未マージでクローズ。テスト運用の成果は#431として記録し、重複して数えない。

### 残っている範囲

| 項目 | 現在の状態 | 次に確認・実施する範囲 |
|---|---|---|
| CPU編成・補強AI | 部分完了 | FA・契約更改・戦力外にも二軍の人数・役割を考慮する判断が必要か、現行処理から確認する。#444/#445だけで補強AI全体を完了扱いにしない |
| ドラフト評価・指名体験 | #471でマージ済み | 公開／球団別観測、1位からの調査通算、比較・確認・復帰、CPU競合判断、指名時所見が対象範囲。QA-D1で通常生成20seedの六巡・12球団分布を追加測定。実機QA・長期バランス完成とは区別。[実装](./docs/implementation/draft-decision.md)／[QA-D1](./docs/implementation/qa-d1.md) |
| 長期検証・二軍バランス | 一部検証済み | 実1シーズン観測と合成5/20年容量検証を実施。複数seed・実複数年での編成維持、出場数・疲労・未実施率、実端末負荷を確認する |
| FIX-S | S1/S2/S4は上記範囲で完了。S3は本ブランチで実装・検証（未マージ） | OPSを生の成分から3桁へ統一し、年度の旧保存OPS・通算合算・主要画面を整合。CPUの従来2桁判断入力と保存形式を維持。欠測履歴の通算は確定値を作らない。[検証記録](./docs/implementation/fix-s3.md) |
| FIX-V/Mほか | 残課題の再調査待ち | 保存状態表示、財務・球場投資・収入予測等の疑義を再確認。既対応の契約年俸表示を再実装しない |
| DES-01 | 正式仕様はマージ済み | #436の確定と、各画面への移行完了を区別する |
| QA-D1 | #472でマージ済み。20seed六巡・3seed×3年・42保存再開を検証 | Chromium/WebKit 360/390/1440と性能比較を追加。検証範囲のP0なし、スクロール・順位計算・復帰と直後のキーボード保存の位置同期を修正。二軍捕手不足と登録枠充足、iPhone実機未確認を残す。独立PR・最終head CIは[記録](./docs/implementation/qa-d1.md)を参照 |
| UI-01〜03／QA-01 | 新方針での移行完了は未確認 | UI-01・UI-02とUI-03A/B/Dは上記範囲でマージ済み。方針一覧との統合は#469でマージ済み。FA市場UI-03Cは#470でマージ済み。ドラフトの初回範囲は#471でマージ済み。経営、UI-03全体、総合QAは未完了 |
| UI-01E | #465でマージ済み | 日程・結果、球団詳細の日程タブ、保存ボックススコアをDES-01へ移行。年度・日付・視点、未記録・実測0・部分記録と復帰を検証。[記録](./docs/implementation/ui-01e.md) |
| UI-03A | #466でマージ済み | オフシーズン編成の概要・方針一覧・結果確認・確認ダイアログをDES-01へ移行。保存失敗／再試行、実放出・FA予算・契約下書き保持を検証。[記録](./docs/implementation/ui-03a.md) |
| UI-03D | #467でマージ済み（対象範囲の移行完了） | 成長レポートの短い一覧・表示フィルター・選んだ1人の内訳、狭い埋め込みとスクロール／フォーカス復帰まで。成長計算・保存形式は維持。Safari/WebKit・実端末・総合QAの完了認定は含めない。[確定要件・記録](./docs/implementation/ui-03d.md) |
| UI-03B | #468でマージ済み（対象範囲の移行完了） | 契約更改の比較一覧、入力・確認・返答、折り畳み、一括下書き、復帰をDES-01へ移行。既存の交渉判定と保存形式を維持し、独立経路の既存session／view保存を接続。[記録](./docs/implementation/ui-03b.md)。最終head CIはPR本文に記録 |
| UI-03A/Bフォローアップ | #469でマージ済み | 方針表と更改の一覧統合、継続契約を含む比較、可逆の放出候補、重複概要の整理、獲得済み契約と成績の出所、フォーカス復帰。[検証記録](./docs/implementation/planning-unified-roster.md)。ゲーム処理・保存形式は維持 |
| UI-03C | #470でマージ済み（対象範囲の移行完了） | FA市場を更改と同じ一覧／個別条件・確認・復帰へ整理。主要成績と年俸の比較、詳細折り畳み、埋め込み概要の重複除去、自球団との比較選択をDES-01へ移行。既存契約ルール・先払い・保存形式は維持。[記録](./docs/implementation/ui-03c.md) |
| 経営・QA-01 | 未完了 | 経営のDES-01移行、旧CSS整理・総合QAは別工程。FA市場・ドラフトの対象範囲の実装だけでUI-03全体を完了扱いにしない |

健康な捕手が球団全体で2人だけのケースは、一軍2人を優先すると二軍カードが未実施となり得る。#443の実143round観測では69カードが該当した。この1ケースや、合成長期履歴の保存成功を「全試合成立・実20年プレイ・バランス完成」の証明にしない。詳細は [F-04検証記録](./docs/farm-f04-validation.md) と [日次捕手配置の検証](./docs/daily-farm-catcher-coverage.md) を参照。

### 次の作業順（候補。実装許可や確定仕様ではない）

1. FIX-S3の独立PRで最終headのCIと旧履歴互換性を確認する。マージはユーザーが判断する。
2. 二軍捕手不足の原因分析。QA-D1で実測した健康な捕手0人の未実施を、昇降格・負傷・保有人数別に分解する。原因未確定を修正済みとしない。
3. 経営画面のDES-01移行。既存判断・財務ルールの変更とは分ける。
4. CPU長期編成改善。FA・契約更改・戦力外、登録枠充足・役割・年齢構成の不足を測定してから改善する。
5. 二軍・長期プレイのバランスと実端末負荷を追加検証する。3シーズンを長期完成認定にしない。
6. 残るFIX-V/Mの疑義を再確認。Safari/WebKitエミュレーションとiPhone実機QAを分け、未実施を完了扱いにしない。

#470・#471・#472はマージ済み。#471の確定範囲は[要件](./docs/superpowers/specs/2026-10-15-draft-decision-design.md)・[実装記録](./docs/implementation/draft-decision.md)。QA-D1の最終headとActions結果は独立PR本文を正本とする。

**現時点の方針**: 大型機能の前に、プレイ体験の信頼性と「考える楽しさ」を優先する。

---

## 2. 当初の直近フォーカス（2026-05-01時点の履歴）

## Now（最優先: まず壊れない・嘘をつかない）

### A. シミュレーション信頼性の回復（P0/P1）
- [x] ドラフト指名反映の完全修正（全12球団・全巡目・重複制御）※2026-04-11対応
- [x] 投手成績集計の整合性修正（BF/WHIP/先発判定）※2026-04-11対応
- [x] 外国人960日到達後の国内扱い自動移行 ※2026-04対応

**完了条件**
- 10年オート検証で進行停止・主要集計崩壊が0件
- 主要アワード/タイトルが統計と矛盾しない

### B. 編成UIの意思決定体験改善（P1）
- [x] ロースター操作の誤操作防止（打順/守備/DHバリデーション）※2026-04-12対応
- [x] 投手管理画面の統合（情報分散を解消）※2026-04対応

**完了条件**
- 1週間シム前に必要な操作が1画面で完結
- 初見プレイヤーが「なぜこの結果になったか」を追跡可能

---

## Next（その次: 長期プレイの中毒性を上げる）

### C. スプリングトレーニング導入
- [x] 2〜3月の実戦評価フェーズ（キャンプレポート画面）
- [x] 開幕ローテ/開幕一軍の競争イベント化（ポジション争いUI・選手比較タブ）
- [x] 一時的コンディション変動と期待値調整（±15変動・台頭+20・不調-15）

**狙い**: 「開幕前にも意思決定がある」状態を作り、毎年のマンネリを防ぐ。

### D. CPU球団フロントAIの深化
- [x] 買い手/売り手判定を順位だけでなく年齢構成・契約残年数でも判定
- [x] 将来価値（prospect value）を加味したトレード判断
- [x] 再建期の一貫戦略（高齢選手売却→若手育成→勝負年）

**狙い**: 人間プレイヤーが「リーグ全体と戦っている」感覚を作る。

---

## 3. 当初のマイルストーン（履歴。期日経過を完了とみなさない）

## M1: Gameplay Integrity（〜2026-05）
- P0/P1不整合バグ修正完了
- 自動検証シナリオ（1年/5年/10年）を定例化
- 既知の進行阻害バグをゼロ化

## M2: Decision UX（〜2026-06）
- ロースター/投手運用UI統合
- 試合結果→編成修正→次戦準備の導線短縮
- 「原因→結果」の可視化カード追加

## M3: Franchise Depth（〜2026-08）
- スプリングトレーニング
- CPUフロントAI強化
- 複数年でのリーグ物語（王朝/再建/スター流出）の発生率向上

## M4: Expansion Readiness（〜2026-10）
- カスタムチーム作成
- 統計エクスポート（CSV/JSON）
- パフォーマンス/モバイル最適化の着手

---

## 4. 優先順位ルール（実装判断の基準）

新規機能は以下で評価し、上から順に優先。

1. **没入阻害の除去**: バグ修正・整合性
2. **意思決定の質向上**: 比較・予測・検証しやすさ
3. **時間軸の面白さ**: 複数年で効いてくる仕組み
4. **演出強化**: 視覚的リッチさ（上記を満たした後）

---

## 5. 当初の具体バックログ（2026-05-01時点の履歴）

### P0（即対応）
- [x] ドラフト結果反映の完全性
- [x] 投手成績集計の正規化

### P1（短期）
- [x] 外国人枠の年数到達自動切替
- [x] ロースター/DHバリデーション
- [x] 投手・継投UI統合
- [x] スプリングトレーニング

### P2（中期）
- [x] CPU補強AIの戦略化
- [ ] 選手比較ツールの実戦投入
- [ ] モバイル最適化
- [ ] ゲーム速度設定

### P3（中長期）
- [ ] カスタムチーム
- [ ] コミッショナーモード
- [ ] 外部共有向け統計エクスポート強化

---

## 6. 開発運用ルール

- ROADMAPは**機能リスト**ではなく、**体験品質の約束**として扱う。
- 各項目は「実装したか」ではなく「面白さに寄与したか」で完了判定する。
- 週次で以下を確認:
  - 進行阻害バグ件数
  - 1シーズン完走率
  - テストプレイでの意思決定回数（悩める場面があるか）
  - 「来季も続けたい」と思えるかの主観評価

---

## 7. このROADMAPのゴール文（常にここへ戻る）

**「1試合の勝敗」よりも「5年後の球団像」を考えたくなるゲームにする。**  
それが、OOTPやFootball Managerに近い中毒性の核であり、本プロジェクトの最優先価値である。


### 物理演算打撃シミュレーション
- [x] Phase 1: EV/LA生成を能力値先行型に改善（2026-04-30）
- [x] Phase 2: EV/LA → 物理シム → 着弾ゾーンで結果逆算（2026-04-30）
- [x] Phase 3: lookup table 化 + モンテカルロ検証（2026-05-01）
