# GM-01 A1-3c-1 オフターン・回答接続

## 完成範囲と次工程

#563マージ済みmain `defb3ebf26d8f14dbd7c929cca7b68054d2719bc`からの先行分割PR。native契約画面でターン・更改/獲得の回答待ち件数・各回答予定と提示条件を確認し、1ターン進行して回答を保存できる。既存の提示/取消/再提示/結果確認を利用する。親機能A1-3cの完成ではない。

CPU更改の判断・成立、満了判断/FA宣言/自由契約市場供給、工程完了判定は次PR。自球団を自動更改・放出せず、実際の年度切替/翌春・公開も行わない。このPR提出後はマージ判断で停止する。

## 正本・処理・保存

- economy clockの12/1と年度を固定。入力要求のsaveId/epoch/revisionを一致させ、現在期日の回答→1ターンだけ増加→新期日の回答を未公開candidateで処理し、外部revisionは元+1。
- 第30まで提示・第31から提示不可・第37で進行停止。旧37超保存は両種の既存回答確認を利用する。期限で未判断者を自動放出しない。
- ledger/reservations/decisions/保存済み成長要求をそのまま利用し、評価・乱数を再抽選しない。獲得の補償/翌春加入等も既存schedulerの責務を変更しない。
- commitEconomyOperationの同一mutation/session barrierを利用。既読等のdirty baseを必要時保存してからcandidate CAS、公開root照合→React採用確認→ack。失敗は元world維持、公開後採用失敗は既存復旧。
- 新しい永続フィールド・保存正本・履歴receiptは追加しない。時計のrevisionが重複操作を拒否する。schemaVersion1/DB5/公開OFF、旧nativeへの成長遡及生成なし、legacy writer不変。

## 調査したCPU機能

`contract.js:cpuRenewContracts` は `planCpuRenewals` 等の編成評価と、旧年俸直接変更・財布減算・旧退団処理が混在している。今回は呼び出さない。次工程は純粋評価（年齢/能力/成績/ポジション需要/育成/新人機会）を再利用し、保存済み要求・単年/複数年・全年度予算・有限fallbackをledger/reservation共通成立処理へ接続する。今回CPU更改仕様を完成したとは扱わない。

## 回帰と実データ

関連5ファイル73件成功（engine新13件、既存growth order12/acquisition24、画面12、既存human hook12）。

```
npx vitest run src/engine/__tests__/offseasonTurns.test.js src/engine/__tests__/renewalGrowthOrder.test.js src/engine/__tests__/acquisitionDecisions.test.js src/components/tabs/AnnualContractTab.test.js src/hooks/useOffseason.economyRenewal.test.js
npx vitest run src/hooks/useOffseason.turns.test.js
npm run test:e2e -- management-decisions.spec.js --grep 'offseason turn' --workers=1 --retries=0
```

新hook5件も成功（計78件）。実12球団ケースは約29.9秒。保存失敗→同要求再試行、cold/backup復旧、二重クリック・旧revision/session、公開後ack失敗→復旧、既読dirty baseを確認。実12球団は `createInitialTeams` →既存閉幕/ポストシーズン/予算/open/引退/成長producer→正式更改→期日直前のengine turn→実hookで回答保存→再読込。全球団名簿/成績、元取引履歴、予算投影、選手careerを確認する。

実データ用テストは通常loadGame経路でhydrateする。careerLogは保存で別generationへ退避されるため、初期生worldのinline careerと読込後の軽量名簿を同じ投影として比較しない。名簿は読込同士、careerはloadPlayerCareerLogByIdで別途照合する。生worldを直接hydrateして比較した初期テストの誤りを訂正した。保存実装・既存期待値を変えていない。

旧native互換は実producer由来 `renewalBeforeGrowthPending.json.gz` のturn0→2回答、成長を遡及生成せず新規提示拒否を維持。旧native/旧posted/legacyの関連既存テストも維持。第37/38の旧獲得だけpendingをUI回帰で検証する。

## 独立レビュー

別コンテキストのレビュアーが基準mainからの実装差分・要件・実データ入口を確認。P1なし、以下P2を実証し修正。

