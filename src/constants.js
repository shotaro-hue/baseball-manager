/* ═══════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */

export const SEASON_GAMES = 143;
export const HANSHIN_ID = 3;   // 阪神タイガース（甲子園使用制限の影響チーム）
export const ORIX_ID    = 11;  // オリックス・バファローズ（京セラドーム共同利用）
export const KYOCERA_DOME_TEAMS = [3, 11]; // 甲子園制限期間中に京セラを共有するチーム
export const BATCH = 5;
export const MAX_ROSTER = 28;
export const MAX_FARM = 30;
export const MAX_外国人_一軍 = 4;  // NPB規定: 一軍出場選手登録は外国人最大4名
export const ACCEPT_THRESHOLD = 55;
export const MIN_SALARY_SHIHAKA = 4200000;  // 支配下選手最低年俸 420万円 (NPB協約 第89条)
export const MIN_SALARY_IKUSEI  = 2400000;  // 育成選手最低年俸  240万円 (NPB協約)
export const ACTIVE_ROSTER_FA_DAYS_PER_YEAR = 120; // FA権1年分の一軍登録日数（NPB145日→ゲーム換算120日）
export const INJURY_AUTO_DEMOTE_DAYS = 10;        // この日数を超える怪我は自動二軍降格（NPB登録抹消相当）
export const REGISTRATION_COOLDOWN_DAYS = 10;     // 登録抹消後の再登録不可日数（NPB10日ルール）
export const MAX_SHIHAKA_TOTAL = 70;               // 支配下登録選手の球団総数上限（NPB協約第40条）
export const TALK_COOLDOWN_DAYS = 18;           // 同一選手への会話クールダウン（≈1ヶ月）
export const PRESS_CONFERENCE_INTERVAL = 15;    // 記者会見インターバル（ゲームDay）

// オーナー信頼度（ownerTrust）定数
export const OWNER_TRUST_BUDGET_LOW  = 30;   // 信頼度がこれ未満: 翌年予算 ×0.8
export const OWNER_TRUST_BUDGET_HIGH = 80;   // 信頼度がこれ超: 翌年予算 ×1.15
export const OWNER_TRUST_FACTOR_LOW  = 0.8;
export const OWNER_TRUST_FACTOR_HIGH = 1.15;

export const PITCH_NORM      = 120;  // calcFatigue 正規化分母
export const PITCH_HARD_CAP  = 130;  // 球数の絶対上限（安全弁）
export const FATIGUE_WARNING = 83;   // 疲弊度警告閾値（stamina=50, condition=100 時 ≈ 100球相当）
export const FATIGUE_LIMIT   = 100;  // 疲弊度強制交代閾値（stamina=50, condition=100 時 ≈ 120球相当）

export const TEAM_DEFS = [
  { id: 0,  name: "東京ヤクルトスワローズ",         short: "ヤクルト",   league: "セ", emoji: "🦢", color: "#22d3ee", city: "東京",   budget: 500000 },
  { id: 1,  name: "横浜DeNAベイスターズ",           short: "DeNA",       league: "セ", emoji: "⭐", color: "#3b82f6", city: "横浜",   budget: 480000 },
  { id: 2,  name: "広島東洋カープ",                 short: "広島",       league: "セ", emoji: "🎏", color: "#ef4444", city: "広島",   budget: 350000 },
  { id: 3,  name: "阪神タイガース",                 short: "阪神",       league: "セ", emoji: "🐯", color: "#fbbf24", city: "大阪",   budget: 600000 },
  { id: 4,  name: "読売ジャイアンツ",               short: "巨人",       league: "セ", emoji: "🟠", color: "#f97316", city: "東京",   budget: 650000 },
  { id: 5,  name: "中日ドラゴンズ",                 short: "中日",       league: "セ", emoji: "🐲", color: "#06b6d4", city: "名古屋", budget: 420000 },
  { id: 6,  name: "福岡ソフトバンクホークス",       short: "ソフトバンク", league: "パ", emoji: "🦅", color: "#f5c842", city: "福岡",   budget: 580000 },
  { id: 7,  name: "東北楽天ゴールデンイーグルス",   short: "楽天",       league: "パ", emoji: "🦆", color: "#dc2626", city: "仙台",   budget: 360000 },
  { id: 8,  name: "埼玉西武ライオンズ",             short: "西武",       league: "パ", emoji: "🦁", color: "#a78bfa", city: "所沢",   budget: 400000 },
  { id: 9,  name: "千葉ロッテマリーンズ",           short: "ロッテ",     league: "パ", emoji: "⚓", color: "#0ea5e9", city: "千葉",   budget: 370000 },
  { id: 10, name: "北海道日本ハムファイターズ",     short: "日本ハム",   league: "パ", emoji: "⚔️", color: "#818cf8", city: "札幌",   budget: 450000 },
  { id: 11, name: "オリックス・バファローズ",       short: "オリックス", league: "パ", emoji: "🦬", color: "#10b981", city: "大阪",   budget: 460000 },
];

