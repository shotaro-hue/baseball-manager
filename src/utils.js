/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */

// 乱数
export const rng  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const rngf = (a, b) => Math.random() * (b - a) + a;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 丸め
export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;

// ユニークID
export const uid = () => Math.random().toString(36).slice(2, 9);

// フォーマッタ
export const fmtAvg = (h, ab) =>
  ab === 0 ? ".---" : "." + String(Math.round((h / ab) * 1000)).padStart(3, "0");

export const fmtOBP = (n, d) =>
  d === 0 ? ".---" : "." + String(Math.round((n / d) * 1000)).padStart(3, "0");

export const fmtPct = (v) => (v * 100).toFixed(1) + "%";

export const fmtM = (v) =>
  v >= 100000000
    ? (v / 100000000).toFixed(1) + "億円"
    : v >= 10000
      ? (v / 10000).toFixed(0) + "万円"
      : v + "円";

export const fmtSal = (v) => v >= 10000 ? (v / 10000).toFixed(2) + "億円" : v.toLocaleString() + "万円";

export const fmtEra = (era) => {
  const safeEra = Number(era);
  if (!Number.isFinite(safeEra) || safeEra <= 0) return "---";
  return safeEra.toFixed(2);
};

// 投球回表記: 6.333...→"6.1"、6.666...→"6.2"、7.0→"7.0"
export const fmtIP = (v) => {
  const full  = Math.floor(v);
  const frac  = v - full;
  const third = frac < 0.17 ? 0 : frac < 0.5 ? 1 : frac < 0.84 ? 2 : 3;
  return third === 3 ? `${full + 1}.0` : `${full}.${third}`;
};

// 名前生成
const LAST_NAMES = [
  "田中","佐藤","鈴木","山田","中村","小林","加藤","吉田","山口","松本",
  "井上","木村","林","斎藤","清水","山崎","阿部","森","石川","中島",
  "伊藤","渡辺","高橋","坂本","菊池","前田","柳田","山本","青木","岡本",
  "内川","丸","西川","浅村","源田","中田","近藤","牧","村上","大山",
  "宮崎","千賀","岸","佐野","糸井","菅野","上沢","伊藤大",
  "川端","小園","辰己","森下","今永","高梨","桑原","藤井","古田","稲葉",
  "秋山","福留","長谷川","平野","遠藤","藤本","松井","山川","金子","関口",
  "河村","黒田","白石","武田","野村","森本","早川","宮本","安田","長尾",
];
const FIRST_NAMES = [
  "翔","大輝","拓海","健太","勇人","蓮","颯太","陽斗","大和","優斗",
  "航","悠","凌","蒼","瞬","奏太","翼","湊","律","晴",
  "剛","巧","力","豪","賢","智","猛","諒","奨","将",
  "哲","武","亮","純","康","雄","和","信","正","仁",
  "光","明","司","貴","誠","宏","隆","進","敦","充",
  "颯","海斗","蒼空","新","志温","結翔","陽向","一樹","陸斗","悠真",
  "結人","蒼士","京介","雄大","優真","颯真","岳","健吾","浩介","慶太",
  "一真","隼人","修平","拓真","昌平","悠生","岳人","玲央","直樹","雅人",
];

export const CITIES = ["東京","大阪","横浜","名古屋","福岡","仙台","広島","札幌","千葉","所沢","神戸","京都"];

export const pname = () =>
  `${LAST_NAMES[rng(0, LAST_NAMES.length - 1)]}　${FIRST_NAMES[rng(0, FIRST_NAMES.length - 1)]}`;

// NPBカレンダー: gameDay 1〜143 を月日にマッピング
// scheduleが渡された場合はschedule[gameDay].dateを返す（実際の日程に準拠）
// scheduleがない場合は旧来の計算式にフォールバック（後方互換）
export function gameDayToDate(gameDay, schedule) {
  if (schedule && schedule[gameDay]) {
    return schedule[gameDay].date;
  }
  // フォールバック: 開幕3/28(金)、週6試合、AllStar後+3日
  const week = Math.floor((gameDay - 1) / 6);
  const dayInWeek = (gameDay - 1) % 6; // 0=金, 1=土, 2=日, 3=火, 4=水, 5=木（開幕金曜基準）
  let calDays = week * 7 + dayInWeek;
  if (gameDay > 72) calDays += 3;
  const dpm = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let m = 3, d = 28 + calDays; // 3月28日起算（2025年実績）
  while (d > dpm[m]) { d -= dpm[m]; m++; if (m > 12) m = 1; }
  return { month: m, day: d };
}

// スカウト評価ノイズ: 選手ID+能力キーから決定的なブレを生成（同一選手は毎回同じ表示値）
export const scoutNoise = (val, playerId, key, noiseRange = 12) => {
  let h = 0;
  const s = (playerId || '') + (key || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  const noise = (h % (noiseRange * 2 + 1)) - noiseRange;
  return Math.min(99, Math.max(1, (val || 50) + noise));
};

// スカウト精度付き能力表示値: noiseLevel=0は実値, >0は推定値(±noiseRange)
// budgetFactor: 0.7(高予算)〜1.0(低予算), regionFactor: 0.8(国内)〜1.2(海外)
export const scoutedValue = (trueVal, playerId, key, noiseLevel = 0, budgetFactor = 1.0, regionFactor = 1.0) => {
  if (noiseLevel === 0) return { value: trueVal, estimated: false };
  const effectiveRange = Math.round(noiseLevel * budgetFactor * regionFactor);
  return { value: scoutNoise(trueVal, playerId, key, effectiveRange), estimated: true };
};
