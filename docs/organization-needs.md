# AI-01: 組織の補強ニーズ評価の基礎

基準: `d08e5a1002bae266df46a135fcda5c471009feae`。AI-01は読取専用の純粋評価だけを追加する。既存の `analyzeTeamNeeds`、CPU指名・FA・トレード・更改・放出の得点や判断、初期生成、state、保存形式、乱数、契約・支配下70枠を変更しない。接続・得点調整はAI-02以降の別PRで扱う。

## モジュール契約

`evaluateOrganizationNeeds(team, { teams = [team], draftPool = [], drafted = {} })` を `src/engine/organizationNeeds.js` から公開する。引数を変更せず、乱数を消費せず、結果を永続stateへ格納しない。`teams` は所属済み候補を全球団で除外するため、後続のリーグ処理では全チームを渡す。評価対象球団は常に第1引数の最新状態を使う。

成功時は `ok: true`、`roles`、`registeredCount`、`acceptedPickCount`、`acceptedPickIds`、`remainingActiveSlots`、`remainingRegisteredSlots` を返す。所属選手のID未記録・一軍/二軍内重複・球団間重複は `ok: false, reason: 'invalid-owned-ids'` を返す。ID 0は有効。支配下枠残数は育成を除く所属人数＋受諾済み未所属指名者から計算し、0未満にはしない。残枠が0でも評価は可能だが、獲得の許可は与えない。

役割は `starter` / `reliever` / `closer` / `catcher` / `shortstop` / `secondBase` / `thirdBase`。投手は既存 `subtype`、野手は既存ニーズ評価と同じ主守備 `pos` で数える。副守備・同時守備割当・能力の適性評価はこの人数評価に含めない。

| 出力 | 意味 |
|---|---|
| `ownedActiveCount` | 一軍所属の役割人数。負傷・育成等も所有として保持 |
| `activeCount` | 一軍の健康・非育成・登録待機なしの役割人数 |
| `farmCount` | 非育成の二軍所属人数。負傷・待機も所有として保持 |
| `developmentCount` | 一軍＋二軍の育成人数。`育成` / `isIkusei` 両方を使用 |
| `availableFarmCount` | 健康・非育成・登録待機なしの二軍人数。一軍の空きや外国人構成を適用する前の昇格資格 |
| `directlyPromotableFarmCount` | 上記から、一軍28枠・現在の外国人4枠と投打構成制約を満たす直接昇格候補の人数 |
| `ownedCount` | 一軍＋二軍＋育成の所有人数 |
| `acceptedPickCount` | 受諾済みだが未所属の指名者。所有人数と別計上 |
| `organizationCount` | `ownedCount + acceptedPickCount`。現在出場可能な人数ではない |
| `activeShortage` / `organizationShortage` | 対応する既存最低人数を下回る人数 |
| `futureDepth` | 先発のみ既存年齢ルールによる若手・主力年齢層。その他の役割は未評価の `null` |

昇格判定は既存 `rosterAutomation.canAddToActiveRoster` を公開して再利用する。同関数の動作は変えない。`availableFarmCount` は同関数へ空の一軍を渡して個別資格を評価し、直接昇格では実際の一軍を渡す。全候補を同時に昇格できる人数や、能力的な即戦力人数を意味しない。外国人枠や満員の一軍への入替は別途検証する必要がある。

受諾済み指名者の入口は `draftPicksForTeam`。その後、明示的な入団拒否、1巡目と後続巡の所属競合、ID未記録、既所属（他球団も含む）、同じ候補の重複を除外する。育成フラグ付き候補も入団時の既存支配下契約規則に沿い、指名者として1枠予約する。一軍の稼働人数へは加算しない。

最低人数は既存 `analyzeTeamNeeds` の先発4・中継ぎ3・抑え1、一軍捕手 `MIN_ACTIVE_CATCHERS`（2）、組織捕手 `MIN_TOTAL_BY_POS`（3）、遊撃・二塁・三塁の組織最低人数（各2）を用いる。内野の稼働最低人数は既存守備位置の各1人。投手に新たな二軍最低人数は設けない。

先発の `futureDepth` は既存ニーズの若手24歳以下・最低2、主力年齢30歳以下・最低3を使う。欠けた年齢は既存処理と同じ25歳。`youngValue` は若手の既存 `tradeValue` の合計で、能力閾値や新しい将来価値係数は設けない。負傷・育成・指名者は将来層へ含める。他の役割には既存の将来層最低人数ルールがないため、`future-depth-unassessed` と `null` を返す。将来の成長量や引退確率を予測した値ではない。

`classification` は優先順に、稼働不足＋昇格資格のある二軍なら `active-shortage-with-farm`、稼働不足＋組織も不足なら `organization-shortage`、稼働不足＋所有層はあるが現在使えないなら `active-shortage-unavailable-depth`、稼働充足＋組織不足なら `organization-shortage`、先発の将来層のみ不足なら `future-depth-shortage`、それ以外は `covered`。複数の課題は `reasons` と個別不足人数に併記する。`covered` は人数基準の充足を意味し、未評価の能力・将来層の充足は保証しない。

## 静的確認と後続範囲

以下は現行コードの判断経路の分類であり、長期シムで頻度・被害を測定した確定バグ一覧ではない。

| 項目 | 現行確認 / 分類 | AI-01での扱い |
|---|---|---|
| A01 | `draftRules.chooseDraftProspect` の投手加点は先発・中継ぎ・抑えを区別しない。静的な調整候補 | 役割別の評価結果を追加。得点は変更しない |
| A02 | `analyzeTeamNeeds` の `includeFarmPitchers` は一軍と二軍候補を同じ人数へ含める。目的の異なる母集団が混在 | 稼働、二軍資格、所有、指名者を分離 |
| A03 | 捕手の一軍不足は指名者がいても継続する。現在の稼働判断では妥当な場合がある | 一軍不足と組織不足を別出力。指名で一軍不足を消さない |
| A04 | `draft.recommendForTeam` と `DraftPreviewScreen` の予測は通常のニーズ、指名本体は二軍投手を含むニーズを使う。母集団差は静的確認済み | 表示・推薦・予測は変更しない |
| A05 | `contract.processCpuFaBids` は稼働ベースのニーズ＋役割適合＋編成方針を評価する。シーズン中の獲得として妥当な場合がある | FAの得点・契約・配置を変更しない |
| A06 | `contract.cpuRenewContracts` に役割別最低深度を保持する保証はない。実害・発生頻度は未測定 | 更改・放出・費用を変更しない |
| A07 | #435/#444/#445等の既存ID 0・重複防止・指名済み反映、FIX-Dの抽選/拒否/70枠が前提 | 既存経路を保持し、評価のID・予約枠・保存再開を検証 |

AI-02以降で指名・推薦・予測や他のCPU判断へ接続するときは、各判断が必要とする稼働/組織/将来の区別を明示する。本基礎だけでCPU補強全体や5/20年バランスの改善を主張しない。

## 検証

`src/engine/__tests__/organizationNeeds.test.js` は通常Vitestの収集対象。役割・負傷・登録待機・育成両フラグ・外国人投打制約・28/69/70枠・指名者ID 0/拒否/所属競合/重複・球団間重複を確認する。深いfreezeと乱数呼出禁止の試験、実際の `saveGame` / `loadGame` による再計算一致を含む。画面・E2E・複数年CPU行動の検証はこの接続前の基礎では行っていない。
