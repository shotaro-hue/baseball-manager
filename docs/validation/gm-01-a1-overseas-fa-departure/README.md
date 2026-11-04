# A1-2c-4a 海外FA市場退出の検証

基準main b14aaf9ec732b6769a5b2a7e892818272560f82d（#541マージ後）。
「次へ進んで」に基づき、Task7の未実装部分から独立して検証できる海外FA市場退出を選択した。

## 正本と境界

createInitialTeams/createAnnualNewGameWorld → declare-fa → depart-overseas → 共通quote/reduce → commitEconomyCandidate → 世代保存/cold loadの順。
資格・満了元契約・順位・行使歴・元球団のsnapshotは既存faDeclarations、現市場はworld.faPool、日時は検証済み契約時計が正本。
新しいoverseasDeparturesは宣言/元契約/市場entryの参照と退出日時だけを持つ。既存FA宣言のsnapshotを重複させず、receiptと同時に保存する。
自然満了後の市場退出なので新しいend/waive、国内FA補償、臨時収入、直接budget返金を作らない。

NPB市場への未回答オファーは取消後に進める。人向けpending獲得と同一entryの受諾済み契約は非変更拒否。
宣言検証は先に海外離脱を検証してから市場不在の例外を与える。元宣言の資格/台帳/順位/球団履歴は引き続き検査する。
保存時は既存receipt prefixに加えて海外離脱配列のprefixも保全し、過去の市場へ戻す上書きを拒否する。

## 実行記録

- 着手前のFA宣言・冬退団・引退136件成功。
- 初回の新規21件で、未実装commandによる12件RED／既存拒否等9件成功を確認した。
- 最小実装後21件GREEN。明示nullを欠損と混同する追加1件のREDを確認し、optional fieldはundefinedだけを旧欠損として扱うよう修正した。
- 新規25 engine＋5実保存、計30件GREEN。ID0、quote非変更、replay、国内FA/自由契約/別球団/別entry/外部日時/waive指定拒否、未回答オファー・取消・受諾済み・人pending、旧v2/v1/legacy、改変/孤立/同時削除/再掲載、JSON/過年度履歴を含む。
- 実createInitialTeamsの在籍日数0で正当な宣言拒否を確認。唯一年俸かつ満了する実選手の日数だけ1080にした資格到達シナリオで、海外FA宣言→市場退出→冷読込が成功した。給与/区分/名簿は元データを維持。実プレイ9年経過の検証ではない。
- inline rootは通常圧縮、外部rootは無圧縮＋paddingで実境界を確認。公開失敗時の元world/市場/root保全、retry、cold load、再実行一回性を確認。
- 記録/receiptを削除して元市場を戻した構造的に有効な候補も、公開済み履歴との比較でeconomy_history_conflictとして保存拒否し、rootを維持した。
- 初回npm run build成功（既存bundleサイズ警告のみ）。関連36ファイル1477件成功（新規30件を含む）。さらに既存FA資格・posting hook・引退保存4ファイル28件が成功し、計40ファイル1505件を確認。
- 11afaaaの実装差分を別コンテキストで独立レビューしP0〜P2指摘なし。レビュアーも対象30件を独立実行して成功。資格・市場・履歴/receipt・保存prefix・未回答/受諾済みNPB契約・追加検査の性能を点検した。実際の再雇用/長期進行・実機は独立レビューでは未検証。
- CI待機中の追加自己監査でP2を再現。同じ元契約に対する自然満了/自由契約とFA宣言後の海外退出の記録・receiptを合成すると、矛盾した市場を受理した（再現1件RED）。各退団の個別検証だけでは、相互に両立しない退団経路を検出できなかった。
- 共通annualTransactionsの検証で、満了/解雇・引退・FAのsourceContractIdを全体で一意にした。新しい台帳actionや計算変更はなく、再雇用後の別契約は許す。対象/近傍6ファイル167件GREEN。後年の別契約による再FA宣言も含む全41ファイル1506件を再実行して成功。
- この追加修正は作者がRED→GREEN・回帰と差分を確認したもの。独立レビュー後の修正であることを区別し、新しい提出HEADのbuild・必須CI結果はPR本文を正本とする。

## 範囲と限界

v2/offseasonの同年度12月1日の海外FA市場退出だけを接続。元球団のFA宣言履歴は保持し、実際の海外退出の証跡はoverseasDepartures/receiptが所有する。
契約中の海外離脱/解除合意、posting/引退試合収入、人のUI・CPU、年度/日次/Workerへの自動接続は後続。年を変更したテストは保存された過去履歴の照合で、Task10の年度更新実装ではない。
暗号学的な保存データ認証は行わず、履歴一式を過去の正当なsnapshotへ戻した独立ファイルは以前の正常保存と区別できない。既存rootへの上書きは履歴prefixで保護する。
公開ゲートOFF、schemaVersion1/DB5、旧スカウト終了方針を維持する。Task7/A1全体の完了ではない。mainへのpush、マージ/自動マージは行わない。
