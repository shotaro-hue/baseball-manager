# GM-01 — 実相場を基準にした海外交渉の生成・保存

基準main: `4c3d8c1133f0271a0e4c8f6c89dcfc30e9550729`（#553）。2026-11-07のユーザー回答「実相場で」を反映した#554の統合工程。親目標は通常プレイの申請→球団判断→海外交渉→成立/不成立→所属・財務・翌年度進行の完結。今回は**承認済み申請からの交渉・本人判断・一括保存・結果説明**を接続する。

以下の初回記録の基準は上記main。#554初期HEADは`c2dccd3aa472f4e3ec48e0ea617aa6b42108f89d`であり、今回のP1修正と検証結果は次節へ分ける。旧CI #703や初回校正だけをP1修正の成功根拠にはしない。

## 2026-11-07 P1 — エンジン間の数値・保存互換性

**再現:** 指定された5700万円、26歳先発、4能力65、元契約2026年終了、seed `review-math-6`、command `generated` / request `request`を現行HEADで実行した。Node v24.22.1/V8でmoneyScore `84.89815806161393`、WebKit2215/JSCでは`84.89815806161391`。両方向の`validateEconomySave`が保存全体を拒否した。`saveload.validateAndMigrateSave`もこの検証を通るため、正常なセーブの読込を阻害する。初回の2,373ケースにはこの反例が含まれていなかった。

追加の境界調査で、海外志向だけを`15.076381453789548`にすると旧V8はscore60/成立、旧JSCは59.99999999999999/辞退となった。過去の結果を現エンジンの新しい計算へ置換してはならない。変更前に両エンジンで生成した4worldを[postingMathV1.json.gz](../../../src/engine/__tests__/fixtures/postingMathV1.json.gz)へ保持した。

**新規評価version2:** `policyVersion=posting-mlb-scale-v1`と価格係数/RNGの用途・消費数は維持し、評価の`version`だけを2へ進める。新規native実行は常にversion2を作り、callerに版・金額・結果を選ばせない。

- 対数と2のべき乗はposting専用のBigInt kernelで計算。内部精度は小数30桁、ln2定数と有界の級数を使用する。年齢係数は整数の累乗二乗法で計算し、hostの`Math.log2`/浮動小数べき乗を新規評価の決定経路から外す。入力doubleの有理数化はIEEE754のbitから行う。
- 価格のjitterは既存RNGから同じuint32を1個取得し、`(85*2^32+30*draw)/(100*2^32)`とする。USD価格の乗除・clampは有理数/整数で処理し、majorの$50K、minorの$10K/$1Kの単位に一度だけ四捨五入する（非負の半単位は上）。USD cents/年数/保証上限は整数のまま厳密に扱う。
- 金銭比較は元契約の追加見込みとUSD centsから正確な比を組む。moneyScoreと総合scoreを小数12桁へ丸め、**丸めた同じscore**を受諾閾値60との比較・保存・再検証に用いる。保存時だけ表示桁を変える方式ではない。
- 能力/実績の基本的な加減乗除、clamp、閾値、整数RNGはECMAScriptの規定された算術のまま。新規version2は評価全体を再現して完全一致を要求する。最下位bitだけの不正変更も拒否する。

**既存version1:** 移行書換・再抽選をしない。保存原本を凍結したまま、旧式の数値演算を限定的に再現する。

- `Math.log2`の近傍4ULP（元の値を含め最大9候補）を旧式のclamp式へ通し、保存moneyScoreがその正確な候補であることを要求する。保存moneyScoreを使って旧score/閾値判定を元の演算順序で再計算し、保存scoreと成立結果は完全一致させる。これにより旧閾値例の成立/辞退をそれぞれ保持する。
- 旧べき乗も近傍4ULPから**旧価格の丸め結果を列挙**する。整数金額は列挙した正確な金額のどれかであることを要求し、金額自体へepsilonや任意の±1円/±1centを適用しない。年数・契約区分・cap・単位は旧式のまま。丸め境界で旧エンジンの選択が異なり得る場合も、保存済みの候補を保持する。
- 保存評価全体の検証は削除しない。候補を使って旧式を再実行した全評価と、資格・ID・root由来のdraw・結果・子取引署名・退団・収入は一致が必要。読込でversion1の数値をversion2へ変換しない。既存保存prefixは引き続き厳密で、他エンジンの個別には正当な旧診断値へ既存履歴を置換する操作も拒否する。

