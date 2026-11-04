# A1-2c ポスティング申請・GM判断の先行境界

基準main: c618886c2a1d5c088557cda04267d32872728ba0（#545）。未マージPRなし、#545提出HEADのCI #673 successを再確認。

## 目的と今回の単位

既存complete-postingは明示最終契約の確定境界であり、承認や市場成立を認定しない。
市場producerを先に作ると、MLB資格の根拠不足と未校正の価格・受諾policyを暗黙に固定する。
今回は明示された選手の申請と、一度だけのGM判断を共通quote/reduce/commitへ接続する。
申請の自動発生・市場の抽選・UI・CPU・年度Worker・公開切替は含まない。
ユーザーの一括開発指示に従い専用ブランチで実施。追加の基本policyを選ばない。

## 比較した方法

- 旧calcPostingBid/確率を流用して市場全体を先行: 根拠のない円スケールと必ず成立する旧処理を持ち込むため不採用。
- MLB資格・価格policyをこのPRで新設: 認定プロシーズンの正本と市場校正が不足するため後続。
- 採用: 申請→一度のGM承認/拒否の監査可能な独立単位。市場解決がない間は成立と誤認させず、新申請からの旧確定入口を閉じる。

## 正本・更新・保存・利用先

`request-posting {id,teamId,playerId,contractId}` は明示された挑戦希望の入力であり、自動希望生成ではない。
v2/offseason/12月1日（既存のゲーム時計）に現在の支配下名簿・11月30日雇用・元契約を確認する。
育成、退職/予約、正式留保、受諾済み将来雇用、過去に同年posting退団済みを拒否。
年齢・国籍フラグ・NPB FA権・海外志向値をMLB資格として使わない。申請受理はMLB契約資格の認定ではない。
入力が成功すると名簿のpostingRequestedをtrueにする。それ以外の能力/士気/配置・契約・給与・保証・全年度予算・収入は維持。
`decide-posting {id,requestId,decision:'approve'|'reject'}` は同年オフの未回答申請へ一回だけ記録。
拒否の士気罰や承認による自動解除は追加しない。postingRequestedは同年の希望履歴としてtrueを維持。

optional engine.postingApplications にrequest/decisionの追記専用eventを保存、transaction receiptと双方向照合。
申請はsave/epoch内のseason/playerで一意、GM判断はrequestIdで一意。ID型衝突は既存境界に従い拒否。
派生selectorがpending/approved/rejectedを返す。独立のstatus正本・UI state・market stateを増やさない。
過去申請の証拠は当該年度11月30日の台帳と照合し、現在の能力等で再審査しない。
pending/approvedは元雇用・名簿を保持し、競合する退団・FA・更改留保/受諾・年度越えを拒否。
rejectedは他の通常取引を再び許すが、その年度の再申請はできない（今回の一判断というゲーム内ワークフロー）。
新申請が存在する元契約からend-contract/complete-postingへの直接バイパスは承認/拒否を問わず拒否。
将来の市場解決工程がapproved→成立/不成立を所有し、成立時だけ既存complete-postingを内部利用する。
新申請なしの旧annual明示確定は互換維持。旧セーブへ新申請を自動補完しない。

保存先は既存envelope、既存commit barrier、履歴prefixへ追記。公開失敗は非採用、公開済み採用失敗は既存recover。
乱数を消費せず、同入力/JSON/cold loadで同じ判断証跡。同ID同条件はreplay、別ID重複・条件変更・stale revisionは拒否。
旧mail callbackは最新modeを見てlegacy以外を非変更拒否し、legacyの実プレイは維持。
schemaVersion1/DB5、公開ゲートOFFを維持。

## 受入

申請/承認/拒否、重複/改変/ID0/型衝突、所属/元契約/育成/留保/引退競合、古いcommand/Worker採用拒否、全財務不変。
JSON往復、cold load、inline/外部rootの保存公開失敗→retry、公開後復旧、prefix保護、実createInitialTeamsの正常/育成拒否。
旧annual確定とlegacy mail正常・拒否を回帰。別コンテキストレビュー後にPR提出、マージしない。
