# UI-02E — 二軍育成・起用・会話画面

基準main: `b509a9ce8910090b00838106127ee5da80df69a6`（PR #460マージ後）。最新mainのGitHub確認と専用cloneのSHAを照合し、`feat/ui02e-farm-development`で作業。添付ZIPは古く、基準にしていない。ユーザーが本Workでの実装を指示したUI-02E依頼書と承認済みDES-01を仕様とし、同じ要件の再承認は求めていない。

## 目的・設計

二軍実測成績と現在状態を読み、育成目標・昇格・支配下登録を判断して編成へ戻る。既存の一軍向け会話も同じ表示・操作基準に移行する。

- RosterTabのfarm/talk部分をFarmDevelopmentPanel/PlayerTalkPanelへ抽出。既存callback・内部tab・主要ナビは維持。MobileRosterの二軍概要に詳細設定を直接開く入口を追加し、summaryへfocusする。
- DES-01のネイビー見出し・白い一覧・青い操作と既存Button/DataTableFrameを使用。スマホでも名前と育成目標・起用を同じ幅内で見られる2列の表にし、役割・年齢・契約区分・育成年・潜在・主要能力・状態・実測を残す。44px操作、名前折返し、表だけのスクロール、固定名前列を維持。色は対象scopeへ限定。
- 育成目標は既存の野手/投手選択肢と非同期setDevGoalに接続。保存されたdevGoalをcontrolled valueとし、呼び出しただけで変更・保存成功を表示しない。現在選手そのものを名前buttonから既存PlayerModalへ渡し、同modalのfocus/scroll復帰を再利用する。
- 既存推薦の潜在能力順は保持。推薦が実行可否の保証ではないことを表示。表示用promotionReasons/registrationPreviewは読取専用の理由・条件説明で、hookによる最終検証・更新を迂回しない。
- 支配下登録は対象・現在/登録後年俸・差額控除・登録後予算・支配下人数・1年契約と育成年数リセットを確認してから既存convertIkuseiを1回呼ぶ。戻る/Escapeではゲーム状態を変更しない。二軍支配下への変換と一軍昇格は別操作。justConvertedという呼び出しベースの成功stateを廃止し、実際に育成フラグが変更されたときだけ同じ行を昇格操作へ切り替える。
- 会話は現在の一軍のみ。低モラル順を維持し、欠測のソート既定値70は旧処理と同じだが表示では未記録とする。morale 0は0。gameDayとTALK_COOLDOWN_DAYS=18による既存間隔を表示し、暦の「月1回」と混同しない。開閉のみでは実行せず、種類選択時に既存handlePlayerTalkを1回呼ぶ。変化量の範囲と0〜100の最終値を区別し、実データと既存通知で結果を確認する。

## 照合した既存処理と非対象

AGENTS/CONTRIBUTING/ROADMAP、DESIGN_SYSTEM/TEST_STRATEGY、青写真・SPECの関連部分、UI-02A/B/C/D1/D2/D3の記録と対象コードを照合した。

promoteは育成・一軍28枠・外国人4枠/同種4人・再登録待ちを検証する。旧UIの負傷中禁止も表示側で維持した。convertIkuseiは支配下70枠に加え一軍満杯も拒否し、最低年俸420万円への差額を予算から控除し、契約年数/残年数を1にする。意図の再設計はせず、その現在の条件を説明する。金額は内部万円のまま既存fmtSalへ委譲する。setDevGoalは既存player moduleがtrainingFocusを決定し、一軍・二軍の実体を更新する。会話はteam.playersのみを更新し、lastTalkGameDay>0の既存判定・乱数・年俸/出場/性格の判定は維持する。

promote側に負傷チェックがない点、convertIkuseiの一軍満杯制約、既存通知の差額表記、会話の年俸閾値とlastTalkGameDay=0の扱いは既存ドメインの照合事項。このUI PRで処理を変更しない。再現・仕様整理は別工程。

ゲームエンジン、Worker、育成効果・乱数・CPU、記録計算・順位、保存スキーマ、主要ナビは変更していない。二軍会話・二軍コンバートの新設、FIX-S3、まとめ結果/試合詳細、UI-03、長期バランス、旧CSS全体整理は対象外。

二軍のFarmRecordScope/FarmRecordSummary/selectorを再利用し、一軍・実測・旧推定・当年/過年度を合算しない。実測0・未記録・分母不足・途中記録を維持する。

## 検証記録