**反例の結果:** 元の例は旧V8/JSCとも1年・保証$1M/成立、譲渡金3,000万円と2027年度追加枠3,000万円、revision3を保持。新規version2はmoneyScore `84.898158061614`、score `93.969447418484`で両エンジンが一致する。旧閾値例はV8の成立/入金1回、JSCの辞退/入金0回をそれぞれ不変で復元する。新規の閾値判定は保存した12桁scoreの定義に従う。

**検証:** 今回の変更後ソースで関連12ファイル合計213件成功（重複分を除く）。指定関連7ファイルに、新kernel/互換性/旧明示結果と収入の回帰を加えた。新規の相互保存/読込は6シナリオ×2エンジンで12件、ページ内価格/受諾境界は2件成功。既存の生成三分岐/保存失敗・再試行/採用復旧/旧明示結果表示も両ブラウザ26件成功し、今回のブラウザ検証は合計40ケース。PlaywrightのNode側だけの検証ではなく、ページ内で対象モジュールをimportして生成・validate・saveGame・loadGame・再試行・改変拒否を実行した。Node側も実saveload＋fake-indexeddbを使用し、双方で提示額・結果・退団・入金・翌年枠・revisionの不変を比較した。7種類の改変をページ内の検証と保存公開で拒否する。

使用環境: Node v24.22.1 / V8 `13.6.233.17-node.58`、Chromium `156.0.8078.79`、Playwright WebKit build `2215`（browser.version 26.0/JSC）。**実iPhone Safariでの操作は未実施**であり、WebKit/JSC検証と区別する。ローカルOSライブラリのhost事前検査省略は下記初回記録と同じで、テストのskipは追加していない。CIは既存の通常構成で実行する。

補助確認として既存2,373入力を旧v1実装/新version2で照合し、提示額/成立結果の変更0件、旧評価の互換検証拒否0件。これは指定反例・閾値・相互読込の代替ではない。既存の三分岐/保存失敗/再試行/復旧/旧明示結果の回帰も維持する。最終独立レビューと更新HEADの必須CI結果はPR #554へ記載する。

UIの表示構造、CPU/年度Worker、価格政策、公開OFF/schema1/DB5は変更しない。

## 初回実装 — 入口と保存の正本

- 通知→受信箱→承認済み申請→「海外交渉の結果を確認する」→確認して保存。承認そのものでは交渉を実行しない。画面で金額・結果を指定したり、未保存の提示をプレビューして抽選を選び直したりしない。
- `humanPosting`の自球団・save/epoch/revision/season/dateとhookのsessionを検査し、共通`commitEconomyOperation`で一候補・一revisionとして公開/採用する。失敗時は元world/保存rootを維持し、公開後の採用中断は既存復旧経路を使う。
- native `run-posting-market {id,type,requestId}`は、必要なv2資格snapshot→`postingMarketInputs`→モデル→既存`resolve-posting`→退団/収入/翌年度限定枠を同一候補に生成する。既存資格は再利用。複数world取引のrevisionを書き換えて保存制約を回避しない。
- 能力・今季/直近2年の実績、出生日由来の資格年齢、元契約台帳の給与/残存債務を評価時snapshotとして親receiptへ保持する。年俸表示値、tradeValue、メール本文を価格正本にしない。移籍した年の複数成績は記録済みの各counterだけ合計し、欠測はnull、実測0は0のまま扱う。
- 復元時は保存済み入力・同じroot・元のseason/requestで評価を再現し、資格との結合、生成結果、子取引署名を照合する。保存済みprefixとrootの変更、既存の明示市場結果への生成親receipt後付けを拒否する。過年度の選手能力が変わっても当時の結果は保持する。旧明示`resolve-posting`/`complete-posting`の履歴を生成履歴へ強制変換しない。

## 価格と本人判断 v1

`posting-mlb-scale-v1`は、MLBの全30球団・全入札・各球団bonus pool残高を再現するモデルではなく、実契約のUSD尺度を基準にしたゲーム内の集約市場である。次の公開事実を参考にした。特定選手名による価格分岐はない。

