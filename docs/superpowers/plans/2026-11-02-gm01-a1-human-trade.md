# GM-01 A1-2b-3 人のトレード確定

基準: #533 merge / main `7b2d860ab6f46452ef7aebeccde815aebfef24fa`。
承認済み親計画 Task 6 の移籍部分。設計は `../specs/2026-10-30-gm01-a1-integration-design.md`。

## 共通制約・範囲

- 一般公開ゲートOFF、legacyの交渉・金銭処理は維持。
- 既存 `trade` / `projectTradeRosters` / `commitEconomyOperation` を再利用。旧wallet控除を併用しない。
- 手動提案・逆提案・受信済みオファー承諾を扱う。CPUによる生成・自動成立、発掘、春加入、年度更新、全経路の試合成立検査は後続工程。
- 確認時のrequest・revision・日付・sessionを固定。保存再試行で交渉抽選をやり直さない。
- 台帳・将来契約・金銭・名簿・ニュース/移籍履歴・承諾済みメールを同一worldで保存し、採用後だけ成功表示。
- 変更前後360/390/1440px、Chromium/WebKitを検証。既存CIと同じ全テストのローカル重複実行は不要。

## Task 1: pure adapter

`tradeRequest(world, action)` / `reduceTradeRequest(world, request)` / `previewHumanTrade(world, request)` を `src/engine/humanTrade.js` に追加。
actionは相手ID・放出/獲得ID・万円・任意mailIdだけ。金銭0の双方向交換は既存cashless例外、その他はspend。requestの正本を共通reducerで見積/確定する。

- [x] RED: 金銭±500、7/16給与5484/4516、将来契約/保証維持、予算/70枠/期限、ID0、古いrequest、JSON再実行、履歴一回性。
- [x] GREEN: adapterとfixtureを実装。年度別予算/給与/名簿をengineから表示へ返す。
- [x] 対象Vitestを実行し失敗0を確認。

## Task 2: hook・確認画面

`useGameState.commitTradeRequest(request, session)`、`TradeTab` のannual条件表示/保存待ち/再試行/ack復旧、`HubContentRouter` を接続。旧handlerはannual/stale sessionを拒否。メールからannual取引は同じトレード画面へ誘導。

- [x] RED: 二重クリック、別契約後の古い確認、保存失敗の旧root/world、同一再試行、ack復旧、legacy callback再利用。
- [x] GREEN: 既存選択/交渉ルールを維持し、処理中の編集を止める。承諾後の再試行は同じrequest。
- [x] 対象Vitest、契約/育成/FA/人的/保存/legacy回帰、production build、diff check。

## Task 3: E2E・独立レビュー・PR

- [x] real hook/routerから提案→保存失敗→再試行→cold reload、ack復旧、古い確認拒否を両ブラウザで検証。
- [x] 確認/失敗画面を3幅で比較・記録。
- [x] 最終diffの独立レビュー。P1なし。オートセーブ待機中の既読更新で確定不能になるP2を再現RED→GREENで修正。
- [ ] 専用PRを作成し同一HEADのCIを確認。マージしない。

## Review Focus

固定requestと再描画/sessionのずれ、交渉受諾後の再抽選、mailの選手/金銭改変、保存復旧後の二重履歴、未回答更改の取消との整合、双方の将来年度赤字、legacy経路からannualへの侵入を確認する。
