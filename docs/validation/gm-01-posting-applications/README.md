# A1-2c 残工程監査・ポスティング申請

監査日2026-11-04。基準main c618886c（#545）、未マージPRなし。#545提出HEAD cb49e60da2c468354e34709f7c18172761ab5529 のCI #673 successをGitHub APIで再確認。同一HEADの全件はローカル再実行せず、今回の変更に近い試験を優先する。

## 現行の接続と残工程

| 単位 | 現行mainの実装 | 次の利用先・残工程 |
| --- | --- | --- |
| 台帳・年度別費用・更改/獲得/人的/トレード | 共通quote/reduce/commit、部分的な人操作 | CPU全操作(A1-3a)、年度Worker(A1-3b) |
| 退団/FA/引退予約/海外退出 | 共通command、保存根拠 | 新制度人UI、判断producer、年度接続 |
| posting退団/収入 | end-contract / complete-posting。明示金額が入力 | 申請/GM判断→資格→市場→選手受諾を先行させる |
| 引退試合収入 | 予約に紐づく一回限りの記録 | 開催・収入額producerと年度審査 |
| 今回 | 明示申請・一度のGM判断・追記証跡・旧mailのannual混入防止 | approvedの市場解決は未接続。承認を成立扱いしない |
| 公開/長期 | 公開ゲートOFF | 長期実プレイ、実機、A1-4校正後に別判断 |

Task7/A1-2cもA1全体も未完了。新しい申請はまだUI/CPUから生成しない。pending/approvedは未接続の進行を明示拒否するため、一般公開に利用しない。

## 入力・正本の監査

- 人/CPUの明示最終contractはpostingIncomeが正本。今回のGM approveはcontractを生成しない。
- 現在の選手はworld.teams、雇用・給与・保証はengine.spending.ledger、年度許可はauthorizations＋budgetPolicies。申請だけでこれらを更新しない。
- request-postingは明示希望という入力事実。希望発生確率は未実装。personality.overseasの閾値は旧ゲームパラメータであり制度ではない。
- bootstrapTeams/createInitialTeamsが実プレイ初期名簿の入口。playerMaster2026.release.jsonには出生日・履歴・出典があるが、全選手のMLB認定プロシーズンの完全性・認定国/リーグ/欠測は定義されていない。
- serviceYearsは旧offseasonで育成を除いて加算される。entryYear/draftYearからの年差も認定プレー期間ではない。isForeign/外国人枠は出自/MLB資格の代替ではない。
- optional engine.postingApplications とtransactionを既存envelopeで一括保存。派生statusは保存しない。次の市場工程がapprovedを読み、同じ元契約・season・保存identityを使う。
- 旧useOffseason.handleMailActionは承認直後に名簿を除去し20%をbudgetへ加算していた。今回、最新mode/sessionがlegacyの時だけ到達可能にした。旧オフ開始全体は既存canProgressLegacyで既に閉じている。legacyの実際の入金・拒否は変更しない。

## 一次資料の確認と未決点

参照日2026-11-04。制度とゲーム内方針は別に記録する。

- [MLB公式用語集](https://www.mlb.com/glossary/transactions/japanese-posting-system): 年齢25歳・認定プロ6季は制限免除の条件。申請自体の下限と混同しない。
- [MLB公式の2017合意発表](https://www.mlb.com/press-release/mlb-clubs-ratify-new-posting-system-agreement-with-npb-262712102): majorの段階式/ minorのbonus基準を既存quotePostingIncomeと照合。追加給付の対象も区別する。
- [NPB公式ポスティング移籍公示](https://npb.jp/announcement/pn_released_posting.html): 移籍に伴う公示の記録であり、申請/承認だけの退出を裏付ける一覧ではない。
- 旧2013協定や2017発表の交渉日数を現行仕様にしない。現行MLB用語集を参照し、後続で交渉期限/公示日/ゲーム時計の対応を明示する。現実の制度改定を何十年先まで自動適用する仕組みは今回作らない。

既存の譲渡金式と境界値は変更せず対象テストで回帰する。既存JPY150/USD・100%翌年限定配分は承認済みゲームpolicyであり、制度の税・送金日・実勢為替ではない。

### 次に必要な仕様判断（このPRでは未採用）

| 論点 | 選択肢とトレードオフ | 推奨する次工程 |
| --- | --- | --- |
| 認定プロシーズン | 出典付きseason集合＋ゲーム生成後の確定年を蓄積: 正確だが取込/年度producerが必要。既存serviceYears流用: 小さいが誤判定するため不可 | 正本データとunknown/制限あり/免除を分離。欠損を0にしない |
| 出生日/年齢 | 署名日時点の出生日計算: 境界正確。ageのみ: 年次加齢との曖昧さが残る | 実選手は出生日、架空選手はゲーム内明示事実を設計 |
| 契約提示額/成立 | 明示policy/評価根拠/実績分布で校正: 手間はあるが追跡可能。tradeValue固定円係数: 早いが根拠不足 | minor bonus poolとmajor評価を分けて候補policyを比較し、基本方針をユーザー確認 |
| 希望発生/受諾/辞退 | 個性・NPB残存条件と比較する効用モデル: 判断を説明可能。固定成功率: 単純だが意味が薄い | 既存契約/個性の入力正本を確認し、価格モデルと同時校正 |
| 乱数 | randomRootからsave/epoch/year/player/purpose別scoped draw: 再現可能。旧rngfグローバル消費: retry順に依存 | Task10予定のeconomyRandomと重複しない単位に分離 |
| 不成立 | 同じ元契約・所属・許可を維持、結果を保存し同年再抽選不可 | approvedから唯一の市場receipt。提示なし/辞退/成立を分ける |
| 成立 | 新市場receiptと既存complete-postingの退団/収入/許可を一候補に | standalone入口のバイパス禁止を維持し、内部子commandと相互照合 |

推奨順序: **資格の根拠データと市場policy設計→再現可能な市場結果/受諾・不成立→人UI→CPU接続→年度Worker→長期/実機/公開判断**。引退試合の開催/価格producerは別の独立単位。MLB30球団の個別経営は不要。

## 検証記録

- baseline: 既存posting退団/収入2ファイル56件成功。
- RED: 新モジュール欠損を確認。旧mail annual accept/decline/stale callbackは3件とも期待falseに対しtrue、直接旧処理へ到達することを再現。
- 新規core/実保存/旧hookの最終結果、独立レビュー、提出HEADのCIはPR本文と本書の追記を正本とする。
- 実画面の新UI、実iPhone、長期経済、MLB資格・市場価格・希望/受諾乱数、Worker producerは未検証/未実装。旧画面の入出金回帰はCIのposting/finance E2Eで確認する。