| 公開された契約の参考 | 年数・保証額/契約金 |
| --- | --- |
| [有原航平](https://www.mlb.com/rangers/news/kohei-arihara-posting-decision) | 2年 $6.2M |
| [今永昇太](https://www.mlb.com/news/cubs-introduce-free-agent-pitcher-shota-imanaga) | 4年 $53M保証。同記事の山本由伸は12年 $325M |
| [鈴木誠也](https://www.mlb.com/news/seiya-suzuki-signs-5-year-deal-with-cubs) | 5年 $85M |
| [吉田正尚](https://www.mlb.com/amp/news/masataka-yoshida-red-sox-deal.html) | 5年 $90M |
| [佐々木朗希](https://www.mlb.com/news/roki-sasaki-contract-with-dodgers) | マイナー契約・契約金 $6.5M |

能力は野手contact/power/eye、先発と救援はvelocity/control/breaking/staminaを役割別に評価する。記録済みの出場量で重み付けした直近実績、若年潜在力を加味し、年齢で期間/価格を調整する。市場関心は能力等に応じた確率（2〜98%）で、提示なしを独立した結果にする。野手の基本価格尺度は実名簿試算の上位契約を$85〜90Mの実例と照合して調整した。投手と野手の生能力尺度を同一の固定円係数へ変換しない。

majorは年間$1〜35M（救援$16Mまで）、年齢・評価に応じて1〜12年、保証総額$325Mまで。restrictedはminorのみ。minorは1年を比較期間とし、契約金だけを金銭評価する。未保証の将来MLB年俸を足さない。restrictedの$6.5M/その他の$100Kは**ゲーム内の校正上限**で、普遍的な制度上限という意味ではない。

本人は海外志向、金銭志向、愛着、安定志向と、追加海外収入/国内残留の追加見込み収入/出場機会の見込みを比較する。実名簿のoverseas未記録はsave/epoch/season/playerから推定し「未記録のためゲーム上の推定」と表示する。元personalityへ書き戻さず、実測0とも区別する。他の欠測傾向は中立仮定として評価証跡へ記録する。出場機会は契約上の保証ではない。

生成成立は`retain`のみ。残存NPB債務は残留・海外の両方で支払われるため、残留側だけへ加算しない。国内比較は提示期間のうち元契約終了後の年俸を現年俸で仮定する。旧保証unknownをtrueに変更せず、免除合意を自動生成しない。保存/予算上の拒否で市場結果を別結果へ置換しない。

抽選は`economyRandomContext`のversion1（FNV-1aのUTF-16 JSONキー→LCG）を既存`rng/rngf`の任意contextに渡す。save/epoch/season/player/request/purpose別のstreamで、caller取引ID・revision・描画回数や別選手の処理順に依存しない。既存のcontextなし呼出は従来動作を維持する。

## 実名簿の価格尺度・経済影響

`createInitialTeams()`由来1,059名の一時点snapshotのうち、育成268名を除いた支配下791名を3 seedで試算した。全員に仮の承認済み申請を置いた**価格分布の反実仮想**であり、1年間の申請数/成立率の予測ではない。実名簿で初期生成される潜在力・性格もsnapshotへ固定した。再現用の全791入力は[inputs.json.gz](./inputs.json.gz)、詳細は[calibration.json](./calibration.json)。元給与・契約期間で新制度開始時と同じ保証付き契約台帳を作り、同じ入力抽出/資格/モデル/譲渡金quoteを使用した。実際のゲーム操作経路は下記の別検証で確認した。

| 役割 | 試算数 | major保証総額 最小/中央値/最大 | minor契約金 最小/中央値/最大 |
| --- | ---: | ---: | ---: |
| 野手 | 1,161 | $1.45M / $5M / $97.5M | $6K / $80K / $550K |
| 先発 | 315 | $1M / $6.9M / $162.4M | $10K / $160K / $1.85M |
| 救援 | 897 | $1M / $4.4M / $80M | $11K / $250K / $6.5M |

2,373ケースは提示なし1,568、辞退426、成立379。固定成功率に合わせた値ではない。既存FX150・譲渡金の100%翌年度限定追加枠を維持する。最大提示を成立と仮定した譲渡金393,525万円は当該球団の名簿年俸総額342,640万円の1.15倍。実際に成立した試算の最大は347,062万円、約1.01倍。年俸総額との比較であり、現実の球団収入や年間予算という主張ではない。金額を小さく見せるためNPB年俸倍率に戻したり既存配分率を変更したりしない。長期の経済均衡・年度Workerは後続の統合工程で検証する。

固定入力の再評価例（repository root、既存node_modulesを使用）:

```sh
node --input-type=module <<'JS'
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const s = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { evaluatePostingMarket } = await s.ssrLoadModule('/src/engine/postingMarketModel.js');
  const inputs = JSON.parse(gunzipSync(readFileSync('docs/validation/gm-01-posting-market-model/inputs.json.gz')));
  const counts = {};
  for (const f of inputs) for (const seed of ['calibration-1', 'calibration-2', 'calibration-3']) {
    const r = evaluatePostingMarket(f, { algorithmVersion: 1, seed }, { saveId: 'calibration', epoch: 'v1',
      season: f.season, subjectId: f.playerId, operationId: f.requestId });
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  }
  console.log(counts);
} finally { await s.close(); }
JS
```

## 技術検証と画面検証

関連18ファイル合計385テスト成功（重複実行分を除く）。共通乱数/context互換、欠測/実測0、実名簿の野手/先発/救援と育成拒否、三結果、minor契約金0、retained負担、後年の予算拒否、identity/revision/session、二重操作、保存失敗→cold load→同じ結果、公開済み結果の採用復旧、生成履歴/seedの改変拒否を検証。2年後の履歴復元テストは既存の年度fixture helperを用いた保存構造の検証であり、年度Workerの実行成功とは区別する。

独立レビューのP2指摘を実証して修正した。保存前に明示資格を生成し、その資格を市場処理が再利用した場合、`qualificationCreated=false`は「生成親が資格を作らなかった」という意味であり、「前回公開rootに存在した」という意味ではない。後者を要求していた過剰拒否を、実saveGameのRED→GREEN回帰で修正した。新規市場結果・親が作った資格の同extension入場、既存履歴への後付け拒否は維持した。

もう1件のP2として、承認済み申請が対応済みになり、新たに必要となった市場操作が要対応一覧/通知から消える問題を修正。pendingとapprovedを未解決とし、拒否/三市場結果で解決する。共通通知read modelのRED→GREENと、再開後の要対応一覧→交渉→確定後の件数0を両ブラウザで確認した。ホーム通知の既存テストも承認後1件と受信箱への移動を検証する形へ更新した。after画像も更新済み。

画面は実HubContentRouter→受信箱・useGameState→実保存を使用するannual fixture。360/390/1440pxで同じ承認済み状態の変更前後を比較し、確認・失敗/再試行・再開をChromiumとWebKitで操作。既存の球団判断/結果表示と要対応回帰を含む36ケースが成功した。実名簿の申請承認から交渉/再開、保存済み結果の復旧、三結果の説明、stale確認も対象。スクリーンショットは以下。CSS境界は変更していない。公開通常プレイの希望発生/CPU/年度Worker/実iPhone端末の検証ではない。

| 幅 | 変更前 | 変更後 |
| --- | --- | --- |
| 360px | [before](./360-before.png) | [after](./360-after.png) |
| 390px | [before](./390-before.png) | [after](./390-after.png) |
| 1440px | [before](./1440-before.png) | [after](./1440-after.png) |

同じ2,373ケースをNode・Chromium・WebKitで再評価し、評価snapshot全体のJSONが一致（差分0）することも確認した。

ローカルWebKitは/tmpのOSライブラリ/ブラウザを使用し、host事前検査だけを省略。ブラウザ操作/アサーションのskipはない。CIは既存の通常環境で必須ビルド・全単体/負荷/物理演算・重要E2Eを実行する。最新HEADのCIと独立レビューの最終結果はPRへ記載する。

## 残作業・次工程

**Task7/A1・ポスティング機能全体は未完成。** 自動希望発生、CPU判断、市場処理の年度Worker接続が残る。次はこの経路を通常の年度進行へ接続する作業を優先する。公開ゲートOFF、schemaVersion1/DB5、保存安全性、独立レビュー/CI、mainへの直接push・マージ・自動マージ禁止を維持する。