export const POSITIONS = ["捕手", "一塁手", "二塁手", "三塁手", "遊撃手", "左翼手", "中堅手", "右翼手"];

export const COACH_DEFS = [
  { type: "batting",  name: "打撃コーチ",     emoji: "🏏" },
  { type: "pitching", name: "投手コーチ",     emoji: "⚾" },
  { type: "defense",  name: "守備コーチ",     emoji: "🧤" },
  { type: "running",  name: "走塁コーチ",     emoji: "🏃" },
  { type: "mental",   name: "メンタルコーチ", emoji: "🧠" },
];

export const COACH_GRADES = [
  { g: 1, label: "平凡",     salary: 3000,  bonus: 1 },
  { g: 2, label: "経験豊富", salary: 7000,  bonus: 2 },
  { g: 3, label: "一流",     salary: 15000, bonus: 3 },
  { g: 4, label: "レジェンド", salary: 30000, bonus: 5 },
];

export const SCOUT_REGIONS = [
  { id: "dom_a", name: "国内一軍候補",   weeks: 4,  qMin: 65, qMax: 82, cost: 5000,  foreign: false, regionFactor: 0.8 },
  { id: "dom_b", name: "国内独立リーグ", weeks: 6,  qMin: 50, qMax: 72, cost: 3000,  foreign: false, regionFactor: 0.9 },
  { id: "us",    name: "北米メジャー",   weeks: 8,  qMin: 70, qMax: 90, cost: 12000, foreign: true,  regionFactor: 1.2 },
  { id: "kr",    name: "韓国KBO",        weeks: 6,  qMin: 60, qMax: 78, cost: 8000,  foreign: true,  regionFactor: 1.1 },
  { id: "latin", name: "中南米",          weeks: 10, qMin: 55, qMax: 85, cost: 9000,  foreign: true,  regionFactor: 1.3 },
];

export const INJURY_TABLE = [
  { name: "打撲",     days: 3 },
  { name: "肉離れ",   days: 14 },
  { name: "捻挫",     days: 7 },
  { name: "疲労骨折", days: 30, severe: true },
  { name: "靭帯損傷", days: 60, severe: true },
  { name: "肩炎症",   days: 21 },
];

export const STRATEGY_OPTS = [
  { id: "normal",  label: "通常",      desc: "通常の打席",        icon: "⚾" },
  { id: "bunt",    label: "バント",    desc: "ランナー進塁を優先", icon: "🟡" },
  { id: "hitrun",  label: "エンドラン", desc: "走者がスタート",    icon: "🏃" },
  { id: "walk",    label: "敬遠",      desc: "申告敬遠",          icon: "🚶" },
  { id: "steal",   label: "盗塁",      desc: "走者が走る",        icon: "⚡" },
];

export const PITCHING_POLICY_OPTS = [
  { id: 'normal',   label: '通常',           icon: '⚾', desc: '標準' },
  { id: 'fastball', label: '速球主体',       icon: '🔥', desc: 'K率・HR率上昇、BB微増' },
  { id: 'breaking', label: '変化球主体',     icon: '🌀', desc: 'K率・GO率上昇、HR率低下' },
  { id: 'control',  label: 'コントロール重視', icon: '🎯', desc: 'BB大幅減、被安打微増' },
];

export const PVAL_DEFS = [
  { k: "money",     lbl: "💰 金銭欲",     color: "#f5c842" },
  { k: "winning",   lbl: "🏆 勝利欲",     color: "#34d399" },
  { k: "playing",   lbl: "⚾ 出場欲",     color: "#60a5fa" },
  { k: "hometown",  lbl: "🏠 地元愛",     color: "#f97316" },
  { k: "loyalty",   lbl: "🤝 忠誠心",     color: "#a78bfa" },
  { k: "stability", lbl: "📈 安定志向",   color: "#06b6d4" },
  { k: "future",    lbl: "🌱 将来性重視", color: "#22d3ee" },
];