- 基準main: 関連5ファイル28件成功。同一lockのnpm ciを初回のみ実行、依存・lock更新なし。
- 新規component 6件で名前付き操作・確認・モラル/欠測・実行の不足をRED確認後GREEN。追加の二軍概要入口もRED→GREEN。新規9件と既存編成概要/設定の11件、計20件成功。
- 全Vitest: レビュー修正後のnpm testで151ファイル1090件成功、既存条件付きskip 2件（21.63秒）。buildも修正後に成功、既存の500kBチャンク警告のみ。diff check成功。
- Playwrightは段階ごとの実行結果を以下に示す。新しいfarm-development.spec.jsは通常CIのroster-settings群へ追加。既存全unit/build、他E2E、workers=1/retries=0、全成功の集約ゲートを維持。
- 新規の7幅（360/390/760/761/1023/1024/1440px）×15状態で44px操作、ページ横溢れ・セル内収まり、確認のTab循環/Escape/取消、非楽観成功表示を確認。実App360/390/1440pxで目標→支配下登録取消/確定→昇格、降格クールダウン、4種類の会話、teamsの想定外変更検出、二軍/年度履歴の不変、保存再読込を確認。新規10件は対象実行で成功。既存F03/F04の6件とUI-02B390pxの表示・実操作2件も成功。
- 初回実App失敗はfixtureが4人の会話対象の1人を先に降格させたことが原因。traceで対象不在を確認し、降格対象を別選手にした。対象一軍の仕様・assertion・timeoutは維持。
- 既存UI-02Aの全button無効assertは、名前がnative buttonになって昇格buttonと同時に拾われるためRED。選手名付きの昇格操作を指定し、旧「↑一軍」selectorも同じ名前付き操作へ更新。所属・冷却期間・昇格・保存/再開のassertionは維持。次の対象実行では開閉用summaryが新しい記録説明も拾って3件失敗したため、直接の子summaryへ限定。試験の意味は変えていない。
- 一度の並行unit/E2E実行はブラウザ結果が途中で終了したため未認定。E2Eは単独で実行。混合21件の実行は18成功・上記summaryによる3失敗で、全成功とは認定しない。初回失敗や途中結果を最終成功件数に合算しない。
- 独立読取レビューはドメイン・保存・制約について重大な指摘なし。会話成功時に旧openerが待機表示へ変わりfocusが消える指摘を、通常のキーボード操作で対象を見失う問題として修正。実App390pxでfocus assertionのREDを確認し、commit後の実行で同じ選手の名前へfocusを戻す（操作不可なら表へ戻す）。その選手行がモラル順で移動してもIDで追う。
- 最終のレビュー修正・旧selector修正後: npm run test:e2e -- farm-development.spec.js match-history.spec.js --grep 'UI-02E actual|UI-02A actual' --workers=1 --retries=0、6件成功（3.1分）。新規実App3幅で4会話すべての成功後focus、既存UI-02A3幅で昇降格→保存/ロード→実1試合の再開を確認。修正後の全unit/buildも成功。
- 通常Git pushはCLI認証がなく失敗。GitHub連携で各blob SHAとlocal git blob SHAを照合し、公開tree全体と検証済みlocal treeを完全一致で照合する。最新PR headのCI結果はPR本文へ記録する。同一headの成功済み全セットを再実行しない。

## 同じ表示状態の前後

同じ既存ui02b/team.jsonの自球団・2026年・通常状態をChromiumで比較。360×800/390×844/1440×900px。詳細設定の領域全体画像で、初期viewportや実端末保証とは区別する。旧推定の保存値はそのまま。実アプリの更新・保存とは別の表示fixture。

|幅|二軍 前 / 後|会話 前 / 後|
|---|---|---|
|360px|[前](../validation/ui02e/before-farm-360.png) / [後](../validation/ui02e/after-farm-360.png)|[前](../validation/ui02e/before-talk-360.png) / [後](../validation/ui02e/after-talk-360.png)|
|390px|[前](../validation/ui02e/before-farm-390.png) / [後](../validation/ui02e/after-farm-390.png)|[前](../validation/ui02e/before-talk-390.png) / [後](../validation/ui02e/after-talk-390.png)|
|1440px|[前](../validation/ui02e/before-farm-1440.png) / [後](../validation/ui02e/after-farm-1440.png)|[前](../validation/ui02e/before-talk-1440.png) / [後](../validation/ui02e/after-talk-1440.png)|

## 未検証・後続

iPhone実機・専用Safari/WebKit・スクリーンリーダー・200%拡大は未検証。通常CIの既存WebKit保存/進行を今回の専用Safari検証とは扱わない。複数seed・実複数年のバランスや全E2Eも今回の完了認定に含めない。

PR #460/UI-02D3をマージ済みに更新し、UI-02Eは本PR未マージとしてROADMAPへ記録する。UI-02全体の完了ではない。まとめ結果/試合詳細、UI-03、FIX/AI/長期検証の残りは別工程。

