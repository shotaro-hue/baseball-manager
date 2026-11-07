# A1-2c ポスティング市場結果の確定境界

基準main `1700d6f41bb05a0c239370b3c7b640ddf112d0ed`（#550マージ済み）。
「次へ進んで」とルートAGENTS.mdに従い、既存の[申請設計](2026-11-04-gm01-posting-applications-design.md)の市場結果→既存complete-posting内部利用を独立単位として実装する。

## 目的・対象外

承認済み申請へ、明示された最終市場結果を一度だけ保存する。`signed` は契約・退団・譲渡金・翌年度限定追加枠を同じ候補で確定し、`no-offer` / `declined` は所属・元契約・給与・保証・予算を維持する。
これは最終結果の入力境界であり、提示額・本人受諾の自動生成、希望発生確率、MLB球団/pool残高、交渉期間、実署名日の再現、人UI/CPU/年度Workerの接続は含まない。新しい価格係数・乱数消費を導入しない。一般公開ゲートOFF、schemaVersion1/DB5、legacyと旧annual明示完了の互換性を維持する。

## 比較と採用

- 採用: 明示結果を共通quote/reduce/commitへ接続。既存の申請・資格・complete-posting・保存barrierを再利用し、価格policyの承認/校正に依存しない確定境界を先行させる。
- 旧calcPostingBidの係数と必ず成立する処理は、価格policyとして未承認であり採用しない。
- 提示額/受諾producerまで同時に追加する案は、重要なゲームpolicyの選定と校正が必要なため別工程。

## Interface・正本

`resolve-posting {id, requestId, qualificationId, outcome, overseasContract?, settlement?, terminationAgreementId?}`。
`outcome` は `signed | no-offer | declined`。signedだけ既存の最終overseasContractとretain/waiveを受け、waiveだけ明示解除合意IDを必須にする。不成立に金額・解除条件を添付しない。

申請・GM承認はpostingApplications、資格はpostingQualifications、結果はoptional postingMarketResultsが所有する。結果はrequest/qualification、元球団/選手/契約、season、saveId/epochを結合し、transaction receiptと双方向照合する。派生statusを別の正本にしない。
新結果は当年offseason/12月1日のapproved申請とruleVersion2資格snapshotを必須にする。現在の支配下雇用・元契約・引退/将来雇用/留保/人の回答待ち競合を再検査する。資格は保存済みfactsを確定境界の日付で再判定する。restrictedのmajor契約を拒否するが、minorのpool容量を認定したとはしない。

signedの内部completion IDは `[result.id,"posting-completion"]`、内部departure/収入IDは既存complete-postingの決定的な子ID。子command・最終契約・結果の相互対応を確認し、別取引への付け替え・孤立証跡・後付け市場結果を拒否する。通知日/終了効力/保証/為替/譲渡金式/翌年配分は既存処理を維持する。
不成立は同年の再解決/再申請を許さず、通常更改/満了などの進行を妨げない。成立後・翌年度の照合は保存証跡を使用し、現在の所属/能力を過去の資格や結果へ適用しない。
旧v1資格証明は復元/replay専用のままとし、新しい市場結果へ流用しない。公開済みの配列prefix・receiptを保存拡張で保護する。旧保存の配列欠損は空として扱い、自動補完しない。

## 受入

三結果、単年/複数年・retain/明示waive、exempt/restrictedのmajor/minor、実名簿の正常/育成拒否、ID0/型衝突/子ID衝突を確認する。
承認前/資格なし/誤った申請・資格/古いrevision・save・epoch/競合/別ID再解決/直接完了バイパスを非変更で拒否する。
全年度予算、過年度給与、元契約保証、名簿配置、RNGを確認。JSON・cold load・replay、inline/外部root、公開失敗→再試行・採用中断→復旧、公開履歴の改変/巻戻し/後付け拒否を実保存で検証する。
独立レビューと最新HEADの必須CIを確認したPRを提示し、マージ判断で止める。
