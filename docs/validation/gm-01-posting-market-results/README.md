# ポスティング市場結果の確定境界

基準main `1700d6f41bb05a0c239370b3c7b640ddf112d0ed`（#550マージ済み）。[設計](../../superpowers/specs/2026-11-06-gm01-posting-market-results-design.md)／[計画](../../superpowers/plans/2026-11-06-gm01-posting-market-results.md)。

## 今回の到達点

承認済み申請と保存済みruleVersion2資格に結合した明示市場結果を、共通 `resolve-posting` commandで一度だけ確定する。

| 結果 | 所属・契約 | 財務 | 後続 |
| --- | --- | --- | --- |
| signed | 既存complete-postingで名簿退出・元契約終了。原則retain、明示合意だけwaive | 既存譲渡金式・JPY150/USD・翌年限定100%追加許可 | 同じ結果はreplay、別IDの同年再確定を拒否 |
| no-offer | 維持 | 維持 | 通常更改/自然満了が可能。同年の再申請/再確定は拒否 |
| declined | 維持 | 維持 | 同上。辞退は明示入力であり受諾確率の計算ではない |

申請・GM判断・資格・市場結果・内部completion/退団・収入を同じsaveId/epoch/request/元契約へ照合する。restrictedのmajorを拒否し、minorのbonus実測0は許す。保存済みの資格factsを既存ゲーム時計の12月1日で再判定し、将来署名日を捏造しない。過年度検証はその時点の保存証拠に基づき、現在所属を要求しない。
市場結果・transactionは追記専用で保護する。新しいsignedの親と内部completion/退団は同じ保存拡張に必要。旧annual明示確定への結果後付けを拒否する。新しい申請からのstandalone end-contract/complete-postingバイパスは閉じたまま。

## 検証

- baseline: 既存5ファイル97件成功。
- 新規coreは未対応commandで17 failed / 13 passedのREDを確認して実装。最終core36件成功。三結果、単年/継続・retain/明示waive、exempt/restricted・major/minor/0、誤ったID/資格/保存identity・stale revision・親子ID衝突・再処理拒否・通常更改/満了・2年先の履歴を確認。
- 新規実保存13件成功。三結果×inline/外部root、公開失敗非採用→cold loadから再構築/再試行、公開後採用中断→recover、履歴の削除/対となる改変/巻戻し・stale採用を確認。実createInitialTeamsの支配下正常/育成申請拒否、固定realPlayerIdの資格→明示minor成立→cold loadを含む。
- 後付けprobeは、過去の子receipt prefixを保つ並びで市場結果を追加すると保存できるREDを確認。新しいsignedには新しい親receipt・completion・departureを同一拡張へ要求し、同じ実保存probeのGREENを確認。
- 新規49件を含む関連15ファイル291件成功。既存申請・資格・退団・譲渡金・実保存とlegacy posting hookを含む。`npm run build`成功。既存mixed-import/large-chunk警告は維持。テスト削除/skip追加/期待値緩和/timeout・CI条件変更なし。
- 契約world/年間取引/退団競合/引退/FA/支出・実保存/commit復旧の隣接10ファイル461件も成功。ローカル合計25ファイル752件。
- 未公開のためローカル全件も追加実行。`npm test -- --maxWorkers=2 --minWorkers=2` は335成功ファイル、4,383 passed / 既存2 skipped、541.19秒で成功。物理検証が再生成した既存reportは証跡として退避し、提出差分へ混ぜず元へ戻した。テストやtimeout/skipの変更なし。GitHub CIの代替として成功認定しない。
- 独立レビューは実装HEAD `7661ae5c1b343c571606eeb066d3f7db998be3c4` を確認し、未解決P0/P1/P2・軽微な指摘なし。別コンテキストの追加19probeも成功（不成立→満了→FA再雇用→翌年成立2件、通常更改→翌冬2件、孤立/改変/付替え11件と三結果の型衝突・順序調整済み後付け）。実装ソースはレビュー後変更していない。
- 最新HEADの必須CIの最終結果は提出PRを正本とする。実画面・長期性能ベンチマークを成功扱いしない。

## 未実装・未検証

このcommandは**明示された最終結果の入力境界**。提示額/本人受諾/希望発生のproducerや確率、MLB個別球団・bonus-pool容量、交渉期限・実署名日のモデルは追加していない。旧calcPostingBidの係数を新市場へ採用していない。
自動producerの価格policy・受諾policyは後続で方針確認と校正が必要。人UI/CPU/年度Worker接続、引退試合の開催/収入producer、長期経済・実iPhoneも残る。今回の将来年度fixtureは履歴検証であり、年度Worker全体の接続成功ではない。
Task7/A1全体は未完了。一般公開ゲートOFF、schemaVersion1/DB5、legacyと旧v1資格の歴史復元/replayを維持する。