1. 空ターンで全world投影/成長履歴検証を4回実行：新reducerの空ターンは1回に削減し、dueのない時計/種類のscheduler呼出しを省略。RED→GREENの呼出し回数回帰と従来回答回帰を追加。全保存検証は維持。実12球団の初期テスト時間には生成/提示/保存/誤った巨大比較も含まれ、1ターンの所要時間とは扱わない。
2. 第37/38の獲得だけpendingでは契約画面に回答ボタンが出ない：両種のdueへ統合し、旧超過でも「現在回答期日に到達」と既存統一resolveを表示。実producerの保存検証・画面回帰RED→GREEN。

## 画面と環境

Chromium 360/390/1440で6件成功。提示→保存再開→turn→書込失敗/再試行→辞退→再開、および取消→再提示→turn受諾→再開。各画面で横溢れなし。WebKitも同じ6件成功（計12件）。ブラウザ用worldは既存native年度producerの12球団小名簿fixture、実フル12球団は上記hook検証。通常annual実試合Workerによる年度完走の証明ではない。

ローカルDebian環境に不足したブラウザ依存を `/tmp` に展開し、WebKitのローカルbundleへ参照を追加した。ldconfigシステムcacheは更新しないためローカル起動時のみhost検出を省略し、実ライブラリでブラウザを起動する。CIは既存Ubuntu24.04・公式install-depsを維持。テストassertion・retry・timeout緩和、既存テスト削除/skipなし。重い実データ検証との同時実行で初回ブラウザ30秒制限超過を観測したため、最終画面検証は分けて実行する。

| 幅 | 変更前 | 書込失敗 | 回答・再開後 |
|---|---|---|---|
| 360 | [Chromium](./chromium-360-before.png) / [WebKit](./webkit-360-before.png) | [Chromium](./chromium-360-failed.png) / [WebKit](./webkit-360-failed.png) | [Chromium](./chromium-360-saved.png) / [WebKit](./webkit-360-saved.png) |
| 390 | [Chromium](./chromium-390-before.png) / [WebKit](./webkit-390-before.png) | [Chromium](./chromium-390-failed.png) / [WebKit](./webkit-390-failed.png) | [Chromium](./chromium-390-saved.png) / [WebKit](./webkit-390-saved.png) |
| 1440 | [Chromium](./chromium-1440-before.png) / [WebKit](./webkit-1440-before.png) | [Chromium](./chromium-1440-failed.png) / [WebKit](./webkit-1440-failed.png) | [Chromium](./chromium-1440-saved.png) / [WebKit](./webkit-1440-saved.png) |

## 限界・最終CI

WebKitは実iPhone Safariではない。実iPhone/モバイル実機の性能、長期経済校正、CPU更改/満了/市場供給、翌春は未検証/後続。既存の全world検証・保存には実データ量に応じた費用が残る。ターン新設を理由に歴史検証を省略しない。

最終HEAD・PR番号・全必須CI結果はPR本文を正本とする。CI待ち・旧HEADの成功を最終成功とは扱わない。


## 2026-11-21 P2修正の追補

旧HEAD `0ac5626` で、実openRenewalWinter→空turn31→引退/成長保存→新規提示拒否を再現。新規engine6ケース・UI2ケース・hook2ケースのREDを確認した（後から追加した互換性3ケースは既存動作を固定するGREEN）。既存テストの削除/期待値変更/skip/timeout/retry変更は行わない。

共通 `offseasonTurnGrowthIssue` をengine entryとUIで利用する。既存 `requiresYearEndGrowth` と、自球団のhuman-renewal/human-acquisition pendingだけを読む。engineは正本・両decision validatorで正当性を確認してから判定し、拒否ではworld/revision/clock/台帳/留保/decisionsを変更しない。UIは空進行停止・成長保存への既存導線と、旧pending救済中の案内を区別する。

pendingのある最後の操作は、既存の現在回答→時計+1→新回答の順をそのまま行う。回答確定後の次の空進行を拒否する。現在dueの案件は既存回答確認だけでも処理でき、取消・replay・37/38救済も無制限に新turnを許す理由にはしない。成長後/旧native/既posting済み保存は新たな成長を要求せず、legacy writer、schema1/DB5/公開OFF、保存barrierは変更しない。

