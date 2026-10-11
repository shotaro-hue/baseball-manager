# F-02 独立記録・移行・保存契約

main `9fb8c0d5a9139cee79f91afc69295688c42f11b8`、PR #437取込済み。合意FIX-F v1.1のF-02。通常ゲーム・Worker・hook・UI・旧stats2/旧年末試合への接続はF-03。新DB/scopeは足さずv6保存を使う。

## 正本と適用

root `farmCompetition` version 1はsaveId/modelVersion/year/startRound/nextRound/source、固定球団識別情報、選手の年度・球団別成績、直近7round登板負荷、軽量カード要約、旧値保全を持つ。配列でID 0/特殊文字を保持し、文字列化した同一IDの重複は拒否。選手の名前・投手区分だけを保全し能力/契約のsnapshotを複製しない。
`createFarmCompetition({saveId,year,teams,startRound=1,source='new',legacy})`、`applyFarmRound(competition,result,teams)` は純粋関数。予定カードはF-01の日程と完全一致する6件、year/round/version/所属を検証。既処理roundは内容まで検証し同じ軽量要約なら無加算、違えば競合として拒否。未処理はnextRoundのみ許容。全カードを検証してから候補を返す。実施はvalidateFarmGameで全イベント/個人成績を検証後に圧縮し、未実施は双方と理由を記録する。
カードは得点・イニング・アウト・打撃/投球の球団合計と警告だけを保持、全打席ログ・能力・1試合ごとの全選手boxを保存しない。選手の球団別成績が正本、球団戦績/年度合計はselectorで導出。移籍・昇降格・退団後も既存選手記録は削除せず、同球団へ戻れば同じ球団別記録へ累積。所属teamIdから当時のリーグを保持。

## 検証とselector

保存・復元前に全計数、打撃/投球恒等式、カード一意性と連続round、双方の対戦計数、イニング/終了条件、球団別選手合計とカード合計、使用選手/負荷を照合。不整合をゼロ埋めしない。適用前はイベントまで検証し、保存後は圧縮要約と年度集計を検証する。削除したイベントはロード時に再現検証しない（チェックサムも改ざん防止署名ではない）。
selectorは年度/球団/リーグ指定で選手成績・球団戦績を返す。現所属から探さない。未記録、記録期間での未出場0、AB/outs=0の算出不可、旧推定、途中記録、非対応を区別。打率H/AB・ERA=ER×27/outs・投球回の整数商/余り。SF/SHはモデル上0、SV/HLDは非対応。

## 旧移行と年度

`migrateFarmCompetition(state)` は明示的な純粋API。loadだけで自動起動/上書きしない。通常dayは次roundであることを現行seasonProgressで確認し、球団のwins/losses/draws、当年結果map、offseasonPlan、任意の日程と照合。途中戦術試合は未完了roundから、球宴は公式roundを追加しない。矛盾は推測修復せず拒否。143試合終了ならstartRound=144の当年空記録を保持し次年度開始を待つ。
旧値はteams.players/farm/history、faPool、offseasonPlan内のstats2を所在付きで複製し、year=null/由来legacy-estimatedとする。欠落AB/outsや年度を補完せず、旧値は足さない。元の各容器/選手を変更しない。startRound>1の年は途中記録で年間表彰不可。
`advanceFarmYear(state,{year,teams})` はnextRound=144の旧年度を集計archiveし、新年root・state.year/gameDay=1・所属を同じ候補に含める。archiveは選手球団別実績/球団戦績/由来のみ、カード/使用負荷を除く。年数制限なし、同年度重複禁止。返った候補は保存成功後だけ公開する（実hook接続はF-03）。

## 保存確定境界

条件付きfarmCompetition対応だけをsaveloadへ追加。未導入セーブは従来経路のまま。導入済みはrootにversion markerを持ち、記録の脱落・異なるsaveId/year・一軍の公式進行位置との不一致を拒否。rootのarchive checksumとseasonHistoryチャンクを照合し、年度archive変更時はdirtyScopesが空でもseasonHistoryと初期化済みmatchHistoryを必ず更新する。
chunk transaction→root setItemの既存境界を維持。root保存失敗/IDB abort/欠落chunk/破損記録では前の正常世代とbackupを保護。再試行は候補を再保存し試合を加算しない。復旧はそのrootの当年記録とarchiveだけを参照する。導入済みデータを含む保存要求でfieldを落とすことも拒否する。

## 添付レビュー

サヨナラ後の追加打席は、現在のvalidateFarmGameがrunLimit<=0のadvanceFarmBasesを拒否する可能性もある。カウントを整合させた追加OUT/四球/HRの再現テストで判定し、修正済みなら再実装しない。F-02の適用境界にも同じ拒否を保証する。
捕手不在による143カード未実施は仕様。保存・復元後も理由と双方の予定/未実施数を維持する。補強AIは後続で扱う。

## 実装時の確認結果

サヨナラ後のOUT/BB/HRを整合した追加イベントとして作り、現行validateFarmGameが既に拒否することを3件で確認。runLimit<=0をadvanceFarmBasesが拒否する既存経路を維持し、二重の修正は追加しない。
rootのcompetitionには内容checksumも付け、構造上もっともらしい出場負荷・個人帰属の破損を検出する。これはセキュリティ署名ではない。年度候補は既存nextSeasonMatchHistoryを再利用して当年map/球宴/会見を初期化し、日程archiveの既存方針を維持する。通常進行への呼出しは足さない。新年度scheduleの生成はF-03の呼出し側が担い、advanceFarmYearへ渡すstateのscheduleを新年度日程に差し替えたうえで、保存成功後に候補を公開する。
既存fixtureによる独立記録の限定測定：5round約104ms、143round約4.32s、当年JSON719,966bytes、圧縮集計archive59,768bytes、同じ規模を20年度並べる代理容量約1.20MB。Vitest並列実行下での1回、能力/condition固定、登板間隔はusageで選考へ渡した。実プレイ20年・ネイティブDB容量・メモリ測定・F-04最終性能合格ではない。

独立レビューで、空dirtyScopesの年度更新と破損主データからの復旧後保存を再現。年度更新でmatchHistoryも強制更新し、バックアップ回転前に旧root+復元chunkの二軍整合性を検証する。双方の失敗テストを確認して修正。
