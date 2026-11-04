# A1-2c-4b ポスティング退団・解除合意の検証

基準main: 3b6192e32568ee14710f9842bc402afba166e698（#542マージ後）。

## 正本・更新経路

明示postingRequestedを持つ支配下の保有選手 → end-contract(reason:posting) → 共通quote/reduce → commitEconomyCandidate → 世代保存/cold load。
資格・所有者・給与・残期間は既存契約台帳、通知日は検証済みclock、配置はworld.teamsが正本。legacyのposting承認handlerは今回接続しない。
満了は自然満了、継続は翌2月1日のend/posting。名簿と配置参照だけを削除し、証明snapshot・元契約・合意・end action・球団履歴・receiptを同じ候補に保存する。
NPB市場・FA補償・posting収入を作らず、元の予算へ直接返金しない。将来の追加余力は台帳と最低維持費から再投影する。

retainは既存/未知の保証を維持する。waiveには今回の合意IDが必須で、agreedDateは通知日の12月1日から生成する。翌2月1日を合意日として捏造しない。
そのため既存ledgerの合意日検証を実暦日＋直近の契約変更日以降・終了効力日以前へ拡張した。従来の同日合意、合意ID一意、旧保証不明の合意必須、保証releaseのretain義務、closed-year保護と計算式は維持する。

未回答の正式留保・人向けpending更改・受諾済み将来契約・引退予約は拒否。取消後の再提示を許す。未更改計画は既存の退団投影から見積対象を外し、根拠を残す。
元契約一意条件とfuture end/11月30日名簿照合へ参加し、v2のend/postingに証跡を要求する。FA再契約後の新しいposting履歴は古いFA履歴markerを重複させない。

## RED→GREEN・回帰

- 着手前の台帳/移行/冬退団155件成功。
- 初回の追加24件で未実装command・合意日制約による11件RED、最小実装後24件GREEN。
- 財務/競合/実データを追加した際の3件はfixture側の未来日付increaseと実選手ID指定不足を特定。時計を実fixture日程の7月17日へ進め、正しい選手IDを使って修正。期待する給与/保証/所有者/保存結果は緩和していない。
- 新規31 posting engine＋6 ledger date＋8実保存＝45件成功。ID0、単年/複数年、retain/waive、active/farm、申請なし/育成/期中/入力偽装拒否、留保/取消/受諾/人pending/引退予約を含む。
- 移籍と昇給後の過去給与・現在負担者・翌年保証、2025/2026の既経過給与、実prepareEconomyMigration由来のunknown保証を確認。旧契約にsignedSeason/保証を追加しない。
- 将来予算1000万円でretain＋空き枠420万円の悪化を拒否し、明示waive後も最低維持費を引いた580万円だけを追加余力として確認。
- 先行posting後の他選手FA順位、FA宣言→実再契約/join→翌年posting、過年度のJSON/replayを確認。
- 実createInitialTeamsの名簿・給与・元の残年数を維持し、対象選手の申請flagだけの条件違いで拒否/正常を対で検証。実際の申請抽選やUI/CPUの接続試験ではない。
- inlineは通常圧縮、外部rootは無圧縮＋paddingで境界を確認。公開失敗時の元world/雇用/保証/rootを保全、retry/cold load/replayを確認。合意日をrecord/receipt/ledgerで同時改変しても拒否。自然満了でendがない場合の巻戻し保存もprefixで拒否。
- 関連44ファイル1551件成功（新規45件を含む）。build成功（既存bundleサイズ警告のみ）。別コンテキストの独立レビューでP0〜P2指摘なし。レビュアーも45件を実行して成功し、日付・未知保証・合意ID・将来約束・証跡・性能を点検。

最終HEAD、PR、必須CIの結果はPR本文へ記録し、検証済みcommitを記録だけのために更新しない。

## 残工程・限界

posting収入・引退試合収入、UI/人の承認・CPU判断・旧mail対応、年度/Workerへの自動接続は未実装。満了契約のwaiveは残債がなく合意を台帳に結び付けられないため拒否する。
期中のpostingは許可しない。大量の長期履歴・実端末は未検証。独立ファイル全体を別の正当な過去状態へ戻す改変の暗号学的認証は行わず、既存rootへの上書きはimmutable ledger/receipt/record prefixで保護する。
Task7/A1全体の完了ではない。公開OFF、schemaVersion1/DB5、旧スカウト終了を維持。main push・マージ・自動マージは行わない。
