# GM-01 A1-1d-2c: 読込worldの一括hydrationと再保存

基準main: 836eec4ae954a62d3407708d8c84b877a42142c9（#524修正7b59d317を含む）。親Task 4、接続設計4.2。

目的: 保存から読んだ契約・名簿・市場・通知を一つのdomain actionで反映し、再保存で契約engineを落とさない。

Ruling: 2cはタイトル読込のhydrationと通常再保存に限定する。取引commitのbinding/dirty・career・archive成功処理と全操作barrierは2dへ分割する。ロードは新session、取引採用は同sessionであり、同じ無条件setterを流用しない。代償: このPRだけでは新制度を画面から利用できない。一般公開ゲートOFF、Appのannual読込拒否、DB5を維持する。移行/anchor/fence、通常進行/年度移行、契約UIは対象外。

## Task 1: 検証済みworldの原子的なdomain読込
- hook実体でannual fixtureの読込と再保存をRED。
- 専用HYDRATE_SAVED_WORLD actionは全domain fieldを置換（不存在も保持）。候補を独立コピーし、契約・farm・receiptを更新前に検証する。
- タイトル以外/開始時session・progress不一致を拒否。成功時のみsession更新、pending careerと保存追跡をリセット。壊れた候補は旧state/追跡を保持。
- annualでは旧回答effect/日程再生成を動かさない。
- legacy通常ロードも新入口へ接続。legacy固有の補完はApp側で従来どおり行う。annualへ自動移行しない。

## Task 2: 同じengineの通常再保存
- 手動/自動payloadにcontractEconomyを保持。revision/clockを勝手に更新しない。
- inline/大root/backup、旧開始残高と保証unknown、ロード後の旧legacy復帰を回帰確認。
- 影響Vitest、保存/初期化E2E、最新head CIで検証。

## Review focus
- 新旧worldの混在、入力参照共有、古い読込による新session上書き。
- malformed candidateの部分反映、旧effectsによるannualの無断変更。
- dirty/pending careerの失敗時消失、通常保存のengine欠落。
- 一括ロード入口をcommitの公開証明として利用しない。

## 検証・独立レビュー

- 新規hook6件が入口未実装でRED→GREEN。実save/loadを用い、inline/大root/backupの一括反映・参照分離・再保存を確認。自動保存と旧開始残高/保証unknownも追加。
- 独立レビューのImportant2件（null通知要素の受理後クラッシュ、annual再保存でresumeScreenをtitleへ変更）を再現テストでRED→GREEN。
- Ruling: レビューの古いcallbackによる画面制約迂回をImportantへ再評価。非同期loadが保持するcallbackは正当な利用形態で、現在画面の制約は入口の約束だから。現在screenを同期refで検査する。代償: screen setterの責務が増えるが通常の画面遷移は維持しE2Eで確認する。
- 不正なロード拒否後にもpending careerが残り、次の正常保存で実際に履歴へ記録されることを確認。legacyの省略farmは従来どおり空配列として読込可能。
- 検証済みの範囲はdomainの一括置換。履歴/表示用storeは既存hook経路を再利用する。新制度の通常Appロードは公開ゲートで引き続き拒否。
- 取引公開ack/全操作barrierとactivation/進行/UIの未実装は工程分割どおり後続。任意payloadによるAPI悪用やtoken偽装は現行consumerなしとして対象外。CI/browserは実行結果をPRへ記録。独立レビューに残った未解決指摘なし。