修正productionは `src/engine/economyDecisions.js` と `src/components/tabs/AnnualContractTab.jsx`。annualYearEndGrowth/annualYearEndRetirements/useOffseason/useGameStateは既存責務を確認して再利用し、変更しない。今回追加はengine9＋UI2＋hook2＝13回帰。新しいnative producer/旧producer由来gzipを使い、薄い手作り保存だけで検証しない。

修正後の最終テスト・独立レビュー・新CIは確認後にPR本文へ記録する。#747は旧HEADの基準結果であり修正後の検証結果ではない。実iPhone Safariは引き続き未検証。


### 修正後の検証記録

- 関連Vitest 7ファイル91件成功（既存78＋今回13）。engine9、UI2、hook2の追加。実12球団・1,034選手については、既存hookケースへ成長前拒否/元world不変を追加し、その31.6秒の再実行も成功。保存後は通常load経路とcareer generationを引き続き照合した。
- 新規PlaywrightはChromium/WebKit各360/390/1440px、計12件成功。新規nativeはUI/直接hook双方で拒否→cold reload→拒否維持→成長保存→turn1。旧producer pendingはcold reload→turn1/2→受諾→空進行拒否→cold reload後も拒否を確認。横溢れ/pageerrorなし。既存30秒/worker1/retry0を維持。
- 新たな別コンテキストの独立レビューで確定P1/P2なし。レビュアーはengine/UI36件と追加hook2件、偽pending拒否・他球団pending除外・現在due→+1→次turn拒否を確認した。レビュアーのブラウザ/実機検証は未実施で、上記ブラウザと実12球団は実装担当が検証した。
- 比較用pre-fix PNGは旧HEAD `0ac5626` のAnnualContractTab表示部品を、同じreviewRenewalWinter保存・900px高で描画したもの。旧reducerの不具合再現は別途REDで確認済み。一時的な旧表示部品は検証後に削除し、製品へ追加していない。

```
npx vitest run src/engine/__tests__/offseasonGrowthGate.test.js src/engine/__tests__/offseasonTurns.test.js src/engine/__tests__/renewalGrowthOrder.test.js src/engine/__tests__/acquisitionDecisions.test.js src/components/tabs/AnnualContractTab.test.js
npx vitest run src/hooks/useOffseason.turns.test.js src/hooks/useOffseason.economyRenewal.test.js
npm run test:e2e -- management-decisions.spec.js --grep 'pre-growth turn gate|old pending turn rescue' --workers=1 --retries=0
```

| 幅 | 旧HEADの表示 | 成長前拒否 | 旧回答救済後の停止 | 成長保存後 |
|---|---|---|---|---|
| 360 | [Chromium](./review-2026-11-21/chromium-360-pre-fix.png) | [Chromium](./review-2026-11-21/chromium-360-growth-blocked.png) / [WebKit](./review-2026-11-21/mobile-webkit-360-growth-blocked.png) | [Chromium](./review-2026-11-21/chromium-360-old-rescued.png) / [WebKit](./review-2026-11-21/mobile-webkit-360-old-rescued.png) | [Chromium](./review-2026-11-21/chromium-360-growth-saved.png) / [WebKit](./review-2026-11-21/mobile-webkit-360-growth-saved.png) |
| 390 | [Chromium](./review-2026-11-21/chromium-390-pre-fix.png) | [Chromium](./review-2026-11-21/chromium-390-growth-blocked.png) / [WebKit](./review-2026-11-21/mobile-webkit-390-growth-blocked.png) | [Chromium](./review-2026-11-21/chromium-390-old-rescued.png) / [WebKit](./review-2026-11-21/mobile-webkit-390-old-rescued.png) | [Chromium](./review-2026-11-21/chromium-390-growth-saved.png) / [WebKit](./review-2026-11-21/mobile-webkit-390-growth-saved.png) |
| 1440 | [Chromium](./review-2026-11-21/chromium-1440-pre-fix.png) | [Chromium](./review-2026-11-21/chromium-1440-growth-blocked.png) / [WebKit](./review-2026-11-21/mobile-webkit-1440-growth-blocked.png) | [Chromium](./review-2026-11-21/chromium-1440-old-rescued.png) / [WebKit](./review-2026-11-21/mobile-webkit-1440-old-rescued.png) | [Chromium](./review-2026-11-21/chromium-1440-growth-saved.png) / [WebKit](./review-2026-11-21/mobile-webkit-1440-growth-saved.png) |