// ニュース・インタビュー用テンプレート
export const NEWS_TEMPLATES_WIN = [
  "{team}が{opp}に快勝！監督の采配が光る",
  "{team}、{score}で{opp}を撃破。エースが好投",
  "連勝街道！{team}が{opp}を下す",
  "{team}が逆転勝利！ベンチの底力を見せた",
];
export const NEWS_TEMPLATES_LOSE = [
  "{team}が{opp}に敗北。立て直しが急務か",
  "苦しい試合展開…{team}は{opp}に敗れる",
  "{team}、連敗のピンチ。{opp}の勢いに押される",
  "打線が沈黙…{team}は{opp}に完封負け",
];
export const INTERVIEW_QUESTIONS_WIN = [
  "今日の勝利について一言お願いします！",
  "連勝中ですが、チームの状態はいかがですか？",
  "ファンへのメッセージをどうぞ！",
];
export const INTERVIEW_QUESTIONS_LOSE = [
  "今日の敗戦を振り返ってどうですか？",
  "立て直しに向けて何か手を打ちますか？",
  "ファンへの言葉をお願いします。",
];
export const INTERVIEW_OPTIONS_WIN = [
  { text: "「選手全員の力です。これからも応援よろしく！」", popMod: 3, moraleMod: 5, label: "謙虚" },
  { text: "「完璧な試合でした。我々は最強です！」",       popMod: 1, moraleMod: 8, label: "強気" },
  { text: "「まだまだ改善点はある。油断せず戦います」",   popMod: 2, moraleMod: 3, label: "冷静" },
];
export const INTERVIEW_OPTIONS_LOSE = [
  { text: "「敗因は私の采配にあります。申し訳ない」", popMod: 4,  moraleMod: -2, label: "誠実" },
  { text: "「次は必ず勝ちます。信じてください！」",   popMod: 2,  moraleMod: 4,  label: "前向き" },
  { text: "「選手は頑張った。運がなかっただけです」", popMod: -2, moraleMod: 2,  label: "強がり" },
];

// ドラフト関連定数
export const DRAFT_ROUNDS = 6;
export const DRAFT_POOL_SIZE = 80;

export const PLAYER_TYPES_B = ["天才肌", "ガッツ型", "技巧派", "パワーヒッター", "俊足巧打", "守備の名手", "走塁のスペシャリスト", "勝負強い打者"];
export const PLAYER_TYPES_P = ["本格派", "技巧派", "速球派", "変化球のスペシャリスト", "制球の鬼", "エース候補", "抑えの切り札", "二刀流候補"];
export const PLAYER_COMMENTS_B = [
  "高校通算本塁打記録を持つ強打者", "守備範囲の広さは他の追随を許さない",
  "選球眼の良さでチームに貢献できる", "俊足を活かした内野安打が得意",
  "勝負どころでの強さが光る", "粘り強い打撃でチャンスメーカーとなれる",
  "パンチ力のある打撃で観客を沸かせる", "広角に打てるセンスを持つ",
];
export const PLAYER_COMMENTS_P = [
  "最速153km/hを誇る剛腕", "切れ味鋭いスライダーが武器",
  "抜群の制球力で打者を翻弄する", "多彩な変化球で打者を打ち取る",
  "ピンチでも動じない精神的な強さを持つ", "将来のエース候補として高い評価",
  "球持ちの良さで打者のタイミングを外す", "テンポの良い投球でリズムを作れる",
];
export const DRAFT_COMMENTS_MY = [
  "「この選手を指名します！」", "「将来のエースになってくれると信じています」",
  "「即戦力として期待しています」", "「長年追いかけてきた選手です」",
  "「チームに必要なピースです」",
];
export const DRAFT_COMMENTS_CPU = [
  "が電撃指名！", "が獲得に成功！", "が交渉権を獲得！",
  "がこの選手を選択！", "が抑えた！",
];

// 結果ラベル
export const RLABEL = {
  hr: "⚾ ホームラン！！", t: "⚡ 三塁打！", d: "💥 二塁打",
  s: "✅ ヒット", bb: "🎯 四球", hbp: "💢 死球",
  k: "🌀 三振", go: "🌿 ゴロアウト", fo: "🌬️ フライアウト", out: "🌿 アウト",
  sac: "🟡 バント成功", sb: "💨 盗塁成功！", cs: "🛑 盗塁死",
};

export const IS_HIT = (r) => ["hr", "t", "d", "s"].includes(r);
export const IS_OUT = (r) => ["k", "go", "fo", "sac", "out"].includes(r);

// 育成目標 (development goals) — devGoal フィールドの選択肢
export const DEV_GOALS_BATTER = [
  { key: "", label: "設定なし" },
  { key: "top_team", label: "一軍レギュラー狙い" },
  { key: "batting", label: "打撃特化" },
  { key: "defense", label: "守備強化" },
  { key: "speed", label: "走力強化" },
  { key: "promotion", label: "支配下昇格目標" },
];

export const DEV_GOALS_PITCHER = [
  { key: "", label: "設定なし" },
  { key: "rotation", label: "先発ローテ入り" },
  { key: "velocity", label: "球速強化" },
  { key: "control", label: "制球強化" },
  { key: "breaking", label: "変化球強化" },
  { key: "stamina", label: "スタミナ強化" },
  { key: "promotion", label: "支配下昇格目標" },
];


