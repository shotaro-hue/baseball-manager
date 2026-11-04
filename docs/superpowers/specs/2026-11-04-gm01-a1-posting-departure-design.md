# A1-2c-4b ポスティング退団・解除合意

基準main: 3b6192e32568ee14710f9842bc402afba166e698（#542マージ後）。
「マージしたから次へ進んで」とAGENTS.mdに従い、Task7の次の独立した共通取引を実装する。

## 目的・範囲

ポスティング承認による名簿退出と元契約終了を共通world・保存barrierへ接続する。
v2/offseasonの12月1日に、現在の支配下雇用と明示postingRequestedを検証する。FA資格や外国人フラグから申請を推定しない。
満了契約は自然満了を維持し、継続契約の終了効力は翌2月1日。通知前の給与・過年度行を維持し、保証は原則retain。
waiveには今回成立した解除合意IDを必須とし、合意日は検証済みworld clockから生成する。旧保証不明をguaranteedへ書き換えない。
posting収入は別commandの後続工程。UI/CPU判断、旧mail応答の接続、年度/Worker自動化、一般公開を含まない。

## Approaches

- 採用: 独立end-contract commandとoptional postingDepartures。既存の台帳end、名簿整理、全年度予算、退団投影を再利用する。
- enter-marketへposting理由を追加するとNPB市場掲載と海外退出を混同するため採用しない。
- 旧hookの名簿削除＋入札額を旧budgetへ加算する方式は、契約・保証・収入を別々に失うため接続しない。

## Interface / 正本

`end-contract {id,teamId,playerId,contractId,reason:'posting',settlement:'retain'|'waive',terminationAgreementId?}`。
retainでは合意IDを受け付けず、waiveでは有効なIDを必須にする。満了済みで残債のない契約へのwaiveは拒否する。
未回答の正式留保・人向けpending更改・受諾済み将来契約・引退予約の競合を非変更で拒否し、解消後の再提示を許す。
残る選手の一軍/二軍配置・能力・待機を維持し、退団選手への配置参照だけを整理する。

postingDeparturesは元契約・通知時snapshot・給与根拠・合意・終了actionを保存し、receipt/台帳/元球団履歴と両方向に照合する。
全退団の元契約一意条件へ参加し、v2のend/posting actionに証跡を要求する。過去の照合を現在の健康・再雇用でやり直さない。
旧v2の配列欠損は空、v1/legacy、schemaVersion1/DB5、公開ゲートOFFを維持する。

## 解除合意日

台帳の既存terminationAgreementを再利用し、実在する暦日で、元雇用の最終変更日以降・終了効力日以前の合意を許す。
これにより12月1日の合意と翌2月1日の効力を区別する。未来の合意日を通知日に捏造しない。従来の同日合意は互換維持。
合意IDの全台帳一意条件、旧契約waiveの合意必須、保証契約の球団都合release禁止、closed-year保護は維持する。計算式は変更しない。

## 受入

単年/複数年、retain/明示waive、移籍/昇給後、旧保証不明、過年度/経過費用と将来保証、最低維持費を検証。
ID0、入力/日付/所属/区分/留保/将来約束の拒否、通知/効力/合意の改変、孤立/対削除/重複退団、JSON/replay/過年度履歴を検証。
実生成名簿の申請なし拒否と申請あり正常例、inline/外部rootの保存失敗非採用・retry/cold loadを対で確認する。
関連台帳/移行/FA/退団/引退/保存回帰、build、独立レビュー、提出HEADの必須CIを確認して新規PRで止める。
