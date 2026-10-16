# 捕手層の編成方針：通常一軍3人・支配下6人

実施日：2026-10-16。実装時の基準main：`b0eaa58b02149af2e77073c3de495a14aa2b9779`（#474マージ後）。最新mainをfetchして開始し、添付ZIPは実装基準にしていない。PR作成時点では未マージだったが、同日の再照合で[#475](https://github.com/shotaro-hue/baseball-manager/pull/475)のマージを確認した。マージcommitは`cd02b4503fefb839095805e8a0dd7443a23d46ad`。[マージ後のレビューと次工程](./catcher-depth-review.md)を参照。

## 目的と根拠

#474の[原因分析](./farm-catcher-shortage.md)では9シーズンの未実施223/7,722カードがすべて健康捕手2人だった。従来の保有目安3人では1人負傷で二軍へ残せない。一方、一軍の最低2人を通常人数へ読み替えるのも適切ではないため、通常目標と緊急時の最低人数を分ける。

2026-10-16にNPB公式の「2026年度 支配下選手登録」の捕手欄と加入・抹消を照合。育成を除く公式登録位置の人数であり、捕手守備の実際の専任人数や当日の健康人数ではない。

| 球団・公式資料 | 支配下捕手 | 一軍3人を仮定した残人数 |
|---|---:|---:|
| [阪神](https://npb.jp/announcement/2026/registered_t.html) | 9 | 6 |
| [DeNA](https://npb.jp/announcement/2026/registered_db.html) | 6 | 3 |
| [巨人](https://npb.jp/announcement/2026/registered_g.html) | 6 | 3 |
| [中日](https://npb.jp/announcement/2026/registered_d.html) | 6 | 3 |
| [広島](https://npb.jp/announcement/2026/registered_c.html) | 6 | 3 |
| [ヤクルト](https://npb.jp/announcement/2026/registered_s.html) | 7 | 4 |
| [ソフトバンク](https://npb.jp/announcement/2026/registered_h.html) | 7 | 4 |
| [日本ハム](https://npb.jp/announcement/2026/registered_f.html) | 9 | 6 |
| [オリックス](https://npb.jp/announcement/2026/registered_b.html) | 8 | 5 |
| [楽天](https://npb.jp/announcement/2026/registered_e.html) | 7 | 4 |
| [西武](https://npb.jp/announcement/2026/registered_l.html) | 7 | 4 |
| [ロッテ](https://npb.jp/announcement/2026/registered_m.html) | 6 | 3 |

合計84人、平均7人、9/12球団が6〜7人。一軍3人を引いた平均は4人。右列は故障・リハビリ・兼任を含む推計であり、実際の二軍出場可能人数ではない。ゲームではこの分布の下限側の6人を補強基準に採用し、既存の枠・予算内で層を増やす。7人への強制充足や上限は設けない。

## 実装

- `MIN_ACTIVE_CATCHERS=2`を維持し、`TARGET_ACTIVE_CATCHERS=3`を追加。FULL編成では通常3人を目指す。健康捕手適性選手が全体で3人なら一軍2人＋二軍1人、2人以下なら一軍を優先する。副位置・育成・登録待機中の健康捕手が二軍で出場可能な既存条件を維持する。
- 通常目標への昇格と余剰返却では、他の守備位置を欠かさないことを確認する。既存の登録待機・外国人制約を迂回しない。復帰後に3人へ戻せる日は定期入れ替え前でもFULL更新する。手動・緊急モードの健康な所属やラインアップだけの更新は従来どおり。
- 組織の支配下主捕手基準を3→6人へ変更。初期生成は既存のランダム生成枠の重複位置から確保する。全選手数、実在選手の位置・能力、乱数・ID消費を増やさず、他の生成位置の最後の1人を奪わない。通常の初期入力では実データ・代替生成とも100seed×12球団で6人以上と有効な一軍・二軍を確認する。
- `analyzeTeamNeeds()`では支配下人数、健康人数、登録可能人数を分ける。育成両フラグを支配下の層へ数えず、六人保有でも健康2人なら補強需要を検出する。健康な二軍からの昇格だけで足りる場合は一軍所属不足だけを理由に外部補強を要求しない。既存のドラフト・FA・トレードがこの判定を参照する。点数係数や契約交渉式は変更しない。
- 受諾済み指名は既存の入団時と同じ支配下契約として将来層へ計上し、6人に達した後の捕手加点を止める。候補の育成フラグは仮集計のコピーだけで解除し、実候補や所有・保存を変更しない。
- FA市場の補足説明に通常3・最低2・支配下合計6の区別を表示し、支配下の不足人数から育成を除く。レイアウト・操作・契約条件は維持する。

## 保存・影響範囲

保存スキーマやロード時の移行を追加しない。旧セーブに新しい捕手を生成したり、保有選手の位置・能力を書き換えたりしない。旧3人保有セーブはその層のままロードし、FULL編成と以後の既存補強経路で扱う。自球団へ自動契約を追加しない。

初期の生成位置・昇降格・指名需要が変わるため、同じ乱数seedでもシーズン結果や負傷の発生経路は変わる。打撃・負傷確率・成長・契約更改の式を変えたものではない。初期同等性snapshotは位置・所属の意図した変更に合わせて更新し、3seedの乱数消費回数16,910 / 16,894 / 16,879が不変であることを確認した。同期・非同期の初期生成も全データ一致する。

## 回帰検証

新規12件の再現試験は修正前に9件RED、修正後12件GREEN。後から旧セーブの実保存・再開と確定指名の回帰を追加した。独立レビューで指名候補の育成フラグによる仮集計の不一致を検出し、順位の等価比較でREDを確認して修正した。

初期配置は実データ100seed・代替生成100seedの各12球団で検証。人数・ID一意性・一軍の有効性・二軍出場可能性を維持する。生成位置予約では能力と次の乱数まで比較する。

既存の捕手指名試験は「2人＋指名1人で旧3人を満たす」から「5人＋指名1人で新6人を満たす」へfixtureを変更し、重複加点停止・拒否・他球団・保存再開のassertionを維持した。初期編成変更により従来seedの偶発的な二人目負傷や捕手不足が発生しなくなる2試験は、負傷条件を明示して同じ進行・観測同一性のassertionを維持する。

最初の全Unit実行では旧閾値fixture、上記の偶発条件、保存失敗再試行の1件で失敗を検出。修正後ソースで再計測するため長期実行を中断した。この中断を9シーズン完了に数えない。保存失敗試験は対象単独では成功したが、最終全体実行の結果を確認する。

実ブラウザでは初期保存障害からの再試行、確定指名保存・再開、E6の実Worker5試合・二軍カード・保存再開の3ケース成功。最終PR headの全品質ゲートはPR本文のActions結果を正本とする。

最終ローカル計測：3seed×3年の1,287round、二軍7,722カード中未実施0件。3seedとも2026/2027/2028年はそれぞれ0/0/0件。旧#474の223件とは同seedでも初期所属・試合・補強・乱数経路が分かれるため、一般的な改善率や対になった実験とはしない。42保存再開・所属ID排他・契約・70枠・年度更新・一軍各143試合・二軍archive/通算履歴の既存assertionは成功した。初年度の支配下主捕手は全36球団とも6人、翌年開幕は6〜8人、3年目は6〜11人だった。

[集計JSON](../validation/catcher-depth/summary.json)／無損失圧縮の全観測：[seed15](../validation/catcher-depth/seed-20261015.json.gz)・[seed16](../validation/catcher-depth/seed-20261016.json.gz)・[seed17](../validation/catcher-depth/seed-20261017.json.gz)。計測対象ソースのSHA-256を現行ファイルと照合し、gzip往復一致と圧縮前後のSHA-256を記録した。

```bash
FARM_CATCHER_DIAGNOSE=1 FARM_CATCHER_EVIDENCE_DIR=docs/validation/catcher-depth FARM_CATCHER_BASE_SHA=b0eaa58b02149af2e77073c3de495a14aa2b9779 npm test -- --maxWorkers=3 --minWorkers=1
npx vitest run src/engine/__tests__/catcherDepthPolicy.test.js
npm run test:e2e -- progression.smoke.spec.js initialization.spec.js draft.spec.js --project=chromium --grep 'E6 scheduled|saved first-round catcher|history without duplicate' --workers=1 --retries=0
```

ローカル全Unitの最終計測は171ファイル・1,261件成功、既存の任意benchmark2件skip、`src/App.lazy-load.test.js`のApp importが10秒timeoutで1件失敗（937.26秒）。同項目は並列再確認でもtimeoutしたが、Appだけの1worker実行は3/3成功（import 4,471ms）。閾値・テスト・CI設定は緩和していない。新規方針試験は両方の育成フラグを含め最終15/15成功、HubFaTabは21/21成功。Build成功（39.17秒、既存のchunkサイズ警告）。ローカル全Unitを全成功とは報告せず、最終headのCIで全Unitを改めて確認する。

その後、最終head `0839fb0f337c999092cccf2b60460ca628cce9d8` の[CI #409](https://github.com/shotaro-hue/baseball-manager/actions/runs/38893847391)でBuild・Unit 1,263件・中核E2E 292件を含む全8ジョブの成功を確認した。既存の任意benchmark2件skipは維持し、App importもCIでは成功した。上記のローカル失敗記録は残す。

FA市場の同一fixture（`/baseball-manager/e2e/fixtures/ui03c/index.html?state=normal`）で「補強ポイント・市場のルール」を開き、360/390/1440pxで比較した。beforeは基準mainの展開、afterは本ブランチ。6画面とも横はみ出し・ブラウザ例外なし。[確認JSON](../validation/catcher-depth/ui-checks.json)／変更後 [360px](../validation/catcher-depth/after-market-360.png)・[390px](../validation/catcher-depth/after-market-390.png)・[1440px](../validation/catcher-depth/after-market-1440.png)。同ディレクトリの`before-market-*.png`が変更前。

## 制約と残課題

- 健康2人以下、外国人・登録待機、兼任選手が他の守備で不可欠な場合は、通常3人や二軍捕手を保証できない。6人保有でも4人同時負傷すれば不足し得る。
- 日次の国内FA緊急獲得、新規の救済選手生成、強制契約・放出、捕手を残すための引退抑止は追加しない。市場・予算・70枠に候補がある場合でも、既存の獲得機会と判断に従う。既存セーブの不足が即時に解消されるとは限らない。
- 新方針のseed20261016では2028年開幕に支配下主捕手11人の球団を観測した。6人は不足判定の目安であり、既存FAの通常評価による獲得上限ではない。初期人数・試合・更改・市場の経路が変わるため、特定の補強変更だけへの因果帰属はしない。過剰保有を抑える獲得・放出判断はCPU長期編成改善の具体的な残課題とする。
- 初期生成で他位置の最後の枠を守るため、異常に小さい独自入力などでは目安6人を満たせない場合がある。
- 実機iPhone/Safari、手動運用での年間不足率、3年超・追加seed、長期の財務・捕手能力・市場枯渇の校正は別工程。経営画面刷新・CPU長期編成改善を完了扱いにしない。
