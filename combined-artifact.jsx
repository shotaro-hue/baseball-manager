import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";


const SAVE_KEY = 'baseball_manager_save';
const SAVE_VERSION = '4.0';

function buildSaveData(state) {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    data: {
      teams:         state.teams,
      myId:          state.myId,
      gameDay:       state.gameDay,
      year:          state.year,
      faPool:        state.faPool,
      news:          state.news.slice(0, 50),
      mailbox:       state.mailbox,
      cpuTradeOffers: state.cpuTradeOffers,
      screen:        'hub',
    }
  };
}

function loadSaveData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== SAVE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function deleteSaveData() {
  localStorage.removeItem(SAVE_KEY);
}

const G=`
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+JP:wght@300;400;500;700&family=Share+Tech+Mono&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#04101c;--card:#0b1c30;--border:rgba(255,255,255,.07);--gold:#f5c842;--green:#34d399;--red:#f87171;--blue:#60a5fa;--purple:#a78bfa;--text:#c0cfe0;--dim:#2e4055;}
body{background:var(--bg);}
.app{min-height:100vh;background:linear-gradient(160deg,#04101c,#071422 60%,#040d18);color:var(--text);font-family:'Noto Sans JP',sans-serif;font-size:13px;}
.title{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;position:relative;overflow:hidden;}
.title::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 100% 40% at 50% 110%,rgba(10,50,25,.5),transparent);}
.tlogo{font-family:'Bebas Neue',cursive;font-size:clamp(42px,10vw,88px);line-height:1;color:var(--gold);text-shadow:0 0 80px rgba(245,200,66,.4),0 3px 0 #000;z-index:1;position:relative;letter-spacing:.05em;text-align:center;}
.tsub{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--dim);letter-spacing:.5em;text-align:center;margin:4px 0 26px;z-index:1;position:relative;}
.tgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;max-width:780px;width:100%;z-index:1;position:relative;}
@media(max-width:600px){.tgrid{grid-template-columns:repeat(3,1fr);}}
.tcard{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:13px 7px;text-align:center;cursor:pointer;transition:.2s;position:relative;overflow:hidden;}
.tcard::before{content:'';position:absolute;inset:0;background:var(--c);opacity:0;transition:.2s;}
.tcard:hover{border-color:var(--c);transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.5);}
.tcard:hover::before{opacity:.1;}
.tcard-nm{font-size:9px;font-weight:700;color:var(--c);}
.hub{max-width:980px;margin:0 auto;padding:10px 12px;}
.topbar{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:10px;flex-wrap:wrap;}
.tb-record{font-family:'Share Tech Mono',monospace;font-size:22px;color:var(--gold);}
.chip{padding:3px 9px;border-radius:4px;font-size:10px;font-family:'Share Tech Mono',monospace;}
.cg{background:rgba(52,211,153,.1);color:var(--green);border:1px solid rgba(52,211,153,.2);}
.cr{background:rgba(248,113,113,.1);color:var(--red);border:1px solid rgba(248,113,113,.2);}
.cy{background:rgba(245,200,66,.1);color:var(--gold);border:1px solid rgba(245,200,66,.2);}
.cb{background:rgba(96,165,250,.1);color:var(--blue);border:1px solid rgba(96,165,250,.2);}
.cp{background:rgba(167,139,250,.1);color:var(--purple);border:1px solid rgba(167,139,250,.2);}
.tabs{display:flex;gap:3px;background:rgba(0,0,0,.3);padding:3px;border-radius:8px;margin-bottom:10px;overflow-x:auto;}
.tab{flex:1;padding:7px 4px;border:none;background:transparent;color:var(--dim);border-radius:6px;cursor:pointer;font-size:10px;font-family:'Noto Sans JP',sans-serif;transition:.15s;white-space:nowrap;min-width:52px;}
.tab.on{background:rgba(245,200,66,.12);color:var(--gold);}
.tab:hover:not(.on){color:#6b7280;background:rgba(255,255,255,.03);}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;}
.card-h{font-size:10px;color:var(--dim);letter-spacing:.25em;margin-bottom:12px;font-weight:400;}
.card2{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:8px;padding:11px;margin-bottom:8px;}
.btn{padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-family:'Noto Sans JP',sans-serif;font-size:12px;transition:.15s;}
.btn-gold{background:linear-gradient(135deg,#5c2a08,#7a3810);border:1px solid var(--gold);color:var(--gold);}
.btn-gold:hover{opacity:.8;transform:translateY(-1px);}
.btn-green{background:linear-gradient(135deg,#0d2e1a,#1a4a28);border:1px solid var(--green);color:var(--green);}
.bsm{padding:3px 9px;font-size:11px;border-radius:4px;border:none;cursor:pointer;font-family:'Noto Sans JP',sans-serif;transition:.15s;}
.bsm:hover{opacity:.7;}
.bga{background:rgba(52,211,153,.12);color:var(--green);}
.bgr{background:rgba(248,113,113,.12);color:var(--red);}
.bgb{background:rgba(96,165,250,.12);color:var(--blue);}
.bgy{background:rgba(245,200,66,.12);color:var(--gold);}
.bgp{background:rgba(167,139,250,.12);color:var(--purple);}
.sim-btn{width:100%;padding:13px;background:linear-gradient(135deg,#0d2e1a,#1a4a28);border:1px solid var(--green);border-radius:10px;color:var(--green);font-size:15px;font-family:'Bebas Neue',cursive;letter-spacing:.25em;cursor:pointer;transition:.2s;margin-bottom:10px;}
.sim-btn:hover{transform:translateY(-1px);opacity:.85;}
.sim-btn:disabled{opacity:.3;cursor:not-allowed;transform:none;}
.notif{padding:9px 14px;border-radius:8px;font-size:12px;margin-bottom:8px;animation:fi .3s;}
.nok{background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.25);color:var(--green);}
.nwarn{background:rgba(245,200,66,.08);border:1px solid rgba(245,200,66,.25);color:var(--gold);}
.nbad{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);color:var(--red);}
.tbl{width:100%;border-collapse:collapse;}
.tbl th{text-align:left;padding:6px 8px;font-size:9px;color:var(--dim);letter-spacing:.1em;border-bottom:1px solid rgba(255,255,255,.05);font-weight:400;white-space:nowrap;}
.tbl td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.025);white-space:nowrap;}
.tbl tr:hover td{background:rgba(255,255,255,.013);}
.mono{font-family:'Share Tech Mono',monospace;font-size:12px;}
.lnb{width:17px;height:17px;background:rgba(245,200,66,.15);color:var(--gold);border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-family:'Share Tech Mono',monospace;}
/* TACTICAL GAME SCREEN */
.gscreen{max-width:1100px;margin:0 auto;padding:10px 12px;display:grid;grid-template-columns:1fr 340px;gap:12px;}
@media(max-width:720px){.gscreen{grid-template-columns:1fr;}}
.scoreboard{background:#030d07;border:2px solid #0c2014;border-radius:12px;padding:12px;overflow-x:auto;margin-bottom:10px;}
.sct{width:100%;border-collapse:collapse;font-family:'Share Tech Mono',monospace;white-space:nowrap;font-size:11px;}
.sct td{text-align:center;padding:5px 7px;border:1px solid rgba(255,255,255,.04);min-width:24px;}
.sct .stc{text-align:left;min-width:88px;font-weight:700;}
.sct .stot{font-size:18px;font-weight:bold;border-left:2px solid rgba(255,255,255,.08)!important;}
.diamond{position:relative;width:80px;height:80px;}
.base{position:absolute;width:14px;height:14px;border:2px solid rgba(255,255,255,.1);transform:rotate(45deg);transition:.3s;}
.base.on{background:var(--gold);border-color:var(--gold);box-shadow:0 0 8px rgba(245,200,66,.5);}
.bH{bottom:2px;left:50%;transform:translateX(-50%) rotate(45deg);background:rgba(255,255,255,.12);}
.b1{right:2px;top:50%;transform:translateY(-50%) rotate(45deg);}
.b2{top:2px;left:50%;transform:translateX(-50%) rotate(45deg);}
.b3{left:2px;top:50%;transform:translateY(-50%) rotate(45deg);}
.odots{display:flex;gap:5px;justify-content:center;margin-top:4px;}
.odot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);transition:.3s;}
.odot.on{background:var(--red);border-color:var(--red);}
/* MOMENTUM BAR */
.mom-wrap{margin:10px 0;}
.mom-bar{height:10px;background:rgba(255,255,255,.05);border-radius:5px;overflow:hidden;position:relative;}
.mom-fill{height:100%;background:linear-gradient(90deg,#f87171,#fbbf24,#34d399);transition:width .5s;}
.mom-marker{position:absolute;top:-2px;bottom:-2px;width:3px;background:#fff;border-radius:2px;transition:left .5s;}
/* FATIGUE GAUGE */
.fat-bar{height:8px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,.06);}
.fat-fill{height:100%;border-radius:4px;transition:width .5s,background .3s;}
/* STOP BANNER */
.stop-banner{border-radius:10px;padding:12px 14px;margin-bottom:10px;animation:pulse2 1s ease-in-out 3;}
.stop-banner.warning{background:rgba(245,200,66,.1);border:1px solid rgba(245,200,66,.4);color:var(--gold);}
.stop-banner.danger{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.4);color:var(--red);}
.stop-banner.chance{background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.4);color:var(--green);}
/* MATCHUP */
.matchup-badge{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;font-family:'Share Tech Mono',monospace;}
.mu-adv{background:rgba(52,211,153,.15);color:var(--green);border:1px solid rgba(52,211,153,.3);}
.mu-even{background:rgba(245,200,66,.1);color:var(--gold);border:1px solid rgba(245,200,66,.2);}
.mu-dis{background:rgba(248,113,113,.12);color:var(--red);border:1px solid rgba(248,113,113,.2);}
/* EVENT LOG */
.evlog{background:rgba(0,0,0,.45);border-radius:8px;padding:8px;height:280px;overflow-y:auto;}
.evlog::-webkit-scrollbar{width:3px;}
.evlog::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);}
.evi{padding:3px 7px;border-radius:3px;margin-bottom:2px;font-size:11px;animation:fi .2s;}
.evi-hit{background:rgba(52,211,153,.06);}
.evi-hr{background:rgba(245,200,66,.1);color:var(--gold);font-weight:600;}
.evi-out{color:#1e2d3d;}
.evhdr{padding:3px 8px;font-size:9px;color:#1e2d3d;letter-spacing:.15em;border-left:3px solid #0a1e2c;margin:4px 0 2px;}
.evhdr.mine{border-color:#5c3a08;color:#7a4a10;}
/* STRATEGY MENU */
.strat-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.strat-btn{padding:8px 8px;border-radius:7px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);cursor:pointer;text-align:left;transition:.15s;font-family:'Noto Sans JP',sans-serif;}
.strat-btn:hover{border-color:rgba(245,200,66,.4);background:rgba(245,200,66,.05);}
.strat-btn.sel{border-color:var(--gold);background:rgba(245,200,66,.08);}
/* BENCH LIST */
.bench-item{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.025);}
/* RESULT */
.rw{max-width:520px;margin:0 auto;padding:40px 20px;text-align:center;}
.rtitle{font-family:'Bebas Neue',cursive;font-size:78px;line-height:1;margin:10px 0;}
.rwin{color:var(--gold);text-shadow:0 0 60px rgba(245,200,66,.5);}
.rlose{color:#1e2d3d;}
.rscore{font-family:'Share Tech Mono',monospace;font-size:46px;margin:4px 0 22px;}
/* MISC */
.divider{border:none;border-top:1px solid rgba(255,255,255,.05);margin:10px 0;}
.flex{display:flex;align-items:center;gap:8px;}
.fsb{display:flex;align-items:center;justify-content:space-between;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
@media(max-width:520px){.g2{grid-template-columns:1fr;}}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
@media(max-width:520px){.g3{grid-template-columns:1fr 1fr;}}
.pval-bar{display:flex;align-items:center;gap:7px;margin:3px 0;}
.pval-lbl{font-size:10px;color:#4b5563;width:90px;}
.pval-track{flex:1;height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;}
.pval-fill{height:100%;border-radius:3px;}
.pval-num{font-family:'Share Tech Mono',monospace;font-size:11px;width:28px;text-align:right;}
.score-ring{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Share Tech Mono',monospace;font-size:18px;font-weight:bold;border:3px solid;}
.inj-badge{padding:2px 7px;border-radius:3px;font-size:9px;background:rgba(248,113,113,.12);color:var(--red);border:1px solid rgba(248,113,113,.2);}
/* STICKY CONTROL BAR */
.ctrl-bar{position:sticky;bottom:0;left:0;right:0;background:rgba(4,16,28,.96);border-top:1px solid rgba(255,255,255,.08);padding:10px 12px;display:flex;gap:7px;flex-wrap:wrap;z-index:100;backdrop-filter:blur(8px);}
.ctrl-bar .btn{flex:1;min-width:80px;padding:12px 8px;font-size:13px;}
/* MODE SELECT */
.mode-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;background:linear-gradient(160deg,#04101c,#071422);}
.mode-card{background:var(--card);border:2px solid var(--border);border-radius:16px;padding:26px 20px;width:100%;max-width:360px;cursor:pointer;transition:.22s;text-align:center;margin-bottom:14px;}
.mode-card:hover{transform:translateY(-4px);box-shadow:0 20px 44px rgba(0,0,0,.6);}
.mode-card.tactical{border-color:rgba(245,200,66,.25);}
.mode-card.tactical:hover{border-color:var(--gold);background:rgba(245,200,66,.04);}
.mode-card.auto{border-color:rgba(52,211,153,.2);}
.mode-card.auto:hover{border-color:var(--green);background:rgba(52,211,153,.04);}
@keyframes fi{from{opacity:0;transform:translateX(-5px);}to{opacity:1;transform:none;}}
@keyframes pulse2{0%,100%{opacity:1;}50%{opacity:.6;}}
`;


/* ═══ utils.js ═══ */

/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */

// 乱数
const rng = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const rngf = (a, b) => Math.random() * (b - a) + a;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 丸め
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// ユニークID
const uid = () => Math.random().toString(36).slice(2, 9);

// フォーマッタ
const fmtAvg = (h, ab) =>
  ab === 0 ? ".---" : "." + String(Math.round((h / ab) * 1000)).padStart(3, "0");

const fmtOBP = (n, d) =>
  d === 0 ? ".---" : "." + String(Math.round((n / d) * 1000)).padStart(3, "0");

const fmtPct = (v) => (v * 100).toFixed(1) + "%";

const fmtM = (v) =>
  v >= 100000000
    ? (v / 100000000).toFixed(1) + "億"
    : v >= 10000
      ? (v / 10000).toFixed(0) + "万"
      : v + "円";

const fmtSal = (v) => (v / 10000).toFixed(0) + "万";

// 投球回表記: 6.333...→"6.1"、6.666...→"6.2"、7.0→"7.0"
const fmtIP = (v) => {
  const full = Math.floor(v);
  const frac = v - full;
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
];
const FIRST_NAMES = [
  "翔","大輝","拓海","健太","勇人","蓮","颯太","陽斗","大和","優斗",
  "航","悠","凌","蒼","瞬","奏太","翼","湊","律","晴",
  "剛","巧","力","豪","賢","智","猛","諒","奨","将",
  "哲","武","亮","純","康","雄","和","信","正","仁",
  "光","明","司","貴","誠","宏","隆","進","敦","充",
];
const CITIES = ["東京","大阪","横浜","名古屋","福岡","仙台","広島","札幌","千葉","所沢","神戸","京都"];

const pname = () =>
  `${LAST_NAMES[rng(0, LAST_NAMES.length - 1)]} ${FIRST_NAMES[rng(0, FIRST_NAMES.length - 1)]}`;


/* ═══ constants.js ═══ */

/* ═══════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */

const SEASON_GAMES = 143;
const BATCH = 5;
const MAX_ROSTER = 28;
const MAX_FARM = 30;
const MAX_外国人_一軍 = 3;
const MAX_外国人_保有 = 5;
const ACCEPT_THRESHOLD = 55;
const PITCH_WARNING = 100;
const PITCH_LIMIT = 120;

const TEAM_DEFS = [
  { id: 0,  name: "東京スワローズ",     short: "東京S",  league: "セ", emoji: "🦢", color: "#22d3ee", city: "東京",   budget: 500000 },
  { id: 1,  name: "横浜ベイスターズ",   short: "横浜",   league: "セ", emoji: "⭐", color: "#3b82f6", city: "横浜",   budget: 480000 },
  { id: 2,  name: "広島カープ",         short: "広島",   league: "セ", emoji: "🎏", color: "#ef4444", city: "広島",   budget: 350000 },
  { id: 3,  name: "阪神タイガース",     short: "阪神",   league: "セ", emoji: "🐯", color: "#fbbf24", city: "大阪",   budget: 600000 },
  { id: 4,  name: "読売ジャイアンツ",   short: "巨人",   league: "セ", emoji: "🟠", color: "#f97316", city: "東京",   budget: 650000 },
  { id: 5,  name: "中日ドラゴンズ",     short: "中日",   league: "セ", emoji: "🐲", color: "#06b6d4", city: "名古屋", budget: 420000 },
  { id: 6,  name: "福岡ホークス",       short: "福岡",   league: "パ", emoji: "🦅", color: "#f5c842", city: "福岡",   budget: 580000 },
  { id: 7,  name: "東北イーグルス",     short: "東北",   league: "パ", emoji: "🦆", color: "#dc2626", city: "仙台",   budget: 360000 },
  { id: 8,  name: "埼玉ライオンズ",     short: "埼玉",   league: "パ", emoji: "🦁", color: "#a78bfa", city: "所沢",   budget: 400000 },
  { id: 9,  name: "千葉マリーンズ",     short: "千葉",   league: "パ", emoji: "⚓", color: "#0ea5e9", city: "千葉",   budget: 370000 },
  { id: 10, name: "北海道ファイターズ", short: "北海道", league: "パ", emoji: "⚔️", color: "#818cf8", city: "札幌",   budget: 450000 },
  { id: 11, name: "大阪バファローズ",   short: "大阪",   league: "パ", emoji: "🦬", color: "#10b981", city: "大阪",   budget: 460000 },
];

const POSITIONS = ["捕手", "一塁手", "二塁手", "三塁手", "遊撃手", "左翼手", "中堅手", "右翼手"];

const COACH_DEFS = [
  { type: "batting",  name: "打撃コーチ",     emoji: "🏏" },
  { type: "pitching", name: "投手コーチ",     emoji: "⚾" },
  { type: "defense",  name: "守備コーチ",     emoji: "🧤" },
  { type: "running",  name: "走塁コーチ",     emoji: "🏃" },
  { type: "mental",   name: "メンタルコーチ", emoji: "🧠" },
];

const COACH_GRADES = [
  { g: 1, label: "平凡",     salary: 3000,  bonus: 1 },
  { g: 2, label: "経験豊富", salary: 7000,  bonus: 2 },
  { g: 3, label: "一流",     salary: 15000, bonus: 3 },
  { g: 4, label: "レジェンド", salary: 30000, bonus: 5 },
];

const SCOUT_REGIONS = [
  { id: "dom_a", name: "国内一軍候補",   weeks: 4,  qMin: 65, qMax: 82, cost: 5000,  foreign: false },
  { id: "dom_b", name: "国内独立リーグ", weeks: 6,  qMin: 50, qMax: 72, cost: 3000,  foreign: false },
  { id: "us",    name: "北米メジャー",   weeks: 8,  qMin: 70, qMax: 90, cost: 12000, foreign: true },
  { id: "kr",    name: "韓国KBO",        weeks: 6,  qMin: 60, qMax: 78, cost: 8000,  foreign: true },
  { id: "latin", name: "中南米",          weeks: 10, qMin: 55, qMax: 85, cost: 9000,  foreign: true },
];

const INJURY_TABLE = [
  { name: "打撲",     days: 3 },
  { name: "肉離れ",   days: 14 },
  { name: "捻挫",     days: 7 },
  { name: "疲労骨折", days: 30, severe: true },
  { name: "靭帯損傷", days: 60, severe: true },
  { name: "肩炎症",   days: 21 },
];

const STRATEGY_OPTS = [
  { id: "normal",  label: "通常",      desc: "通常の打席",        icon: "⚾" },
  { id: "bunt",    label: "バント",    desc: "ランナー進塁を優先", icon: "🟡" },
  { id: "hitrun",  label: "エンドラン", desc: "走者がスタート",    icon: "🏃" },
  { id: "walk",    label: "敬遠",      desc: "申告敬遠",          icon: "🚶" },
  { id: "steal",   label: "盗塁",      desc: "走者が走る",        icon: "⚡" },
];

const PVAL_DEFS = [
  { k: "money",     lbl: "💰 金銭欲",     color: "#f5c842" },
  { k: "winning",   lbl: "🏆 勝利欲",     color: "#34d399" },
  { k: "playing",   lbl: "⚾ 出場欲",     color: "#60a5fa" },
  { k: "hometown",  lbl: "🏠 地元愛",     color: "#f97316" },
  { k: "loyalty",   lbl: "🤝 忠誠心",     color: "#a78bfa" },
  { k: "stability", lbl: "📈 安定志向",   color: "#06b6d4" },
  { k: "future",    lbl: "🌱 将来性重視", color: "#22d3ee" },
];

// ニュース・インタビュー用テンプレート
const NEWS_TEMPLATES_WIN = [
  "{team}が{opp}に快勝！監督の采配が光る",
  "{team}、{score}で{opp}を撃破。エースが好投",
  "連勝街道！{team}が{opp}を下す",
  "{team}が逆転勝利！ベンチの底力を見せた",
];
const NEWS_TEMPLATES_LOSE = [
  "{team}が{opp}に敗北。立て直しが急務か",
  "苦しい試合展開…{team}は{opp}に敗れる",
  "{team}、連敗のピンチ。{opp}の勢いに押される",
  "打線が沈黙…{team}は{opp}に完封負け",
];
const INTERVIEW_QUESTIONS_WIN = [
  "今日の勝利について一言お願いします！",
  "連勝中ですが、チームの状態はいかがですか？",
  "ファンへのメッセージをどうぞ！",
];
const INTERVIEW_QUESTIONS_LOSE = [
  "今日の敗戦を振り返ってどうですか？",
  "立て直しに向けて何か手を打ちますか？",
  "ファンへの言葉をお願いします。",
];
const INTERVIEW_OPTIONS_WIN = [
  { text: "「選手全員の力です。これからも応援よろしく！」", popMod: 3, moraleMod: 5, label: "謙虚" },
  { text: "「完璧な試合でした。我々は最強です！」",       popMod: 1, moraleMod: 8, label: "強気" },
  { text: "「まだまだ改善点はある。油断せず戦います」",   popMod: 2, moraleMod: 3, label: "冷静" },
];
const INTERVIEW_OPTIONS_LOSE = [
  { text: "「敗因は私の采配にあります。申し訳ない」", popMod: 4,  moraleMod: -2, label: "誠実" },
  { text: "「次は必ず勝ちます。信じてください！」",   popMod: 2,  moraleMod: 4,  label: "前向き" },
  { text: "「選手は頑張った。運がなかっただけです」", popMod: -2, moraleMod: 2,  label: "強がり" },
];

// ドラフト関連定数
const DRAFT_ROUNDS = 6;
const DRAFT_POOL_SIZE = 80;

const PLAYER_TYPES_B = ["天才肌", "ガッツ型", "技巧派", "パワーヒッター", "俊足巧打", "守備の名手", "走塁のスペシャリスト", "勝負強い打者"];
const PLAYER_TYPES_P = ["本格派", "技巧派", "速球派", "変化球のスペシャリスト", "制球の鬼", "エース候補", "抑えの切り札", "二刀流候補"];
const PLAYER_COMMENTS_B = [
  "高校通算本塁打記録を持つ強打者", "守備範囲の広さは他の追随を許さない",
  "選球眼の良さでチームに貢献できる", "俊足を活かした内野安打が得意",
  "勝負どころでの強さが光る", "粘り強い打撃でチャンスメーカーとなれる",
  "パンチ力のある打撃で観客を沸かせる", "広角に打てるセンスを持つ",
];
const PLAYER_COMMENTS_P = [
  "最速153km/hを誇る剛腕", "切れ味鋭いスライダーが武器",
  "抜群の制球力で打者を翻弄する", "多彩な変化球で打者を打ち取る",
  "ピンチでも動じない精神的な強さを持つ", "将来のエース候補として高い評価",
  "球持ちの良さで打者のタイミングを外す", "テンポの良い投球でリズムを作れる",
];
const DRAFT_COMMENTS_MY = [
  "「この選手を指名します！」", "「将来のエースになってくれると信じています」",
  "「即戦力として期待しています」", "「長年追いかけてきた選手です」",
  "「チームに必要なピースです」",
];
const DRAFT_COMMENTS_CPU = [
  "が電撃指名！", "が獲得に成功！", "が交渉権を獲得！",
  "がこの選手を選択！", "が抑えた！",
];

// 結果ラベル
const RLABEL = {
  hr: "⚾ ホームラン！！", "3b": "⚡ 三塁打！", "2b": "💥 二塁打",
  "1b": "✅ ヒット", bb: "🎯 四球", hbp: "💢 死球",
  k: "🌀 三振", go: "🌿 ゴロアウト", fo: "🌬️ フライアウト",
  sac: "🟡 バント成功", sb: "💨 盗塁成功！", cs: "🛑 盗塁死",
};

const IS_HIT = (r) => ["hr", "3b", "2b", "1b"].includes(r);
const IS_OUT = (r) => ["k", "go", "fo", "sac"].includes(r);


/* ═══ engine/player.js ═══ */

/* ═══════════════════════════════════════════════
   PLAYER GENERATION & RETIRE SYSTEM
═══════════════════════════════════════════════ */

// 空の成績オブジェクト
const emptyStats = () => ({
  PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, BB: 0, K: 0, HBP: 0,
  SB: 0, CS: 0, R: 0, SF: 0, evSum: 0, evN: 0, laSum: 0, laN: 0,
  IP: 0, ER: 0, BBp: 0, HBPp: 0, Kp: 0, HRp: 0, Hp: 0, BF: 0, W: 0, L: 0, SV: 0,
});

// 性格生成
const makePers = (age) => ({
  money: rng(20, 90), winning: rng(20, 90), playing: rng(30, 95),
  hometown: rng(0, 80), loyalty: rng(10, 85),
  stability: rng(age > 28 ? 50 : 20, age > 28 ? 90 : 70),
  future: rng(age < 27 ? 50 : 10, age < 27 ? 90 : 60),
});

// 選手生成
function makePlayer(pos, q, isPitch, ageOverride, isForeign = false) {
  const s = (b = 0) => clamp(rng(q - 18 + b, q + 15 + b), 25, 99);
  const age = ageOverride ?? rng(18, 36);
  const p = {
    id: uid(), name: pname(), pos, age, potential: rng(55, 99),
    isPitcher: isPitch, isForeign, salary: 0,
    contractYears: rng(1, 3), contractYearsLeft: rng(1, 3),
    育成: false, isFA: false, condition: rng(80, 100),
    injury: null, morale: rng(60, 100), trust: 50,
    hometown: CITIES[rng(0, CITIES.length - 1)],
    personality: makePers(age), skills: [],
    growthPhase: age <= 24 ? "growth" : age <= 30 ? "peak" : "decline",
    stats: emptyStats(),
  };

  if (isPitch) {
    p.hand = Math.random() < 0.30 ? "left" : "right";
    p.pitching = {
      velocity: s(5), control: s(), stamina: s(-3), breaking: s(),
      variety: s(-5), sharpness: s(-2), tempo: s(-8), clutchP: s(-5),
      recovery: s(-5), durability: s(-3),
    };
    p.subtype = pos === "抑え" ? "抑え" : pos === "中継ぎ" ? "中継ぎ" : "先発";
    const ov = (p.pitching.velocity + p.pitching.control * 1.2 + p.pitching.stamina + p.pitching.breaking + p.pitching.clutchP * 0.3) / 4.5;
    p.salary = clamp(Math.round((ov * 60 - 2800) / 500) * 500, 500, 50000) * 100;
  } else {
    p.batting = {
      contact: s(), power: s(), eye: s(-5), speed: s(), arm: s(-5),
      defense: s(-5), catching: s(-3), stealSkill: s(-8), baseRunning: s(-5),
      clutch: s(-8), vsLeft: s(-5), breakingBall: s(-8), stamina: s(-3), recovery: s(-5),
    };
    const ov = (p.batting.contact * 1.2 + p.batting.power + p.batting.eye + p.batting.speed * 0.7 + p.batting.clutch * 0.3) / 4.2;
    p.salary = clamp(Math.round((ov * 55 - 2500) / 500) * 500, 400, 60000) * 100;
  }

  const types = isPitch ? PLAYER_TYPES_P : PLAYER_TYPES_B;
  const comments = isPitch ? PLAYER_COMMENTS_P : PLAYER_COMMENTS_B;
  p.playerType = types[rng(0, types.length - 1)];
  p.playerComment = comments[rng(0, comments.length - 1)];
  return p;
}

// チーム構築
function buildTeam(def) {
  const q = rng(56, 76);
  const players = [];
  POSITIONS.forEach((pos) => players.push(makePlayer(pos, q + (pos === "捕手" ? 3 : 0), false)));
  for (let i = 0; i < 6; i++) players.push(makePlayer(POSITIONS[rng(0, 7)], q - 14, false));
  for (let i = 0; i < 5; i++) players.push(makePlayer("先発", q + 5 - i * 3, true, rng(21, 33)));
  for (let i = 0; i < 4; i++) players.push(makePlayer("中継ぎ", q - 4, true, rng(23, 31)));
  players.push(makePlayer("抑え", q + 4, true, rng(24, 32)));

  const farm = [];
  for (let i = 0; i < 15; i++) farm.push(makePlayer(POSITIONS[rng(0, 7)], q - 20, false, rng(18, 25)));
  for (let i = 0; i < 8; i++) farm.push(makePlayer("先発", q - 15, true, rng(18, 24)));

  return {
    ...def, players, farm, 育成Players: [],
    lineup: players.filter((p) => !p.isPitcher).slice(0, 9).map((p) => p.id),
    rotation: players.filter((p) => p.isPitcher && p.subtype === "先発").map((p) => p.id),
    rotIdx: 0, wins: 0, losses: 0, draws: 0, rf: 0, ra: 0,
    coaches: [], budget: def.budget,
    scoutMissions: [], scoutResults: [],
    popularity: rng(40, 70),
  };
}

/* ═══════════════════════════════════════════════
   RETIRE SYSTEM
═══════════════════════════════════════════════ */

// 引退意欲スコア計算（0〜100）
function calcRetireWill(p) {
  if (p.age < 35) return 0;
  let score = 0;

  // 年齢
  if (p.age >= 40) score += 50;
  else if (p.age >= 38) score += 30;
  else if (p.age >= 36) score += 15;
  else score += 5;

  // 出場機会
  const pa = p.stats?.PA || 0;
  const bf = p.stats?.BF || 0;
  if (p.isPitcher && bf < 40) score += 15;
  if (!p.isPitcher && pa < 80) score += 15;

  // モラル
  if ((p.morale || 60) < 40) score += 10;

  // 契約残年
  if ((p.contractYearsLeft || 0) === 0) score += 20;

  // 引退に関する価値観
  const rs = p.retireStyle || 50;
  if (rs >= 70) {
    score = Math.round(score * 1.4);
  } else if (rs <= 30) {
    score = Math.round(score * 0.6);
  }

  return Math.min(100, score);
}

// 引退発生判定
function rollRetire(p) {
  const will = calcRetireWill(p);
  return Math.random() * 100 < will;
}


/* ═══ engine/sabermetrics.js ═══ */

/* ═══════════════════════════════════════════════
   SABERMETRICS
═══════════════════════════════════════════════ */

const LG_WOBA = 0.315;
const WOBA_SCALE = 1.15;
const FIP_C = 3.20;

const WW = { BB: 0.69, HBP: 0.72, s1b: 0.88, d2b: 1.24, t3b: 1.56, HR: 2.01 };

function saberBatter(s) {
  const singles = Math.max(0, s.H - s.D - s.T - s.HR);
  const AVG = s.AB > 0 ? s.H / s.AB : 0;
  const OBP = (s.AB + s.BB + s.HBP + s.SF) > 0
    ? (s.H + s.BB + s.HBP) / (s.AB + s.BB + s.HBP + s.SF) : 0;
  const SLG = s.AB > 0 ? (singles + s.D * 2 + s.T * 3 + s.HR * 4) / s.AB : 0;
  const OPS = OBP + SLG;
  const ISO = SLG - AVG;
  const BBpct = s.PA > 0 ? s.BB / s.PA : 0;
  const Kpct = s.PA > 0 ? s.K / s.PA : 0;
  const BABIP_d = s.AB - s.K - s.HR + s.SF;
  const BABIP = BABIP_d > 0 ? (s.H - s.HR) / BABIP_d : 0;
  const wOBA_n = WW.BB * s.BB + WW.HBP * s.HBP + WW.s1b * singles + WW.d2b * s.D + WW.t3b * s.T + WW.HR * s.HR;
  const wOBA_d = s.AB - s.H + s.BB + s.HBP + s.SF + s.K;
  const wOBA = wOBA_d > 0 ? wOBA_n / wOBA_d : 0;
  const wRCp = Math.round(((wOBA - LG_WOBA) / WOBA_SCALE + 1) * 100);
  const WAR = r2(((wOBA - LG_WOBA) / WOBA_SCALE) * s.PA / 10);

  return {
    AVG: r3(AVG), OBP: r3(OBP), SLG: r3(SLG), OPS: r2(OPS), ISO: r2(ISO),
    BBpct: r3(BBpct), Kpct: r3(Kpct), BABIP: r3(BABIP),
    wOBA: r3(wOBA), wRCp, WAR,
    EVavg: s.evN > 0 ? r2(s.evSum / s.evN) : 0,
    LAavg: s.laN > 0 ? r2(s.laSum / s.laN) : 0,
  };
}

function saberPitcher(s) {
  const totalBB = s.BBp + s.HBPp;
  const ERA = s.IP > 0 ? r2(s.ER / s.IP * 9) : 0;
  const BBpct = s.BF > 0 ? s.BBp / s.BF : 0;
  const Kpct = s.BF > 0 ? s.Kp / s.BF : 0;
  const BABIP_d = s.BF - totalBB - s.Kp - s.HRp;
  const BABIP = BABIP_d > 0 ? (s.Hp - s.HRp) / BABIP_d : 0;
  const FIP = s.IP > 0 ? r2((13 * s.HRp + 3 * totalBB - 2 * s.Kp) / s.IP + FIP_C) : 0;
  const xFIP = s.IP > 0 ? r2((13 * (s.BF - totalBB - s.Kp) * 0.030 + 3 * totalBB - 2 * s.Kp) / s.IP + FIP_C) : 0;
  const WAR = s.IP > 0 ? r2((FIP_C - FIP) * s.IP / 9 * 0.3) : 0;
  const WHIP = s.IP > 0 ? r2((s.BBp + s.Hp) / s.IP) : 0;

  return { ERA, BBpct: r3(BBpct), Kpct: r3(Kpct), BABIP: r3(BABIP), FIP, xFIP, WAR, WHIP };
}


/* ═══ engine/contract.js ═══ */

/* ═══════════════════════════════════════════════
   CONTRACT EVALUATION
═══════════════════════════════════════════════ */

function evalOffer(player, offer, myTeam, allTeams) {
  const p = player.personality;
  const g = myTeam.wins + myTeam.losses;
  const winPct = g > 0 ? myTeam.wins / g : 0.5;
  const rank = [...allTeams]
    .filter((t) => t.league === myTeam.league)
    .sort((a, b) => b.wins - a.wins)
    .findIndex((t) => t.id === myTeam.id) + 1;

  const moneyScore = clamp((offer.salary / Math.max(player.salary, 100000)) * 60 + 20, 0, 100);
  const winScore = clamp(winPct * 100 * 1.2, 0, 100);
  const rankScore = clamp((7 - rank) / 6 * 100, 0, 100);
  const playScore = myTeam.lineup.includes(player.id) ? 85 : 40;
  const homeScore = myTeam.city === player.hometown ? 80 : 30;
  const trustScore = clamp(player.trust, 0, 100);
  const avgAge = myTeam.players.reduce((s, x) => s + x.age, 0) / Math.max(myTeam.players.length, 1);
  const futureScore = clamp((32 - avgAge) / 14 * 100, 0, 100);
  const stabilityScore = offer.years >= 3 ? 85 : offer.years === 2 ? 65 : 40;

  const total = (
    p.money * moneyScore +
    p.winning * Math.max(winScore, rankScore) +
    p.playing * playScore +
    p.hometown * homeScore +
    p.loyalty * trustScore +
    p.stability * stabilityScore +
    p.future * futureScore
  ) / (p.money + p.winning + p.playing + p.hometown + p.loyalty + p.stability + p.future);

  return {
    total: Math.round(total),
    breakdown: {
      money:     { score: Math.round(moneyScore), weight: p.money },
      winning:   { score: Math.round(Math.max(winScore, rankScore)), weight: p.winning },
      playing:   { score: Math.round(playScore), weight: p.playing },
      hometown:  { score: Math.round(homeScore), weight: p.hometown },
      loyalty:   { score: Math.round(trustScore), weight: p.loyalty },
      stability: { score: Math.round(stabilityScore), weight: p.stability },
      future:    { score: Math.round(futureScore), weight: p.future },
    },
  };
}


/* ═══ engine/trade.js ═══ */

/* ═══════════════════════════════════════════════
   TRADE SYSTEM
═══════════════════════════════════════════════ */

function tradeValue(p) {
  if (!p) return 0;
  const age = p.age || 25;
  const ageMod = age <= 24 ? 1.15 : age <= 28 ? 1.0 : age <= 31 ? 0.85 : 0.65;
  const pot = (p.potential || 60) / 100;
  let raw = 0;
  if (p.isPitcher) {
    const pi = p.pitching || {};
    raw = ((pi.velocity || 50) * 1.2 + (pi.control || 50) * 1.3 + (pi.breaking || 50) + (pi.stamina || 50) * 0.8 + (pi.clutchP || 50) * 0.5) / 4.8;
  } else {
    const ba = p.batting || {};
    raw = ((ba.contact || 50) * 1.2 + (ba.power || 50) + (ba.eye || 50) * 0.9 + (ba.speed || 50) * 0.7 + (ba.clutch || 50) * 0.5) / 4.3;
  }
  return Math.round(raw * ageMod * (0.7 + pot * 0.3));
}

function analyzeTeamNeeds(team) {
  const pitchers = team.players.filter((p) => p.isPitcher);
  const starters = pitchers.filter((p) => p.subtype === "先発");
  const avgV = pitchers.length ? pitchers.reduce((s, p) => s + p.pitching.velocity, 0) / pitchers.length : 50;
  const batters = team.players.filter((p) => !p.isPitcher);
  const avgC = batters.length ? batters.reduce((s, p) => s + p.batting.contact, 0) / batters.length : 50;
  const avgAge = team.players.reduce((s, p) => s + p.age, 0) / Math.max(team.players.length, 1);
  const needs = [];
  if (starters.length < 4) needs.push("先発投手が不足");
  if (avgV < 60) needs.push("投手陣の球威強化");
  if (avgC < 60) needs.push("ミート力の向上");
  if (avgAge > 30) needs.push("若手の補充が急務");
  if (needs.length === 0) needs.push("バランス型の補強");
  return needs.slice(0, 2);
}

function evalTradeForCpu(cpuTeam, give, receive, cashDiff) {
  const gv = give.reduce((s, p) => s + tradeValue(p), 0);
  const rv = receive.reduce((s, p) => s + tradeValue(p), 0);
  let diff = gv - rv + (cashDiff || 0) / 100000;
  const needs = analyzeTeamNeeds(cpuTeam);
  const np = needs.some((n) => n.includes("投手"));
  give.forEach((p) => { if (np && p.isPitcher) diff += 8; if (!np && !p.isPitcher) diff += 5; if ((p.age || 25) <= 23) diff += 5; });
  receive.forEach((p) => { if ((p.age || 25) <= 26 && tradeValue(p) > 70) diff -= 8; });
  return { diff, fair: diff >= -5, favorable: diff >= 8 };
}

function generateCpuOffer(cpuTeam, myTeam) {
  const mp = myTeam.players.filter((p) => !p.injury);
  const cp = cpuTeam.players.filter((p) => !p.injury);
  if (!mp.length || !cp.length) return null;
  const needs = analyzeTeamNeeds(cpuTeam);
  const np = needs.some((n) => n.includes("投手"));
  const want = mp.filter((p) => np ? p.isPitcher : !p.isPitcher).sort((a, b) => tradeValue(b) - tradeValue(a))[0];
  if (!want) return null;
  const wv = tradeValue(want);
  const offer = cp.map((p) => ({ p, d: Math.abs(tradeValue(p) - wv) })).sort((a, b) => a.d - b.d)[0]?.p;
  if (!offer) return null;
  const vd = tradeValue(offer) - wv;
  return { from: cpuTeam, want: [want], offer: [offer], cash: vd < -10 ? Math.abs(vd) * 500000 : 0 };
}


/* ═══ engine/finance.js ═══ */

/* ═══════════════════════════════════════════════
   FINANCE
═══════════════════════════════════════════════ */

function calcRevenue(team) {
  const g = team.wins + team.losses;
  const wr = g > 0 ? team.wins / g : 0.5;
  const ticket = Math.round(team.budget * 0.3 * (0.6 + team.popularity / 200 + wr * 0.4) * BATCH / SEASON_GAMES * 1000);
  const sponsor = [
    { minWin: 0, v: 5000 }, { minWin: 30, v: 15000 },
    { minWin: 60, v: 40000 }, { minWin: 90, v: 90000 },
  ].slice().reverse().find((s) => team.wins >= s.minWin)?.v * 10000 || 50000;
  return { ticket, sponsor: Math.round(sponsor / SEASON_GAMES * BATCH), merch: Math.round(ticket * 0.08) };
}


/* ═══ engine/simulation.js ═══ */

/* ═══════════════════════════════════════════════
   SIMULATION ENGINE
═══════════════════════════════════════════════ */

// 打球速度の計算
const calcEV = (bat, pit) =>
  clamp(95 + bat.batting.power * 0.55 + bat.batting.contact * 0.2 - pit.pitching.velocity * 0.08 + rngf(-20, 20), 55, 190);

// 打球角度の計算
const calcLA = (bat) =>
  clamp(6 + bat.batting.power * 0.28 + rngf(-28, 32), -18, 65);

// 飛距離の計算
const calcDist = (ev, la) =>
  Math.round(Math.max(0, Math.pow(ev / 3.6, 2) * Math.sin(2 * Math.max(0, la * Math.PI / 180)) / 9.8 * 0.72));

// インプレー結果判定
function contactResult(ev, la, bat, defMod = 0) {
  if (ev > 152 && la >= 22 && la <= 40) return "hr";
  if (ev > 145 && la >= 25 && la <= 38 && Math.random() < 0.55) return "hr";

  if (la >= 8 && la <= 25) {
    if (ev > 142) return Math.random() < 0.42 ? "2b" : "1b";
    if (ev > 122) return Math.random() < clamp(0.52 - defMod * 0.8, 0.25, 0.75) ? "1b" : "fo";
    return Math.random() < clamp(0.30 - defMod * 0.8, 0.10, 0.55) ? "1b" : "fo";
  }

  const speed = bat?.batting?.speed || 50;
  const tripleP = clamp(0.03 + (speed - 50) / 500, -0.01, 0.12);
  if (la >= 15 && la <= 28 && ev > 140 && Math.random() < tripleP) return "3b";
  if (la >= 25) return ev > 148 && la <= 42 ? (Math.random() < 0.35 ? "2b" : "fo") : "fo";

  const groundHitP = clamp(0.22 - defMod * 1.2 + (speed - 50) / 600, 0.05, 0.40);
  return Math.random() < groundHitP ? "1b" : "go";
}

// 打者vs投手の相性スコア
function matchupScore(bat, pit) {
  if (!bat?.batting || !pit?.pitching) return 0;
  const off = (bat.batting.contact * 2 + bat.batting.power + bat.batting.eye) / 4;
  const def = (pit.pitching.velocity + pit.pitching.control * 2 + pit.pitching.breaking) / 4;
  return Math.round((off - def) / 100 * 100);
}

// 疲労度計算
function calcFatigue(pitchCount, stamina) {
  const base = pitchCount / PITCH_LIMIT * 100;
  const adj = base * (1 - (stamina - 50) / 200);
  return clamp(Math.round(adj), 0, 100);
}

// 1打席シミュレート
function simAtBat(bat, pit, strategy = "normal", pitchCount = 0, situation = {}) {
  const condMod = (bat?.condition || 100) / 100;
  const pitCondMod = (pit?.condition || 100) / 100;
  const fatigueMod = (1 - calcFatigue(pitchCount, pit?.pitching?.stamina || 60) / 200) * pitCondMod;
  const off = (bat?.batting?.contact * 2 + bat?.batting?.power + bat?.batting?.eye) / 4 * condMod || 50;
  const def = ((pit?.pitching?.velocity + pit?.pitching?.control * 2 + pit?.pitching?.breaking) / 4 || 60) * fatigueMod;
  const d = (off - def) / 100;

  let kMod = 0, bbMod = 0, hitMod = 0;

  // 作戦補正
  if (strategy === "bunt") { hitMod -= 0.15; kMod -= 0.10; }
  if (strategy === "hitrun") { hitMod += 0.05; kMod += 0.03; }

  // 対左右補正
  const pitIsLeft = pit?.hand === "left";
  if (pitIsLeft) {
    const vsLeftMod = ((bat?.batting?.vsLeft || 50) - 50) / 500;
    hitMod += vsLeftMod;
    kMod -= vsLeftMod * 0.5;
  }

  // 変化球対応 vs 球種の多彩さ
  const pitVariety = pit?.pitching?.variety || 50;
  const batBreaking = bat?.batting?.breakingBall || 50;
  const breakingMod = (batBreaking - pitVariety) / 1000;
  kMod -= breakingMod;
  hitMod += breakingMod * 0.5;

  // 球のキレ補正
  const sharpnessMod = ((pit?.pitching?.sharpness || 50) - 50) / 1200;
  kMod += sharpnessMod;

  // 緩急補正
  const tempoMod = ((pit?.pitching?.tempo || 50) - 50) / 1500;
  kMod += tempoMod;
  hitMod -= tempoMod * 0.5;

  // クラッチ補正
  const isClutch = situation.runnersInScoring && situation.closeGame;
  if (isClutch) {
    const batClutch = ((bat?.batting?.clutch || 50) - 50) / 800;
    hitMod += batClutch;
  }

  // ピンチ耐性
  if (situation.runnersOnBase) {
    const pitPinch = ((pit?.pitching?.clutchP || 50) - 50) / 1000;
    kMod += pitPinch * 0.5;
    hitMod -= pitPinch;
  }

  // 試合終盤スタミナ補正
  if (situation.lateGame) {
    const batStamina = ((bat?.batting?.stamina || 50) - 50) / 1200;
    hitMod += batStamina;
    kMod -= batStamina * 0.3;
  }

  // 最終確率計算
  const kP = clamp(0.19 - bat?.batting?.eye / 900 + pit?.pitching?.velocity / 550 - d * 0.06 + kMod, 0.05, 0.40);
  const bbP = clamp(0.08 + bat?.batting?.eye / 1400 + d * 0.03 + bbMod, 0.04, 0.20);
  const r = Math.random();
  const pitches = rng(3, 7);

  if (strategy === "walk") return { result: "bb", ev: 0, la: 0, dist: 0, pitches, isIntentional: true };
  if (strategy === "bunt" && Math.random() < 0.55) return { result: "sac", ev: 0, la: 0, dist: 0, pitches: 2 };
  if (r < kP) return { result: "k", ev: 0, la: 0, dist: 0, pitches };
  if (r < kP + bbP) return { result: "bb", ev: 0, la: 0, dist: 0, pitches };
  if (r < kP + bbP + 0.01) return { result: "hbp", ev: 0, la: 0, dist: 0, pitches: 1 };

  const defMod = ((situation.fieldingLevel || 50) - 50) / 500;
  const evBase = Math.round(calcEV(bat, pit));
  const ev = clamp(evBase, 55, 190);
  const la = Math.round(calcLA(bat));
  const dist = calcDist(ev, la);
  return { result: contactResult(ev, la, bat, defMod), ev, la, dist, pitches };
}

/* ═══════════════════════════════════════════════
   TACTICAL GAME STATE
═══════════════════════════════════════════════ */

function initGameState(myTeam, oppTeam) {
  const myL = myTeam.lineup.map((id) => myTeam.players.find((p) => p.id === id)).filter(Boolean);
  const opL = oppTeam.lineup.map((id) => oppTeam.players.find((p) => p.id === id)).filter(Boolean);
  const myStarter = myTeam.players.find((p) => p.id === myTeam.rotation[myTeam.rotIdx % Math.max(myTeam.rotation.length, 1)]) || myTeam.players.find((p) => p.isPitcher && p.subtype === "先発");
  const opStarter = oppTeam.players.find((p) => p.id === oppTeam.rotation[oppTeam.rotIdx % Math.max(oppTeam.rotation.length, 1)]) || oppTeam.players.find((p) => p.isPitcher);
  const myBullpen = myTeam.players.filter((p) => p.isPitcher && p.id !== myStarter?.id);
  const myBench = myTeam.players.filter((p) => !p.isPitcher && !myTeam.lineup.includes(p.id));

  return {
    inning: 1, isTop: true, score: { my: 0, opp: 0 },
    outs: 0, bases: [null, null, null], log: [], inningSummary: [],
    myLineup: [...myL], opLineup: [...opL],
    myBatIdx: 0, opBatIdx: 0,
    myPitcher: myStarter, opPitcher: opStarter,
    myPitchCount: 0, opPitchCount: 0,
    myBullpen, myBench,
    usedBullpen: [], usedPH: {}, usedPR: {},
    momentum: 50, stopped: false, stopReason: null, stopData: null,
    pendingStrategy: "normal", gameOver: false,
    myInningRuns: 0, opInningRuns: 0,
  };
}

// 1打席処理
function processAtBat(gs, strategy = "normal") {
  const isMyAtBat = !gs.isTop;
  const batter = isMyAtBat ? gs.myLineup[gs.myBatIdx % gs.myLineup.length] : gs.opLineup[gs.opBatIdx % gs.opLineup.length];
  const pitcher = isMyAtBat ? gs.opPitcher : gs.myPitcher;
  const pitchCount = isMyAtBat ? gs.opPitchCount : gs.myPitchCount;

  // 盗塁処理
  if (strategy === "steal") {
    const newBases = [...gs.bases];
    const stealBase = newBases[0] ? 0 : newBases[1] ? 1 : -1;
    if (stealBase >= 0) {
      const runnerId = newBases[stealBase];
      const lineup = isMyAtBat ? gs.myLineup : gs.opLineup;
      const runner = lineup.find((p) => p.id === runnerId) || batter;
      const speed = runner?.batting?.speed || 50;
      const pitControl = pitcher?.pitching?.control || 60;
      const stealSkill = runner?.batting?.stealSkill || 50;
      const successRate = clamp(0.55 + speed / 500 + stealSkill / 600 - pitControl / 600, 0.25, 0.88);
      const success = Math.random() < successRate;

      if (success) { newBases[stealBase + 1] = newBases[stealBase]; newBases[stealBase] = null; }
      else { newBases[stealBase] = null; }

      const result = success ? "sb" : "cs";
      const newOuts = success ? gs.outs : gs.outs + 1;
      const newMomentum = clamp(gs.momentum + (success ? (isMyAtBat ? 6 : -6) : (isMyAtBat ? -5 : 5)), 0, 100);

      const stealLog = {
        inning: gs.inning, isTop: gs.isTop, batter: runner?.name || "?", batId: runner?.id,
        pitcherId: pitcher?.id, result, ev: 0, la: 0, dist: 0, rbi: 0,
        outs: newOuts, bases: [...newBases], pitches: 0,
        strategy: "steal", scorer: isMyAtBat, isStolenBase: true,
      };

      if (newOuts >= 3) {
        return endHalfInning({ ...gs, outs: newOuts, bases: newBases, momentum: newMomentum, log: [...gs.log, stealLog] });
      }
      return processAtBat({ ...gs, outs: newOuts, bases: newBases, momentum: newMomentum, log: [...gs.log, stealLog] }, "normal");
    }
  }

  // 守備レベル
  const fieldingTeamLineup = isMyAtBat ? gs.opLineup : gs.myLineup;
  const fieldingLevel = fieldingTeamLineup.length > 0
    ? fieldingTeamLineup.filter((p) => !p.isPitcher).reduce((s, p) => s + (p.batting?.defense || 50), 0) / Math.max(fieldingTeamLineup.filter((p) => !p.isPitcher).length, 1)
    : 50;

  const situation = {
    runnersOnBase: gs.bases.some(Boolean),
    runnersInScoring: gs.bases[1] || gs.bases[2],
    lateGame: gs.inning >= 7,
    closeGame: Math.abs((gs.score?.my || 0) - (gs.score?.opp || 0)) <= 2,
    fieldingLevel,
  };
  const { result, ev, la, dist, pitches, isIntentional } = simAtBat(batter, pitcher, strategy, pitchCount, situation);

  let newBases = [...gs.bases];
  let runs = 0, rbi = 0, outs = gs.outs;
  let momentumDelta = 0;

  const runnerOf = (baseIdx) => {
    const rid = newBases[baseIdx];
    if (!rid) return null;
    const lineup = isMyAtBat ? gs.myLineup : gs.opLineup;
    return lineup.find((p) => p.id === rid) || null;
  };
  const advanceP = (runner, base = 0.5) => {
    if (!runner) return base;
    const speed = runner.batting?.speed || 50;
    const br = runner.batting?.baseRunning || 50;
    return clamp(base + (speed - 50) / 400 + (br - 50) / 600, base - 0.15, base + 0.20);
  };

  if (IS_OUT(result)) {
    outs++;
    momentumDelta = isMyAtBat ? -3 : 3;
    if (result === "sac" && newBases[0]) { newBases = [null, newBases[0], null]; }
  } else if (result === "bb" || result === "hbp") {
    if (newBases[0] && newBases[1] && newBases[2]) { runs++; rbi = 1; }
    else if (newBases[0] && newBases[1]) newBases[2] = newBases[1];
    else if (newBases[0]) newBases[1] = newBases[0];
    newBases[0] = batter?.id || "r";
    momentumDelta = isMyAtBat ? 2 : -2;
  } else if (result === "hr") {
    rbi = 1 + newBases.filter(Boolean).length; runs = rbi; newBases = [null, null, null];
    momentumDelta = isMyAtBat ? 18 : -18;
  } else if (result === "3b") {
    rbi = newBases.filter(Boolean).length; runs = rbi; newBases = [null, null, batter?.id || "r"];
    momentumDelta = isMyAtBat ? 12 : -12;
  } else if (result === "2b") {
    const r3 = newBases[2] ? 1 : 0;
    const r2 = newBases[1] ? 1 : 0;
    const runner1 = runnerOf(0);
    const r1 = newBases[0] && Math.random() < advanceP(runner1, 0.40) ? 1 : 0;
    runs = r3 + r2 + r1; rbi = runs;
    newBases = [null, batter?.id || "r", null];
    momentumDelta = isMyAtBat ? 8 : -8;
  } else if (result === "1b") {
    const r3 = newBases[2] ? 1 : 0;
    const runner2 = runnerOf(1);
    const r2 = newBases[1] && Math.random() < advanceP(runner2, 0.55) ? 1 : 0;
    runs = r3 + r2; rbi = runs;
    newBases = [batter?.id || "r", newBases[0], r2 ? null : newBases[1]];
    momentumDelta = isMyAtBat ? 5 : -5;
  }

  const newMomentum = clamp(gs.momentum + momentumDelta, 0, 100);
  const newScore = { ...gs.score };
  if (isMyAtBat) newScore.my += runs; else newScore.opp += runs;

  let newMyBatIdx = gs.myBatIdx, newOpBatIdx = gs.opBatIdx;
  if (isMyAtBat) newMyBatIdx = gs.myBatIdx + 1; else newOpBatIdx = gs.opBatIdx + 1;

  let newMyPC = gs.myPitchCount, newOpPC = gs.opPitchCount;
  if (isMyAtBat) newOpPC += pitches; else newMyPC += pitches;

  const logEntry = {
    inning: gs.inning, isTop: gs.isTop, batter: batter?.name || "?", batId: batter?.id,
    pitcherId: pitcher?.id, result, ev, la, dist, rbi,
    outs: IS_OUT(result) ? outs : gs.outs,
    bases: [...newBases], pitches, isIntentional,
    strategy: strategy !== "normal" ? strategy : undefined,
    scorer: isMyAtBat,
  };

  return {
    ...gs, outs, bases: newBases, score: newScore,
    log: [...gs.log, logEntry],
    myBatIdx: newMyBatIdx, opBatIdx: newOpBatIdx,
    myPitchCount: newMyPC, opPitchCount: newOpPC,
    momentum: newMomentum,
    myInningRuns: !gs.isTop ? gs.myInningRuns + runs : gs.myInningRuns,
    opInningRuns: gs.isTop ? gs.opInningRuns + runs : gs.opInningRuns,
    stopped: false, stopReason: null, pendingStrategy: "normal",
  };
}

// イニング終了処理
function endHalfInning(gs) {
  const isTop = gs.isTop;
  const newInn = isTop ? gs.inning : gs.inning + 1;
  const newIsTop = !isTop;
  const newSummary = [...gs.inningSummary, { inning: gs.inning, isTop, runs: isTop ? gs.opInningRuns : gs.myInningRuns }];

  if (!isTop && gs.inning === 9 && gs.score.my > gs.score.opp)
    return { ...gs, inningSummary: newSummary, gameOver: true, outs: 0, bases: [null, null, null] };
  if (newInn > 9 && gs.score.my !== gs.score.opp)
    return { ...gs, inningSummary: newSummary, gameOver: true, outs: 0, bases: [null, null, null] };
  if (newInn > 12)
    return { ...gs, inningSummary: newSummary, gameOver: true, outs: 0, bases: [null, null, null] };

  return { ...gs, inning: newInn, isTop: newIsTop, outs: 0, bases: [null, null, null], inningSummary: newSummary, myInningRuns: 0, opInningRuns: 0 };
}

// 重要局面チェック
function checkStopCondition(gs) {
  if (!gs.isTop && gs.myPitchCount >= PITCH_WARNING && gs.myBullpen.length > 0)
    return { reason: "pitcher_tired", label: "⚠️ 投手疲労警告", priority: 2, data: { pitchCount: gs.myPitchCount, pitcher: gs.myPitcher } };
  if (!gs.isTop && gs.myPitchCount >= PITCH_LIMIT)
    return { reason: "pitcher_limit", label: "🚨 投手交代必須", priority: 5, data: { pitchCount: gs.myPitchCount, pitcher: gs.myPitcher } };
  if (gs.isTop && gs.outs === 2 && (gs.bases[1] || gs.bases[2]) && gs.myBullpen.length > 0)
    return { reason: "scoring_position_crisis", label: "🔴 得点圏ピンチ！", priority: 3, data: null };

  const myBehind = gs.score.opp - gs.score.my;
  if (!gs.isTop && myBehind >= 0 && myBehind <= 2 && (gs.bases[0] || gs.bases[1] || gs.bases[2]))
    return { reason: "scoring_chance", label: "🟡 チャンス！采配を指示", priority: 2, data: { gap: myBehind } };

  if (!gs.isTop && gs.inning >= 7) {
    const nextBatIdx = gs.myBatIdx % gs.myLineup.length;
    const nextBatter = gs.myLineup[nextBatIdx];
    if (nextBatter?.batting && nextBatter.batting.contact < 60 && gs.myBench.length > 0)
      return { reason: "pinch_hit_chance", label: "💡 代打のチャンス", priority: 1, data: { batter: nextBatter } };
  }

  if (gs.isTop && gs.inning >= 8) {
    const diff = gs.score.my - gs.score.opp;
    if (diff >= 1 && diff <= 2) {
      const closers = gs.myBullpen.filter((p) => p.subtype === "抑え" || p.subtype === "中継ぎ");
      if (closers.length > 0 && gs.myPitcher?.subtype === "先発")
        return { reason: "closer_time", label: "🔒 クローザー投入タイミング", priority: 2, data: { closers } };
    }
  }
  return null;
}

// バッチシム（非戦術モード）
function quickSimGame(myTeam, oppTeam) {
  let gs = initGameState(myTeam, oppTeam);
  while (!gs.gameOver) {
    const stop = checkStopCondition(gs);
    if (stop?.reason === "pitcher_limit" || stop?.reason === "pitcher_tired") {
      if (gs.myBullpen.length > 0) {
        const rp = gs.myBullpen[0];
        gs = { ...gs, myPitcher: rp, myBullpen: gs.myBullpen.slice(1), myPitchCount: 0 };
      }
    }

    let autoStrategy = "normal";
    const isMyAtBat = !gs.isTop;
    const lineup = isMyAtBat ? gs.myLineup : gs.opLineup;
    if (gs.bases[0] && !gs.bases[1] && gs.outs < 2) {
      const runner = lineup.find((p) => p.id === gs.bases[0]);
      const speed = runner?.batting?.speed || 50;
      const stealSkill = runner?.batting?.stealSkill || 50;
      const stealProb = speed >= 80 && stealSkill >= 70 ? 0.28 : speed >= 70 && stealSkill >= 60 ? 0.18 : speed >= 60 && stealSkill >= 50 ? 0.08 : 0;
      if (Math.random() < stealProb) autoStrategy = "steal";
    }

    gs = processAtBat(gs, autoStrategy);
    if (gs.outs >= 3) gs = endHalfInning(gs);
  }
  return { score: gs.score, won: gs.score.my > gs.score.opp, log: gs.log, inningSummary: gs.inningSummary };
}


/* ═══ engine/postGame.js ═══ */

/* ═══════════════════════════════════════════════
   POST-GAME PROCESSING
═══════════════════════════════════════════════ */

// 試合ログから選手成績を反映
function applyGameStatsFromLog(players, log, isMyTeam, won) {
  const myAtBats = log.filter((e) => e.scorer === isMyTeam && e.batId && e.result && e.result !== "change");
  const myPitchABs = log.filter((e) => e.scorer === !isMyTeam && e.pitcherId && e.result && e.result !== "change");

  const pitcherMap = {};
  myPitchABs.forEach((e) => {
    if (!pitcherMap[e.pitcherId]) pitcherMap[e.pitcherId] = { BF: 0, Kp: 0, BBp: 0, HBPp: 0, HRp: 0, Hp: 0, ER: 0, pitches: 0, outs: 0 };
    const m = pitcherMap[e.pitcherId];
    m.BF++;
    m.pitches += (e.pitches || 4);
    if (e.result === "k") m.Kp++;
    if (e.result === "bb") m.BBp++;
    if (e.result === "hbp") m.HBPp++;
    if (e.result === "hr") { m.HRp++; m.ER += e.rbi || 1; }
    if (IS_HIT(e.result) && e.result !== "hr") m.Hp++;
    if (IS_OUT(e.result)) m.outs++;
    if (e.rbi > 0 && e.result !== "hr") m.ER += e.rbi;
  });

  const updated = players.map((p) => {
    const pm = pitcherMap[p.id];
    const allMyEvents = log.filter((e) => e.scorer === isMyTeam && e.batId === p.id && e.result && e.result !== "change");
    if (!allMyEvents.length && !pm) return p;
    const s = { ...p.stats };

    allMyEvents.forEach((e) => {
      if (e.isStolenBase) {
        if (e.result === "sb") s.SB++;
        if (e.result === "cs") s.CS++;
        return;
      }
      s.PA++;
      const isBB = e.result === "bb";
      const isHBP = e.result === "hbp";
      if (!isBB && !isHBP) s.AB++;
      if (IS_HIT(e.result)) s.H++;
      if (e.result === "2b") s.D++;
      if (e.result === "3b") s.T++;
      if (e.result === "hr") s.HR++;
      if (isBB) s.BB++;
      if (isHBP) s.HBP++;
      if (e.result === "k") s.K++;
      s.RBI += (e.rbi || 0);
      if (e.ev > 0) { s.evSum += e.ev; s.evN++; }
      if (e.ev > 0 && e.la !== undefined) { s.laSum += e.la; s.laN++; }
    });

    if (pm) {
      const ip = pm.outs / 3;
      s.IP = r2(s.IP + ip);
      s.BF += pm.BF; s.Kp += pm.Kp; s.BBp += pm.BBp;
      s.HBPp += pm.HBPp; s.HRp += pm.HRp; s.Hp += pm.Hp;
      s.ER += Math.round(pm.ER);
    }
    return { ...p, stats: s };
  });

  if (won !== undefined) {
    const starters = Object.entries(pitcherMap).sort((a, b) => b[1].outs - a[1].outs);
    if (starters.length > 0) {
      const starterId = starters[0][0];
      return updated.map((p) => {
        if (p.id !== starterId) return p;
        return { ...p, stats: { ...p.stats, W: p.stats.W + (won ? 1 : 0), L: p.stats.L + (won ? 0 : 1) } };
      });
    }
  }
  return updated;
}

// 試合後コンディション更新
function applyPostGameCondition(players, log, isMyTeam) {
  const pitchCountMap = {};
  log.forEach((e) => {
    if (!e.pitcherId || e.isStolenBase) return;
    const isPitcherOfMyTeam = isMyTeam ? (e.isTop === true) : (e.isTop === false);
    if (!isPitcherOfMyTeam) return;
    pitchCountMap[e.pitcherId] = (pitchCountMap[e.pitcherId] || 0) + (e.pitches || 0);
  });

  return players.map((p) => {
    if (p.isPitcher) {
      const thrown = pitchCountMap[p.id] || 0;
      if (thrown === 0) return p;
      const recoveryBonus = ((p.pitching?.recovery || 50) - 50) / 200;
      const fatigueDrop = clamp(Math.round(thrown / 3 - recoveryBonus * 15), 5, 40);
      const newCond = clamp(p.condition - fatigueDrop, 30, 100);
      return { ...p, condition: newCond, lastPitched: true };
    } else {
      const played = log.some((e) => e.batId === p.id && !e.isStolenBase);
      if (!played) return p;
      const recoveryBonus = ((p.batting?.recovery || 50) - 50) / 300;
      const delta = clamp(Math.round(-3 + recoveryBonus * 5), -5, 2);
      const newCond = clamp(p.condition + delta, 50, 100);
      return { ...p, condition: newCond };
    }
  });
}


/* ═══ engine/draft.js ═══ */

/* ═══════════════════════════════════════════════
   DRAFT SYSTEM
═══════════════════════════════════════════════ */

function draftOverallComment(pool) {
  const avgPot = Math.round(pool.slice(0, 5).reduce((s, p) => s + p.potential, 0) / 5);
  if (avgPot >= 80) return "今年は豊作！上位候補の質が非常に高く、激しい争奪戦が予想される。";
  if (avgPot >= 70) return "例年並みの水準。上位3選手が抜けており、そこへの集中が予想される。";
  return "やや小粒なドラフト。ポテンシャル重視で掘り出し物を狙うチームが有利かもしれない。";
}

function recommendForTeam(team, pool) {
  const needsPitcher = team.players.filter((p) => p.isPitcher).length < 8;
  return pool
    .map((p) => ({
      ...p,
      recScore: p.potential + (needsPitcher && p.isPitcher ? 15 : 0) + (!needsPitcher && !p.isPitcher ? 10 : 0) + (p.age <= 20 ? 8 : p.age <= 21 ? 4 : 0),
    }))
    .sort((a, b) => b.recScore - a.recScore)
    .slice(0, 5);
}

function initDraftPool(myTeam) {
  const pos = [...Array(6)].map(() => "先発")
    .concat([...Array(3)].map(() => "中継ぎ"))
    .concat([...Array(3)].map(() => "抑え"))
    .concat(POSITIONS.flatMap((q) => [q, q, q, q]));
  const raw = Array.from({ length: DRAFT_POOL_SIZE }, (_, i) => {
    const isPitch = i < 12;
    const q = rng(40, 78);
    return makePlayer(isPitch ? pos[i % 12] : POSITIONS[i % 7], q, isPitch, rng(18, 22));
  });
  const scoutedPlayers = (myTeam?.scoutResults || []).map((p) => ({
    ...p, fromScout: true, age: clamp(p.age || 20, 18, 22),
  }));
  const combined = [...raw, ...scoutedPlayers].sort((a, b) => {
    const ov = (x) => x.isPitcher
      ? (x.pitching.velocity + x.pitching.control + x.pitching.breaking) / 3
      : (x.batting.contact + x.batting.power + x.batting.eye) / 3;
    return ov(b) - ov(a);
  });
  combined.slice(0, 3).forEach((p, i) => {
    p.spotlight = ["👑 今年の目玉", "⭐ 超高評価", "🔥 注目株"][i];
  });
  return combined;
}


/* ═══ engine/playoff.js ═══ */

/* ═══════════════════════════════════════════════
   PLAYOFF SYSTEM
═══════════════════════════════════════════════ */

function initPlayoff(teams) {
  const se = [...teams.filter((t) => t.league === "セ")].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const pa = [...teams.filter((t) => t.league === "パ")].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const mkSeries = (t0, t1, adv0, adv1, label) => ({
    label, teams: [t0, t1], wins: [adv0, adv1], adv: [adv0, adv1],
    games: [], done: false, winner: null,
  });
  return {
    phase: "cs1_se",
    cs1_se: mkSeries(se[1], se[2], 0, 0, "CSファーストステージ（セ）"),
    cs1_pa: mkSeries(pa[1], pa[2], 0, 0, "CSファーストステージ（パ）"),
    cs2_se: null, cs2_pa: null, jpSeries: null, champion: null,
    se1: se[0], pa1: pa[0],
  };
}

function seriesWinner(series, need) {
  if (series.wins[0] >= need) return 0;
  if (series.wins[1] >= need) return 1;
  return null;
}


/* ═══ components/ui.jsx ═══ */

/* ═══════════════════════════════════════════════
   SHARED UI COMPONENTS
═══════════════════════════════════════════════ */

function OV({ v }) {
  const c = v >= 85 ? "#ffd700" : v >= 75 ? "#34d399" : v >= 62 ? "#60a5fa" : v >= 50 ? "#94a3b8" : "#f87171";
  return <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 13, color: c, fontWeight: 700 }}>{v}</span>;
}

function CondBadge({ p }) {
  if (p?.injury) return <span className="inj-badge">🤕{p.injury.name}</span>;
  const c = (p?.condition || 100) >= 80 ? "#34d399" : (p?.condition || 100) >= 60 ? "#f5c842" : "#f87171";
  return <span style={{ fontSize: 9, color: c }}>●{p?.condition || 100}</span>;
}

function HandBadge({ p }) {
  if (!p?.isPitcher) return null;
  const isLeft = p.hand === "left";
  return (
    <span style={{
      fontSize: 9, fontFamily: "'Share Tech Mono',monospace",
      background: isLeft ? "rgba(167,139,250,.15)" : "rgba(96,165,250,.12)",
      color: isLeft ? "#a78bfa" : "#60a5fa",
      border: `1px solid ${isLeft ? "rgba(167,139,250,.4)" : "rgba(96,165,250,.3)"}`,
      borderRadius: 3, padding: "0px 4px", marginLeft: 4, fontWeight: 700,
    }}>
      {isLeft ? "左" : "右"}
    </span>
  );
}

function PersonalityView({ p }) {
  return (
    <div style={{ marginTop: 8 }}>
      {PVAL_DEFS.map((d) => (
        <div key={d.k} className="pval-bar">
          <div className="pval-lbl">{d.lbl}</div>
          <div className="pval-track">
            <div className="pval-fill" style={{ width: `${p.personality[d.k]}%`, background: d.color }} />
          </div>
          <div className="pval-num" style={{ color: d.color }}>{p.personality[d.k]}</div>
        </div>
      ))}
    </div>
  );
}

// セイバーメトリクスの解説ツールチップ付きテーブルヘッダー
const STAT_TIPS = {
  "打席": { en: "PA", desc: "打席に立った回数" },
  "打率": { en: "AVG", desc: "安打 ÷ 打数。打者の基本指標" },
  "OPS":  { en: "OPS", desc: "出塁率+長打率。総合力の指標" },
  "wOBA": { en: "wOBA", desc: "各打撃結果を重み付けした出塁貢献度" },
  "wRC+": { en: "wRC+", desc: "リーグ平均を100とした得点創出力" },
  "ISO":  { en: "ISO", desc: "長打率-打率。純粋な長打力" },
  "BABIP":{ en: "BABIP", desc: "フェアゾーン打球の安打率。運の指標" },
  "四球率": { en: "BB%", desc: "打席における四球の割合" },
  "三振率": { en: "K%", desc: "打席における三振の割合" },
  "打球速度": { en: "Exit Velo", desc: "打球の初速（km/h）" },
  "打球角度": { en: "Launch Angle", desc: "打球の角度（度）" },
  "WAR":   { en: "WAR", desc: "代替選手との勝利貢献差" },
  "投球回": { en: "IP", desc: "投球した回数" },
  "防御率": { en: "ERA", desc: "9イニングあたりの自責点" },
  "WHIP":  { en: "WHIP", desc: "1イニングあたり出塁許可数" },
  "FIP":   { en: "FIP", desc: "守備に依存しない投手の真の実力指標" },
  "xFIP":  { en: "xFIP", desc: "被本塁打をリーグ平均に補正したFIP" },
};

function ThCell({ label, openLabel, onOpen }) {
  const tip = STAT_TIPS[label];
  const isOpen = openLabel === label;
  return (
    <th
      style={{ position: "relative", cursor: tip ? "pointer" : "default" }}
      onClick={() => { if (tip) onOpen(isOpen ? null : label); }}
    >
      {label}
      {tip && <span style={{ fontSize: 8, color: "#60a5fa", marginLeft: 2 }}>ⓘ</span>}
      {isOpen && tip && (
        <div style={{
          position: "absolute", top: "100%", left: 0,
          background: "#0d2030", border: "1px solid rgba(96,165,250,.3)",
          borderRadius: 8, padding: "8px 11px", zIndex: 200, width: 180,
          boxShadow: "0 8px 24px rgba(0,0,0,.6)", marginTop: 4,
          animation: "fi .15s", pointerEvents: "none",
        }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#60a5fa", marginBottom: 3 }}>{tip.en}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400, lineHeight: 1.5, whiteSpace: "normal", textAlign: "left" }}>{tip.desc}</div>
        </div>
      )}
    </th>
  );
}


/* ═══ components/TacticalGame.jsx ═══ */


function TacticalGameScreen({myTeam,oppTeam,onGameEnd}){
  const [gs,setGs]=useState(()=>initGameState(myTeam,oppTeam));
  const [autoRunning,setAutoRunning]=useState(false);
  const [selectedPH,setSelectedPH]=useState(null);
  const [selectedRP,setSelectedRP]=useState(null);
  const [selectedStrat,setSelectedStrat]=useState("normal");
  const [showMenu,setShowMenu]=useState(null); // "pitcher"|"pinch"|"strategy"
  const logRef=useRef(null);

  // Auto-scroll log
  useEffect(()=>{if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight;},[gs.log.length]);

  // Auto-advance: 自動進行モード
  useEffect(()=>{
    if(!autoRunning||gs.stopped||gs.gameOver) return;
    const t=setTimeout(()=>{
      setGs(prev=>{
        if(prev.stopped||prev.gameOver) return prev;
        if(prev.outs>=3) return endHalfInning(prev);
        let next=processAtBat(prev,"normal");
        if(next.outs>=3) return endHalfInning(next);
        // Check stop condition
        const stop=checkStopCondition(next);
        if(stop){setAutoRunning(false);return{...next,stopped:true,stopReason:stop.reason,stopData:stop};}
        return next;
      });
    },180);
    return()=>clearTimeout(t);
  },[autoRunning,gs]);

  // 手動1打席進める
  const advance=(strategy="normal")=>{
    setGs(prev=>{
      if(prev.stopped||prev.gameOver) return prev;
      if(prev.outs>=3) return endHalfInning(prev);
      let next=processAtBat(prev,strategy);
      if(next.outs>=3) return endHalfInning(next);
      const stop=checkStopCondition(next);
      if(stop) return{...next,stopped:true,stopReason:stop.reason,stopData:stop};
      return next;
    });
    setShowMenu(null);setSelectedStrat("normal");
  };

  // 続行（停止解除）
  const resume=()=>{setGs(prev=>({...prev,stopped:false,stopReason:null,stopData:null}));setShowMenu(null);setAutoRunning(true);};

  // 投手交代
  const changePitcher=rpId=>{
    const rp=gs.myBullpen.find(p=>p.id===rpId);
    if(!rp) return;
    setGs(prev=>({...prev,myPitcher:rp,myBullpen:prev.myBullpen.filter(p=>p.id!==rpId),myPitchCount:0,stopped:false,stopReason:null,stopData:null,log:[...prev.log,{inning:prev.inning,isTop:prev.isTop,result:"change",batter:"",text:`⬆️ 投手交代: ${prev.myPitcher?.name} → ${rp.name}`,scorer:false}]}));
    setShowMenu(null);setSelectedRP(null);setAutoRunning(true);
  };

  // 代打
  const sendPinchHitter=phId=>{
    const ph=gs.myBench.find(p=>p.id===phId);
    if(!ph||gs.isTop) return;
    const nextIdx=gs.myBatIdx%gs.myLineup.length;
    setGs(prev=>{
      const newLineup=[...prev.myLineup];
      newLineup[nextIdx]=ph;
      return{...prev,myLineup:newLineup,myBench:prev.myBench.filter(p=>p.id!==phId),stopped:false,stopReason:null,stopData:null,log:[...prev.log,{inning:prev.inning,isTop:prev.isTop,result:"change",text:`🔄 代打: ${ph.name}`,scorer:true}]};
    });
    setShowMenu(null);setSelectedPH(null);setAutoRunning(true);
  };

  if(gs.gameOver){
    const won=gs.score.my>gs.score.opp;
    return(
      <div className="app">
        <div className="rw">
          <div style={{color:"#1e2d3d",letterSpacing:".2em",fontSize:11,marginBottom:8}}>vs {oppTeam.name}</div>
          <div className={`rtitle ${won?"rwin":"rlose"}`}>{won?"勝利！！":"敗北..."}</div>
          <div className="rscore" style={{color:won?"#f5c842":"#374151"}}>{myTeam.short} {gs.score.my} – {gs.score.opp} {oppTeam.short}</div>
          <div style={{marginBottom:24}}>
            {/* Top batters */}
            <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
              {gs.myLineup.filter((p,i,arr)=>arr.indexOf(p)===i).map(p=>{
                const hits=gs.log.filter(e=>e.batId===p?.id&&IS_HIT(e.result));
                if(!hits.length) return null;
                return <div key={p?.id} className="card2" style={{textAlign:"center",minWidth:90}}>
                  <div style={{fontSize:11,fontWeight:700}}>{p?.name}</div>
                  <div className="mono" style={{color:"#f5c842"}}>{hits.length}安打</div>
                  <div style={{fontSize:9,color:"#374151"}}>{hits.filter(e=>e.result==="hr").length}HR {gs.log.filter(e=>e.batId===p?.id).reduce((s,e)=>s+(e.rbi||0),0)}打点</div>
                </div>;
              })}
            </div>
          </div>
          <button className="btn btn-gold" onClick={()=>onGameEnd(gs)}>試合終了 → 結果へ</button>
        </div>
      </div>
    );
  }

  const curPitcher=gs.myPitcher;
  const fatigue=calcFatigue(gs.myPitchCount,curPitcher?.pitching?.stamina||60);
  const fatigueColor=fatigue<40?"#34d399":fatigue<70?"#f5c842":"#f87171";
  const nextBatter=!gs.isTop?gs.myLineup[gs.myBatIdx%Math.max(gs.myLineup.length,1)]:gs.opLineup[gs.opBatIdx%Math.max(gs.opLineup.length,1)];
  const mu=matchupScore(!gs.isTop?nextBatter:null,gs.isTop?curPitcher:gs.opPitcher);
  const muLabel=mu>15?"⚡ 有利":mu>-15?"⚖️ 互角":"💀 不利";
  const muClass=mu>15?"mu-adv":mu>-15?"mu-even":"mu-dis";

  // Build scoreboard
  const inningScores={};
  gs.inningSummary.forEach(s=>{if(!inningScores[s.inning]) inningScores[s.inning]={top:"-",bot:"-"};if(s.isTop) inningScores[s.inning].top=s.runs;else inningScores[s.inning].bot=s.runs;});
  const maxInn=Math.max(9,gs.inning);
  const innings=Array.from({length:maxInn},(_,i)=>i+1);

  return(
    <div className="app">
      <style>{G}</style>
      <div className="gscreen">
        {/* LEFT: Main area */}
        <div>
          {/* Scoreboard */}
          <div className="scoreboard">
            <table className="sct">
              <thead><tr>
                <td className="stc" style={{color:"#1e2d3d",fontSize:9}}>チーム</td>
                {innings.map(i=><td key={i} style={{color:i===gs.inning?"#f5c842":"#1e2d3d",fontSize:9,fontWeight:i===gs.inning?700:400}}>{i}</td>)}
                <td className="stot" style={{color:"#1e2d3d",fontSize:9}}>R</td>
              </tr></thead>
              <tbody>
                <tr>
                  <td className="stc"><span style={{color:oppTeam.color}}>{oppTeam.emoji} {oppTeam.short}</span></td>
                  {innings.map(i=><td key={i} style={{color:inningScores[i]?.top>0?"#34d399":"#1e2d3d"}}>{inningScores[i]?.top??"-"}</td>)}
                  <td className="stot">{gs.score.opp}</td>
                </tr>
                <tr>
                  <td className="stc"><span style={{color:myTeam.color}}>{myTeam.emoji} {myTeam.short}</span></td>
                  {innings.map(i=><td key={i} style={{color:inningScores[i]?.bot>0?"#f5c842":"#1e2d3d"}}>{inningScores[i]?.bot??"-"}</td>)}
                  <td className="stot" style={{color:"#f5c842"}}>{gs.score.my}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Stop Banner */}
          {gs.stopped&&gs.stopData&&(
            <div className={`stop-banner ${gs.stopData.priority>=3?"danger":gs.stopData.reason==="scoring_chance"?"chance":"warning"}`}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{gs.stopData.label}</div>
              <div style={{fontSize:11,opacity:.8}}>
                {gs.stopData.reason==="pitcher_tired"&&`球数: ${gs.myPitchCount}球 / 疲労: ${fatigue}%`}
                {gs.stopData.reason==="scoring_position_crisis"&&"ランナーあり・2アウト — 投手交代を検討"}
                {gs.stopData.reason==="scoring_chance"&&`${gs.stopData.data?.gap===0?"同点":"1点差"}チャンス！作戦を指示`}
                {gs.stopData.reason==="pinch_hit_chance"&&`次打者: ${gs.stopData.data?.batter?.name} (ミート:${gs.stopData.data?.batter?.batting?.contact})`}
                {gs.stopData.reason==="closer_time"&&"終盤リード — クローザー投入を検討"}
              </div>
            </div>
          )}

          {/* Diamond + Game Info */}
          <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:10,flexWrap:"wrap"}}>
            {/* Diamond */}
            <div style={{textAlign:"center"}}>
              <div className="diamond">
                <div className="base bH"/><div className={`base b1 ${gs.bases[0]?"on":""}`}/>
                <div className={`base b2 ${gs.bases[1]?"on":""}`}/><div className={`base b3 ${gs.bases[2]?"on":""}`}/>
              </div>
              <div className="odots">{[0,1,2].map(i=><div key={i} className={`odot ${i<gs.outs?"on":""}`}/>)}</div>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#374151",marginTop:4}}>
                {gs.inning}回{gs.isTop?"表":"裏"}
              </div>
            </div>
            {/* Score big */}
            <div style={{flex:1,textAlign:"center",padding:"8px 0"}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:38,color:gs.score.my>gs.score.opp?"#f5c842":gs.score.my<gs.score.opp?"#f87171":"#94a3b8"}}>
                {gs.score.my} <span style={{color:"#1e2d3d",fontSize:22}}>–</span> {gs.score.opp}
              </div>
              <div style={{fontSize:11,color:"#374151",marginTop:2}}>{gs.isTop?"相手の攻撃":"自チームの攻撃"}</div>
            </div>
            {/* Pitcher info */}
            <div className="card2" style={{minWidth:160,margin:0}}>
              <div style={{fontSize:9,color:"#374151",letterSpacing:".2em",marginBottom:6}}>自チーム投手</div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{curPitcher?.name||"—"}</div>
              <div style={{fontSize:10,color:"#374151",marginBottom:6}}>球数: <span style={{fontFamily:"monospace",color:gs.myPitchCount>=PITCH_WARNING?"#f87171":"#f5c842"}}>{gs.myPitchCount}</span>球</div>
              <div style={{fontSize:9,color:"#374151",marginBottom:3}}>疲労度</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div className="fat-bar" style={{flex:1}}>
                  <div className="fat-fill" style={{width:`${fatigue}%`,background:fatigueColor}}/>
                </div>
                <span style={{fontFamily:"monospace",fontSize:10,color:fatigueColor,width:28}}>{fatigue}%</span>
              </div>
              <div style={{marginTop:6,fontSize:9,color:"#374151"}}>球速<OV v={curPitcher?.pitching?.velocity||0}/> 制球<OV v={curPitcher?.pitching?.control||0}/></div>
            </div>
          </div>

          {/* Momentum Bar */}
          <div className="mom-wrap">
            <div className="fsb" style={{fontSize:9,color:"#374151",marginBottom:3}}>
              <span>← {oppTeam.short}</span>
              <span style={{color:gs.momentum>55?"#34d399":gs.momentum<45?"#f87171":"#f5c842",fontWeight:700}}>
                モメンタム {gs.momentum>65?"🔥 圧倒的優勢":gs.momentum>55?"↑優勢":gs.momentum>=45?"互角":gs.momentum>=35?"↓劣勢":"❄️ 劣勢"}
              </span>
              <span>{myTeam.short} →</span>
            </div>
            <div className="mom-bar">
              <div className="mom-fill" style={{width:"100%"}}/>
              <div className="mom-marker" style={{left:`${gs.momentum}%`}}/>
            </div>
          </div>

          {/* Next batter matchup */}
          <div className="card2" style={{marginBottom:10}}>
            <div className="fsb">
              <div>
                <span style={{fontSize:9,color:"#374151",letterSpacing:".15em"}}>次打者vs投手</span>
                <span style={{fontSize:12,fontWeight:700,marginLeft:8}}>{nextBatter?.name||"—"}</span>
              </div>
              <span className={`matchup-badge ${muClass}`}>{muLabel} ({mu>0?"+":""}{mu})</span>
            </div>
            {nextBatter?.batting&&<div style={{display:"flex",gap:10,marginTop:6}}>
              <span style={{fontSize:10}}>ミート<OV v={nextBatter.batting.contact}/></span>
              <span style={{fontSize:10}}>長打<OV v={nextBatter.batting.power}/></span>
              <span style={{fontSize:10}}>選球<OV v={nextBatter.batting.eye}/></span>
            </div>}
          </div>

          {/* Event Log */}
          <div className="evlog" ref={logRef}>
            {gs.log.map((e,i)=>{
              if(e.result==="change") return <div key={i} style={{padding:"3px 8px",fontSize:10,color:"#a78bfa",borderLeft:"3px solid #a78bfa",margin:"4px 0"}}>{e.text}</div>;
              const isInnHdr=false;
              const cls=e.result==="hr"?"evi-hr":IS_HIT(e.result)?"evi-hit":IS_OUT(e.result)?"evi-out":"";
              return(
                <div key={i} className={`evi ${cls}`}>
                  <span style={{color:e.scorer?"#7a4a10":"#1e2d3d",fontSize:9,marginRight:4}}>{e.scorer?"●":"○"}</span>
                  <span style={{fontSize:9,color:"#1e2d3d",marginRight:3}}>{e.inning}{e.isTop?"表":"裏"}</span>
                  <span style={{color:"#374151",fontSize:11,marginRight:5}}>{e.batter}</span>
                  <span>{RLABEL[e.result]||e.result}</span>
                  {e.strategy&&<span style={{fontSize:9,color:"#a78bfa",marginLeft:4}}>[{e.strategy}]</span>}
                  {e.ev>0&&<span style={{fontFamily:"monospace",fontSize:9,color:"#1e2d3d",marginLeft:4}}>EV:{e.ev} LA:{e.la}° {e.dist>0&&`${e.dist}m`}</span>}
                  {e.rbi>0&&<span style={{color:"#f5c842",marginLeft:5,fontSize:11}}>+{e.rbi}点！</span>}
                </div>
              );
            })}
          </div>

          {/* Menus appear above sticky bar */}

          {/* PITCHER CHANGE MENU */}
          {showMenu==="pitcher"&&(
            <div className="card" style={{marginTop:10}}>
              <div className="card-h">投手交代 — ブルペンから選択</div>
              {gs.myBullpen.length===0&&<p style={{color:"#374151",fontSize:12}}>投手がいません</p>}
              {gs.myBullpen.map(p=>{
                const sp=saberPitcher(p.stats);
                return(
                  <div key={p.id} className={`card2 ${selectedRP===p.id?"":""}`} style={{cursor:"pointer",borderColor:selectedRP===p.id?"rgba(245,200,66,.4)":undefined}} onClick={()=>setSelectedRP(p.id)}>
                    <div className="fsb">
                      <div>
                        <span style={{fontWeight:700,fontSize:13}}>{p.name}</span>
                        <HandBadge p={p}/>
                        <span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.subtype} / {p.age}歳</span>
                      </div>
                      <button className="bsm bgy" onClick={()=>changePitcher(p.id)}>この投手に交代</button>
                    </div>
                    <div style={{display:"flex",gap:10,marginTop:5}}>
                      <span style={{fontSize:11}}>球速<OV v={p.pitching.velocity}/></span>
                      <span style={{fontSize:11}}>制球<OV v={p.pitching.control}/></span>
                      <span style={{fontSize:11}}>変化<OV v={p.pitching.breaking}/></span>
                      <span style={{fontSize:10,color:"#374151"}}>防御率:{sp.ERA>0?sp.ERA:"--"}</span>
                    </div>
                    <CondBadge p={p}/>
                  </div>
                );
              })}
              <button className="bsm bgr" style={{marginTop:6}} onClick={()=>setShowMenu(null)}>キャンセル</button>
            </div>
          )}

          {/* PINCH HITTER MENU */}
          {showMenu==="pinch"&&(
            <div className="card" style={{marginTop:10}}>
              <div className="card-h">代打 — ベンチから選択</div>
              <div style={{fontSize:10,color:"#374151",marginBottom:8}}>次打者: <span style={{color:"#f5c842"}}>{nextBatter?.name}</span>（ミート:{nextBatter?.batting?.contact}）と交代</div>
              {gs.myBench.length===0&&<p style={{color:"#374151",fontSize:12}}>ベンチに選手がいません</p>}
              {gs.myBench.map(p=>{
                const mu2=matchupScore(p,gs.isTop?curPitcher:gs.opPitcher);
                const sb=saberBatter(p.stats);
                return(
                  <div key={p.id} className="card2" style={{cursor:"pointer"}} onClick={()=>setSelectedPH(p.id)}>
                    <div className="fsb">
                      <div>
                        <span style={{fontWeight:700,fontSize:13}}>{p.name}</span>
                        <span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.pos} / {p.age}歳</span>
                        
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span className={`matchup-badge ${mu2>15?"mu-adv":mu2>-15?"mu-even":"mu-dis"}`} style={{fontSize:9}}>{mu2>0?"+":""}{mu2}</span>
                        <button className="bsm bga" onClick={()=>sendPinchHitter(p.id)}>代打！</button>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:10,marginTop:5}}>
                      <span style={{fontSize:11}}>ミート<OV v={p.batting.contact}/></span>
                      <span style={{fontSize:11}}>長打<OV v={p.batting.power}/></span>
                      <span style={{fontSize:11}}>選球<OV v={p.batting.eye}/></span>
                      <span style={{fontSize:10,color:"#374151"}}>打率:{fmtAvg(p.stats.H,p.stats.AB)}</span>
                    </div>
                  </div>
                );
              })}
              <button className="bsm bgr" style={{marginTop:6}} onClick={()=>setShowMenu(null)}>キャンセル</button>
            </div>
          )}

          {/* STRATEGY MENU */}
          {showMenu==="strategy"&&(
            <div className="card" style={{marginTop:10}}>
              <div className="card-h">作戦指示</div>
              <div className="strat-grid">
                {STRATEGY_OPTS.map(s=>(
                  <button key={s.id} className={`strat-btn ${selectedStrat===s.id?"sel":""}`} onClick={()=>setSelectedStrat(s.id)}>
                    <div style={{fontSize:14,marginBottom:3}}>{s.icon} {s.label}</div>
                    <div style={{fontSize:10,color:"#374151"}}>{s.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button className="btn btn-gold" style={{flex:1}} onClick={()=>advance(selectedStrat)}>
                  {STRATEGY_OPTS.find(s=>s.id===selectedStrat)?.label}で実行！
                </button>
                <button className="bsm bgr" onClick={()=>setShowMenu(null)}>キャンセル</button>
              </div>
            </div>
          )}
        </div>{/* end LEFT */}

        {/* RIGHT: Info Panel */}
        <div>
          {/* Current inning summary */}
          <div className="card">
            <div className="card-h">得点状況</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {gs.inningSummary.map((s,i)=>(
                <div key={i} style={{textAlign:"center",minWidth:32}}>
                  <div style={{fontSize:8,color:"#1e2d3d"}}>{s.inning}{s.isTop?"表":"裏"}</div>
                  <div style={{fontFamily:"monospace",fontSize:14,color:s.runs>0?(!s.isTop?"#f5c842":"#34d399"):"#1e2d3d"}}>{s.runs}</div>
                </div>
              ))}
              {gs.inningSummary.length===0&&<span style={{color:"#1e2d3d",fontSize:11}}>試合開始前</span>}
            </div>
            <div className="divider"/>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"#374151",marginBottom:3}}>自チーム</div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:26,color:"#f5c842"}}>{gs.score.my}</div>
              </div>
              <div style={{alignSelf:"center",color:"#1e2d3d",fontSize:18}}>—</div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"#374151",marginBottom:3}}>相手</div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:26,color:"#94a3b8"}}>{gs.score.opp}</div>
              </div>
            </div>
          </div>

          {/* 得点圏サマリー */}
          <div className="card">
            <div className="card-h">得点圏状況</div>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
              <div className="diamond" style={{width:60,height:60}}>
                <div className="base bH" style={{width:10,height:10}}/><div className={`base b1 ${gs.bases[0]?"on":""}`} style={{width:10,height:10}}/><div className={`base b2 ${gs.bases[1]?"on":""}`} style={{width:10,height:10}}/><div className={`base b3 ${gs.bases[2]?"on":""}`} style={{width:10,height:10}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#374151"}}>{gs.bases.filter(Boolean).length>0?`${gs.bases.filter(Boolean).length}人の走者あり`:"走者なし"}</div>
                {(gs.bases[1]||gs.bases[2])&&<div style={{fontSize:10,color:"#f5c842",marginTop:2}}>🔥 得点圏にランナー</div>}
                <div style={{fontSize:10,color:"#374151",marginTop:2}}>{gs.outs}アウト</div>
              </div>
            </div>
          </div>

          {/* Bench remaining */}
          <div className="card">
            <div className="card-h">ベンチ残り ({gs.myBench.length}人)</div>
            {gs.myBench.length===0&&<p style={{color:"#1e2d3d",fontSize:11}}>なし</p>}
            {gs.myBench.slice(0,6).map(p=>(
              <div key={p.id} className="bench-item">
                <span style={{fontSize:11,flex:1}}>{p.name}</span>
                <span style={{fontSize:9,color:"#374151"}}>{p.pos}</span>
                <OV v={Math.round((p.batting.contact+p.batting.power)/2)}/>
              </div>
            ))}
            <div className="divider"/>
            <div style={{fontSize:9,color:"#374151",marginBottom:4}}>ブルペン ({gs.myBullpen.length}人)</div>
            {gs.myBullpen.slice(0,4).map(p=>(
              <div key={p.id} className="bench-item">
                <span style={{fontSize:11,flex:1}}>{p.name}<HandBadge p={p}/></span>
                <span style={{fontSize:9,color:"#374151"}}>{p.subtype}</span>
                <OV v={p.pitching.velocity}/>
              </div>
            ))}
          </div>

          {/* Opponent pitcher */}
          <div className="card">
            <div className="card-h">相手投手</div>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{gs.opPitcher?.name||"—"}<HandBadge p={gs.opPitcher}/></div>
            <div style={{display:"flex",gap:8,marginBottom:6}}>
              <span style={{fontSize:11}}>球速<OV v={gs.opPitcher?.pitching?.velocity||0}/></span>
              <span style={{fontSize:11}}>制球<OV v={gs.opPitcher?.pitching?.control||0}/></span>
              <span style={{fontSize:11}}>変化<OV v={gs.opPitcher?.pitching?.breaking||0}/></span>
            </div>
            <div style={{fontSize:10,color:"#374151"}}>球数: <span style={{color:"#94a3b8",fontFamily:"monospace"}}>{gs.opPitchCount}球</span></div>
            <div style={{fontSize:9,color:"#374151",marginTop:3}}>疲労</div>
            <div className="fat-bar" style={{marginTop:3}}>
              <div className="fat-fill" style={{width:`${calcFatigue(gs.opPitchCount,gs.opPitcher?.pitching?.stamina||60)}%`,background:"#f87171"}}/>
            </div>
          </div>
        </div>
      </div>
      {/* STICKY CONTROL BAR - always visible at bottom */}
      <div className="ctrl-bar">
        {!gs.stopped&&!gs.gameOver&&(
          <>
            <button className="btn btn-green" onClick={()=>setAutoRunning(a=>!a)}>
              {autoRunning?"⏸ 一時停止":"▶ 自動進行"}
            </button>
            {!autoRunning&&<button className="btn btn-gold" onClick={()=>advance("normal")}>▶▶ 1打席進む</button>}
          </>
        )}
        {gs.stopped&&!gs.gameOver&&(
          <>
            <button className="btn btn-green" onClick={resume}>▶ 続行</button>
            <button className="btn btn-gold" onClick={()=>setShowMenu(m=>m==="pitcher"?null:"pitcher")} disabled={gs.myBullpen.length===0} style={{opacity:gs.myBullpen.length===0?0.4:1}}>🔄 投手交代</button>
            <button className="btn" style={{background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.2)",color:"#60a5fa",opacity:gs.isTop||gs.myBench.length===0?0.4:1}} onClick={()=>setShowMenu(m=>m==="pinch"?null:"pinch")} disabled={gs.isTop||gs.myBench.length===0}>👤 代打</button>
            <button className="btn" style={{background:"rgba(167,139,250,.1)",border:"1px solid rgba(167,139,250,.2)",color:"#a78bfa"}} onClick={()=>setShowMenu(m=>m==="strategy"?null:"strategy")}>🎯 作戦</button>
          </>
        )}
        {gs.gameOver&&(
          <button className="btn btn-gold" style={{width:"100%"}} onClick={()=>onGameEnd(gs)}>試合終了 → 結果へ ✓</button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BATCH RESULT SCREEN
═══════════════════════════════════════════════ */


/* ═══ components/BatchResult.jsx ═══ */


function BatchResultScreen({results,myTeam,onEnd}){
  const [sel,setSel]=useState(null);
  const wins=results.filter(r=>r.won).length;
  const losses=results.length-wins;

  const selGame=sel!=null?results[sel]:null;
  // Build inning scores for selected game
  const inningScores={};
  if(selGame){
    (selGame.inningSummary||[]).forEach(s=>{
      if(!inningScores[s.inning]) inningScores[s.inning]={top:"-",bot:"-"};
      if(s.isTop) inningScores[s.inning].top=s.runs;
      else inningScores[s.inning].bot=s.runs;
    });
  }
  const innings=selGame?Array.from({length:Math.max(9,(selGame.inningSummary||[]).reduce((m,s)=>Math.max(m,s.inning),9))},(_,i)=>i+1):[];

  return(
    <div className="app">
      <div style={{maxWidth:680,margin:"0 auto",padding:"16px 12px"}}>
        {/* サマリー */}
        <div className="card" style={{textAlign:"center",marginBottom:12}}>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:42,letterSpacing:".1em",color:wins>losses?"#f5c842":wins<losses?"#f87171":"#94a3b8",marginBottom:4}}>
            {wins}勝 {losses}敗
          </div>
          <div style={{fontSize:12,color:"#374151",marginBottom:10}}>第{results[0]?.gameNo}〜{results[results.length-1]?.gameNo}戦 / {results.length}試合</div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
            {results.map((r,i)=>(
              <button key={i} onClick={()=>setSel(sel===i?null:i)}
                className={`bsm ${sel===i?"bgy":r.won?"bga":"bgr"}`}
                style={{minWidth:70,padding:"7px 10px",fontSize:12}}>
                <span style={{fontSize:9,display:"block",color:"inherit",opacity:.7}}>第{r.gameNo}戦</span>
                {r.oppTeam?.short} {r.score.my}-{r.score.opp}
                <span style={{marginLeft:4}}>{r.won?"✓":"✗"}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 選択した試合のスコアボード */}
        {selGame&&(
          <div className="card" style={{marginBottom:12,animation:"fi .2s"}}>
            <div className="card-h">第{selGame.gameNo}戦 詳細 — vs {selGame.oppTeam?.name}</div>
            <div style={{overflowX:"auto",marginBottom:10}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"'Share Tech Mono',monospace",fontSize:11,whiteSpace:"nowrap"}}>
                <thead><tr>
                  <td style={{padding:"4px 8px",color:"#374151",fontSize:9,minWidth:80}}>チーム</td>
                  {innings.map(i=><td key={i} style={{textAlign:"center",padding:"4px 6px",color:"#374151",fontSize:9}}>{i}</td>)}
                  <td style={{textAlign:"center",padding:"4px 8px",fontWeight:700,borderLeft:"2px solid rgba(255,255,255,.06)",fontSize:14}}>R</td>
                </tr></thead>
                <tbody>
                  <tr>
                    <td style={{padding:"5px 8px"}}><span style={{color:selGame.oppTeam?.color}}>{selGame.oppTeam?.emoji} {selGame.oppTeam?.short}</span></td>
                    {innings.map(i=><td key={i} style={{textAlign:"center",color:inningScores[i]?.top>0?"#34d399":"#1e2d3d"}}>{inningScores[i]?.top??"-"}</td>)}
                    <td style={{textAlign:"center",borderLeft:"2px solid rgba(255,255,255,.06)",fontSize:16}}>{selGame.score.opp}</td>
                  </tr>
                  <tr>
                    <td style={{padding:"5px 8px"}}><span style={{color:myTeam?.color}}>{myTeam?.emoji} {myTeam?.short}</span></td>
                    {innings.map(i=><td key={i} style={{textAlign:"center",color:inningScores[i]?.bot>0?"#f5c842":"#1e2d3d"}}>{inningScores[i]?.bot??"-"}</td>)}
                    <td style={{textAlign:"center",borderLeft:"2px solid rgba(255,255,255,.06)",fontSize:16,color:"#f5c842",fontWeight:700}}>{selGame.score.my}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* ハイライト打席 */}
            <div style={{fontSize:10,color:"#374151",marginBottom:6,letterSpacing:".15em"}}>ハイライト</div>
            <div style={{background:"rgba(0,0,0,.3)",borderRadius:6,padding:8,maxHeight:140,overflowY:"auto"}}>
              {(selGame.log||[]).filter(e=>IS_HIT(e.result)||e.result==="hr").slice(0,12).map((e,i)=>(
                <div key={i} style={{padding:"2px 6px",fontSize:11,color:e.result==="hr"?"#f5c842":e.scorer?"#34d399":"#94a3b8",marginBottom:1}}>
                  <span style={{fontSize:9,color:"#1e2d3d",marginRight:4}}>{e.inning}{e.isTop?"表":"裏"}</span>
                  {e.batter} {RLABEL[e.result]}
                  {e.rbi>0&&<span style={{color:"#f5c842",marginLeft:4}}>+{e.rbi}点</span>}
                  {e.ev>0&&<span style={{fontSize:9,color:"#1e2d3d",marginLeft:4}}>{e.ev}km/h {e.dist>0&&`${e.dist}m`}</span>}
                </div>
              ))}
              {(selGame.log||[]).filter(e=>IS_HIT(e.result)).length===0&&<div style={{color:"#1e2d3d",fontSize:11}}>ヒットなし</div>}
            </div>
          </div>
        )}

        <button className="sim-btn" onClick={onEnd}>ハブに戻る →</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MODE SELECT SCREEN
═══════════════════════════════════════════════ */


/* ═══ components/Screens.jsx ═══ */


function ModeSelectScreen({myTeam,oppTeam,onSelect,onBack}){
  return(
    <div className="app">
      <div className="mode-wrap">
        <div style={{marginBottom:6,fontSize:11,color:"#374151",letterSpacing:".2em"}}>第{" "}戦</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:36,color:"#f5c842",letterSpacing:".1em",marginBottom:4}}>
          vs {oppTeam?.name}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
          <span style={{fontSize:22}}>{myTeam?.emoji}</span>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:16,color:"#374151"}}>vs</span>
          <span style={{fontSize:22}}>{oppTeam?.emoji}</span>
        </div>

        <div className="mode-card tactical" onClick={()=>onSelect("tactical")}>
          <div style={{fontSize:42,marginBottom:10}}>🎮</div>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f5c842",letterSpacing:".1em",marginBottom:6}}>
            采配モード
          </div>
          <div style={{fontSize:12,color:"#4b5563",lineHeight:1.6}}>
            重要局面で自動停止。<br/>
            投手交代・代打・作戦を自分で指示。<br/>
            <span style={{color:"#f5c842",fontSize:11}}>★ じっくり遊びたい人向け</span>
          </div>
        </div>

        <div className="mode-card auto" onClick={()=>onSelect("auto")}>
          <div style={{fontSize:42,marginBottom:10}}>⚡</div>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#34d399",letterSpacing:".1em",marginBottom:6}}>
            オートシムモード
          </div>
          <div style={{fontSize:12,color:"#4b5563",lineHeight:1.6}}>
            試合を自動で進めて結果だけ確認。<br/>
            すばやくシーズンを進めたい時に。<br/>
            <span style={{color:"#34d399",fontSize:11}}>★ サクサク進めたい人向け</span>
          </div>
        </div>

        <button onClick={onBack} style={{background:"transparent",border:"none",color:"#374151",cursor:"pointer",fontSize:12,marginTop:4}}>
          ← ハブに戻る
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROSTER TAB (simplified for space)
═══════════════════════════════════════════════ */

function ResultScreen({gsResult,myTeam,oppTeam,gameDay,onNext}){
  const won=gsResult.score.my>gsResult.score.opp;
  return(
    <div className="app">
      <div className="rw">
        <div style={{color:"#1e2d3d",letterSpacing:".2em",fontSize:11,marginBottom:8}}>第{gameDay}戦 vs {oppTeam.name}</div>
        <div className={`rtitle ${won?"rwin":"rlose"}`}>{won?"勝利！！":"敗北..."}</div>
        <div className="rscore" style={{color:won?"#f5c842":"#374151"}}>{myTeam.short} {gsResult.score.my} – {gsResult.score.opp} {oppTeam.short}</div>
        <div style={{color:"#374151",fontSize:12,marginBottom:28}}>通算 {myTeam.wins}勝 {myTeam.losses}敗</div>
        <button className="btn btn-gold" onClick={onNext}>次の試合へ →</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SEASON END
═══════════════════════════════════════════════ */




function SeasonEndScreen({teams,myId,year,onToDraft}){
  const myLeague=teams.find(t=>t.id===myId)?.league;
  const sorted=[...teams.filter(t=>t.league===myLeague)].sort((a,b)=>b.wins-a.wins);
  const me=teams.find(t=>t.id===myId);
  const myRank=sorted.findIndex(t=>t.id===myId)+1;
  const isChamp=myRank===1;
  return(
    <div className="app">
      <div style={{maxWidth:580,margin:"0 auto",padding:"40px 20px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:10}}>{isChamp?"🏆":"📋"}</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:52,color:isChamp?"#f5c842":"#94a3b8",letterSpacing:".1em"}}>{isChamp?`${year}年 優勝！`:`${year}年 終了`}</div>
        <p style={{color:"#4b5563",margin:"10px 0 20px"}}>{me?.name} — {myRank}位 {me?.wins}勝{me?.losses}敗</p>
        <div className="card" style={{textAlign:"left",marginBottom:20}}>
          {sorted.map((t,i)=>(
            <div key={t.id} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.04)",background:t.id===myId?"rgba(245,200,66,.04)":undefined}}>
              <div><span className="mono" style={{color:i===0?"#ffd700":i===1?"#94a3b8":i===2?"#b45309":"#1e2d3d",marginRight:10}}>{i+1}</span><span style={{color:t.color,marginRight:6}}>{t.emoji}</span><span style={{fontWeight:t.id===myId?700:400,color:t.id===myId?"#f5c842":undefined}}>{t.name}</span></div>
              <span className="mono"><span style={{color:"#34d399"}}>{t.wins}</span><span style={{color:"#374151"}}>/</span><span style={{color:"#f87171"}}>{t.losses}</span></span>
            </div>
          ))}
        </div>
        <button className="btn btn-gold" style={{padding:"12px 36px"}} onClick={onToDraft}>⚾ ドラフト会議へ →</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   STATS APPLY HELPER
   log の全打席を正確に選手statsへ反映する
═══════════════════════════════════════════════ */

function RetirePhaseScreen({teams,myId,year,onNext}){
  const myTeam=teams.find(t=>t.id===myId);
  const [results,setResults]=useState({}); // {pid: "retained"|"retain_failed"|"accepted"}
  const candidates=myTeam.players.filter(p=>p.age>=35&&!p.isRetired);
  const rsLabel=(rs)=>rs===undefined?"---":rs>=70?"潔い引退型":rs<=30?"燃え尽き型":"普通型";
  const willLabel=(w)=>w>=70?"引退意欲：高":w>=40?"引退意欲：中":"引退意欲：低";

  const handleRetain=(p)=>{
    const success=Math.random()*100>(p.retireStyle||50);
    setResults(prev=>({...prev,[p.id]:success?"retained":"retain_failed"}));
  };
  const handleAccept=(p)=>{
    setResults(prev=>({...prev,[p.id]:"accepted"}));
  };

  const needsAction=candidates.filter(p=>calcRetireWill(p)>=30);
  const allDone=needsAction.every(p=>results[p.id]);

  // onNextに引退確定選手のIDセットを渡す
  const handleNext=()=>{
    const decisions={};
    Object.entries(results).forEach(function(e){decisions[e[0]]=e[1];});
    onNext(decisions);
  };

  return(
    <div className="app">
      <div style={{padding:"16px 14px 0"}}>
        <div style={{fontSize:11,color:"#94a3b8",letterSpacing:".1em",marginBottom:4}}>OFFSEASON</div>
        <div style={{fontSize:20,fontWeight:700,color:"#f5c842",marginBottom:16}}>⚾ 引退フェーズ — {year}年</div>
        {candidates.length===0&&(
          <div className="card" style={{textAlign:"center",padding:"32px 16px"}}>
            <div style={{fontSize:32,marginBottom:8}}>✅</div>
            <div style={{fontSize:13,color:"#94a3b8"}}>引退候補の選手はいません</div>
            <button className="btn btn-gold" style={{marginTop:16,padding:"10px 32px"}} onClick={()=>onNext({})}>次へ（戦力外フェーズ）→</button>
          </div>
        )}
        {candidates.map(p=>{
          const will=calcRetireWill(p);
          const res=results[p.id];
          const willColor=will>=70?"#f87171":will>=40?"#f5c842":"#34d399";
          return(
            <div key={p.id} className="card" style={{marginBottom:10}}>
              <div className="fsb" style={{marginBottom:4}}>
                <div>
                  <span style={{fontWeight:700,fontSize:14}}>{p.name}</span>
                  <span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>{p.age}歳 / {p.pos}</span>
                </div>
                <span style={{fontSize:10,color:"#a78bfa"}}>{rsLabel(p.retireStyle)}</span>
              </div>
              <div style={{fontSize:10,color:willColor,marginBottom:8}}>{willLabel(will)}</div>
              {will>=30&&!res&&(
                <div style={{display:"flex",gap:6}}>
                  <button className="bsm btn-gold" style={{flex:1,padding:"7px 0"}} onClick={()=>handleRetain(p)}>引き留める</button>
                  <button className="bsm bgr" style={{flex:1,padding:"7px 0"}} onClick={()=>handleAccept(p)}>引退を受け入れる</button>
                </div>
              )}
              {res==="retained"&&(
                <div style={{padding:"8px 10px",background:"rgba(52,211,153,.08)",borderRadius:6,fontSize:11,color:"#34d399"}}>
                  ✅ 引き留め成功！来季も続投します
                </div>
              )}
              {res==="retain_failed"&&(
                <div style={{padding:"8px 10px",background:"rgba(248,113,113,.08)",borderRadius:6,fontSize:11,color:"#f87171"}}>
                  ❌ 引き留め失敗…引退を決意しました
                </div>
              )}
              {res==="accepted"&&(
                <div style={{padding:"8px 10px",background:"rgba(148,163,184,.08)",borderRadius:6,fontSize:11,color:"#94a3b8"}}>
                  👋 引退を受け入れました。お疲れ様でした
                </div>
              )}
              {will<30&&(
                <div style={{fontSize:10,color:"#34d399"}}>現役続行意欲あり — 対応不要</div>
              )}
            </div>
          );
        })}
        {candidates.length>0&&(
          <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",marginTop:8,opacity:allDone?1:0.5}} onClick={()=>{if(allDone)handleNext();}}>
            戦力外フェーズへ →
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   WAIVER PHASE SCREEN
═══════════════════════════════════════════════ */

function WaiverPhaseScreen({teams,myId,year,onRelease,onNext}){
  const myTeam=teams.find(t=>t.id===myId);
  const [marked,setMarked]=useState([]);
  const toggle=(pid)=>setMarked(prev=>prev.includes(pid)?prev.filter(x=>x!==pid):[...prev,pid]);
  const candidates=myTeam.players.filter(p=>p.contractYearsLeft===0&&!p.isRetired);
  const others=myTeam.players.filter(p=>p.contractYearsLeft>0&&!p.isRetired);
  return(
    <div className="app">
      <div style={{padding:"16px 14px 0"}}>
        <div style={{fontSize:11,color:"#94a3b8",letterSpacing:".1em",marginBottom:4}}>OFFSEASON</div>
        <div style={{fontSize:20,fontWeight:700,color:"#f5c842",marginBottom:4}}>✂️ 戦力外フェーズ — {year}年</div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:16}}>契約満了選手の処遇を決定してください</div>
        <div className="card" style={{marginBottom:10}}>
          <div className="card-h">契約満了選手（{candidates.length}人）</div>
          {candidates.length===0&&<div style={{fontSize:11,color:"#374151"}}>対象選手なし</div>}
          {candidates.map(p=>(
            <div key={p.id} className="fsb" style={{padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
              <div>
                <span style={{fontSize:12,fontWeight:700}}>{p.name}</span>
                <span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos} / {p.age}歳</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontSize:10,color:"#f5c842"}}>{fmtSal(p.salary)}/年</span>
                <button className={"bsm "+(marked.includes(p.id)?"bgr":"bga")} onClick={()=>toggle(p.id)}>
                  {marked.includes(p.id)?"✓ 戦力外":"戦力外"}
                </button>
              </div>
            </div>
          ))}
        </div>
        {marked.length>0&&(
          <div className="card" style={{marginBottom:10,background:"rgba(248,113,113,.06)"}}>
            <div style={{fontSize:11,color:"#f87171",marginBottom:6}}>⚠️ 戦力外通告 {marked.length}人</div>
            {marked.map(pid=>{const p=myTeam.players.find(x=>x.id===pid);return p?(
              <div key={pid} style={{fontSize:11,color:"#94a3b8",padding:"2px 0"}}>{p.name}（{p.pos}/{p.age}歳）</div>
            ):null;})}
          </div>
        )}
        <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",marginTop:8}} onClick={()=>onNext(marked)}>
          ドラフトへ →
        </button>
      </div>
    </div>
  );
}



/* ═══ components/RetireModal.jsx ═══ */

function RetireModal({modal,onRetain,onAccept,retireRole,setRetireRole,onStartRetireGame,onSkipRetireGame}){
  if(!modal) return null;
  const p=modal.player;
  const rsLabel=p.retireStyle===undefined?"---":p.retireStyle>=70?"潔い引退型":p.retireStyle<=30?"燃え尽き型":"普通型";
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px"}}>
      <div style={{background:"#1a2233",borderRadius:12,padding:24,width:"100%",maxWidth:380,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
        <div style={{fontSize:13,color:"#f5c842",fontWeight:700,marginBottom:4}}>⚾ 引退表明</div>
        <div style={{fontSize:16,fontWeight:700,color:"#e0d4bf",marginBottom:8}}>{p.name} <span style={{fontSize:11,color:"#94a3b8"}}>{p.age}歳 / {p.pos}</span></div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:16,lineHeight:1.7}}>
          引退に関する価値観：<span style={{color:"#a78bfa"}}>{rsLabel}</span><br/>
          {p.name}選手が今季限りでの引退を示唆しています。
        </div>
        {modal.type==="announce"&&(
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:10}}>どうしますか？</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <button className="bsm btn-gold" style={{flex:1,padding:"8px 0"}} onClick={onRetain}>引き留める</button>
              <button className="bsm bgr" style={{flex:1,padding:"8px 0"}} onClick={onAccept}>受け入れる</button>
            </div>
          </div>
        )}
        {modal.type==="retire_game"&&(
          <div>
            <div style={{fontSize:11,color:"#f5c842",fontWeight:700,marginBottom:8}}>引退試合の起用法を選んでください</div>
            {["starter","reliever","pinch","runner"].map(role=>{
              const labels={starter:"先発",reliever:"リリーフ",pinch:"代打",runner:"代走"};
              return(
                <button key={role} className={"bsm "+(retireRole===role?"btn-gold":"bga")} style={{display:"block",width:"100%",marginBottom:6,padding:"7px 0",textAlign:"center"}} onClick={()=>setRetireRole(role)}>
                  {labels[role]}
                </button>
              );
            })}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button className="bsm bgg" style={{flex:1,padding:"8px 0"}} onClick={onStartRetireGame} disabled={!retireRole}>引退試合を行う 🎉</button>
              <button className="bsm bga" style={{flex:1,padding:"8px 0"}} onClick={onSkipRetireGame}>行わない</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   RETIRE PHASE SCREEN
═══════════════════════════════════════════════ */


/* ═══ components/Tabs.jsx ═══ */



function RosterTab({team,onToggle,onSetStarter,onPromo,onDemo}){
  const [view,setView]=useState("batters");
  const batters=team.players.filter(p=>!p.isPitcher);
  const pitchers=team.players.filter(p=>p.isPitcher);
  const liMap={};team.lineup.forEach((id,i)=>liMap[id]=i+1);
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["batters","🏏 野手"],["pitchers","⚾ 投手"],["farm","🌿 二軍"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} className={`tab ${view===k?"on":""}`} style={{flex:0,padding:"6px 14px"}}>{l}</button>
        ))}
        <span className="chip cy" style={{marginLeft:"auto",alignSelf:"center"}}>一軍 {team.players.length}/{MAX_ROSTER}</span>
      </div>
      {view==="batters"&&(
        <div className="card">
          <div className="card-h">打線設定 ({team.lineup.length}/9)</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>#</th><th>選手名</th><th>守備</th><th>年齢</th><th>ミート</th><th>長打</th><th>走力</th><th>選球</th><th>クラッチ</th><th>変化球</th><th>状態</th><th>打率</th><th>HR</th><th>OPS</th><th></th></tr></thead>
              <tbody>
                {batters.map(p=>{const inL=team.lineup.includes(p.id);const sb=saberBatter(p.stats);return(
                  <tr key={p.id}>
                    <td>{inL?<span className="lnb">{liMap[p.id]}</span>:<span style={{color:"#1e2d3d"}}>—</span>}</td>
                    <td style={{fontWeight:inL?700:400,color:inL?"#e0d4bf":"#374151"}}>{p.name}{p.isForeign&&<span className="chip cb" style={{marginLeft:4,fontSize:8}}>外</span>}</td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.pos}</td><td className="mono" style={{color:"#374151"}}>{p.age}</td>
                    <td><OV v={p.batting.contact}/></td><td><OV v={p.batting.power}/></td><td><OV v={p.batting.speed}/></td><td><OV v={p.batting.eye}/></td>
                    <td><OV v={p.batting.clutch}/></td><td><OV v={p.batting.breakingBall}/></td>
                    <td><CondBadge p={p}/></td>
                    <td className="mono">{fmtAvg(p.stats.H,p.stats.AB)}</td>
                    <td className="mono" style={{color:p.stats.HR>=20?"#f5c842":undefined}}>{p.stats.HR}</td>
                    <td className="mono" style={{color:sb.OPS>=.850?"#34d399":sb.OPS>=.700?"#f5c842":undefined}}>{sb.OPS>0?sb.OPS.toFixed(3):"---"}</td>
                    <td><button className={`bsm ${inL?"bgr":"bga"}`} onClick={()=>onToggle(p.id)}>{inL?"外す":"入れる"}</button> <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓</button></td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="pitchers"&&(
        <div className="card">
          <div className="card-h">投手陣</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th></th><th>選手名</th><th>役割</th><th>年齢</th><th>球速</th><th>制球</th><th>スタミナ</th><th>変化球</th><th>球種</th><th>ピンチ</th><th>状態</th><th>防御率</th><th>WHIP</th><th>勝</th><th>敗</th><th></th></tr></thead>
              <tbody>
                {pitchers.map(p=>{const inR=team.rotation.includes(p.id);const sp=saberPitcher(p.stats);return(
                  <tr key={p.id}>
                    <td>{inR&&<span style={{fontSize:9,color:"#f5c842",background:"rgba(245,200,66,.1)",padding:"1px 5px",borderRadius:3}}>先発</span>}</td>
                    <td style={{fontWeight:700,fontSize:12}}>{p.name}<HandBadge p={p}/></td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.subtype}</td><td className="mono" style={{color:"#374151"}}>{p.age}</td>
                    <td><OV v={p.pitching.velocity}/></td><td><OV v={p.pitching.control}/></td><td><OV v={p.pitching.stamina}/></td><td><OV v={p.pitching.breaking}/></td>
                    <td><OV v={p.pitching.variety}/></td><td><OV v={p.pitching.clutchP}/></td>
                    <td><CondBadge p={p}/></td>
                    <td className="mono" style={{color:sp.ERA>0&&sp.ERA<3?"#34d399":sp.ERA<4?"#f5c842":sp.ERA>0?"#f87171":undefined}}>{sp.ERA>0?sp.ERA:"---"}</td>
                    <td className="mono" style={{color:sp.WHIP>0&&sp.WHIP<1.0?"#34d399":sp.WHIP<1.3?"#f5c842":sp.WHIP>0?"#94a3b8":"#f87171"}}>{sp.WHIP>0?sp.WHIP:"---"}</td>
                    <td className="mono" style={{color:"#34d399"}}>{p.stats.W}</td><td className="mono" style={{color:"#f87171"}}>{p.stats.L}</td>
                    <td><button className="bsm bgb" onClick={()=>onSetStarter(p.id)}>先発へ</button> <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓</button></td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="farm"&&(
        <div className="card">
          <div className="card-h">二軍 ({team.farm.length}/{MAX_FARM})</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>選手名</th><th>守備</th><th>年齢</th><th>潜在</th><th>主要能力</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {team.farm.map(p=>(
                  <tr key={p.id}>
                    <td style={{fontWeight:600,fontSize:12}}>{p.name}{p.育成&&<span style={{fontSize:9,color:"#a78bfa",marginLeft:4}}>[育]</span>}</td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.pos}</td><td className="mono" style={{color:"#374151"}}>{p.age}</td><td><OV v={p.potential}/></td>
                    <td><OV v={p.isPitcher?p.pitching.velocity:p.batting.contact}/></td>
                    <td><CondBadge p={p}/></td>
                    <td>{!p.育成&&<button className="bsm bga" onClick={()=>onPromo(p.id)}>↑一軍</button>}</td>
                  </tr>
                ))}
                {team.farm.length===0&&<tr><td colSpan={7} style={{color:"#1e2d3d",padding:"16px",textAlign:"center"}}>二軍選手なし</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TOOLTIP COMPONENT
═══════════════════════════════════════════════ */


function StandingsTab({teams,myId}){
  const myLeague=teams.find(t=>t.id===myId)?.league;
  const [lg,setLg]=useState(myLeague||"セ");
  const sorted=[...teams.filter(t=>t.league===lg)].sort((a,b)=>{const pa=a.wins/Math.max(1,a.wins+a.losses),pb=b.wins/Math.max(1,b.wins+b.losses);return pb-pa||(b.rf-b.ra)-(a.rf-a.ra);});
  const top=sorted[0];
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:10}}>{["セ","パ"].map(l=><button key={l} onClick={()=>setLg(l)} className={`tab ${lg===l?"on":""}`} style={{flex:0,padding:"6px 18px"}}>{l}リーグ</button>)}</div>
      <div className="card"><div style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead><tr><th>順位</th><th>チーム</th><th>試合</th><th style={{color:"#34d399"}}>勝</th><th style={{color:"#f87171"}}>敗</th><th>勝率</th><th>G差</th><th>得点</th><th>失点</th><th>得失差</th></tr></thead>
          <tbody>{sorted.map((t,i)=>{
            const g=t.wins+t.losses+t.draws;
            const gb=i===0?"—":(((top.wins-t.wins)+(t.losses-top.losses))/2).toFixed(1);
            const isMe=t.id===myId;
            return(<tr key={t.id} style={{background:isMe?"rgba(245,200,66,.04)":undefined}}>
              <td><span className="mono" style={{color:i===0?"#ffd700":i===1?"#94a3b8":i===2?"#b45309":"#1e2d3d",fontWeight:700,fontSize:15}}>{i+1}</span></td>
              <td><span style={{color:t.color,marginRight:5}}>{t.emoji}</span><span style={{fontWeight:isMe?700:400,color:isMe?"#f5c842":undefined}}>{t.name}{isMe&&" ★"}</span></td>
              <td className="mono">{g}</td><td className="mono" style={{color:"#34d399"}}>{t.wins}</td><td className="mono" style={{color:"#f87171"}}>{t.losses}</td>
              <td className="mono">{t.wins+t.losses>0?"."+String(Math.round(t.wins/(t.wins+t.losses)*1000)).padStart(3,"0"):"---"}</td>
              <td className="mono" style={{color:"#374151"}}>{gb}</td>
              <td className="mono">{t.rf}</td><td className="mono">{t.ra}</td>
              <td className="mono" style={{color:(t.rf-t.ra)>0?"#34d399":(t.rf-t.ra)<0?"#f87171":"#374151"}}>{(t.rf-t.ra)>0?"+":""}{t.rf-t.ra}</td>
            </tr>);
          })}</tbody>
        </table>
      </div></div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CONTRACT TAB
═══════════════════════════════════════════════ */
/* ═══ TRADE SYSTEM ═══ */

function StatsTab({teams,myId}){
  const [view,setView]=useState("batter");
  const [selId,setSelId]=useState(null);
  const [openTip,setOpenTip]=useState(null);
  const myTeam=teams.find(t=>t.id===myId);
  const batters=myTeam.players.filter(p=>!p.isPitcher);
  const pitchers=myTeam.players.filter(p=>p.isPitcher);
  const sel=myTeam.players.find(p=>p.id===selId);
  const radar=sel?(sel.isPitcher?[
    {s:"球速",v:sel.pitching.velocity},
    {s:"制球",v:sel.pitching.control},
    {s:"変化球",v:sel.pitching.breaking},
    {s:"球種",v:sel.pitching.variety},
    {s:"ピンチ",v:sel.pitching.clutchP},
    {s:"スタミナ",v:sel.pitching.stamina},
  ]:[
    {s:"ミート",v:sel.batting.contact},
    {s:"長打",v:sel.batting.power},
    {s:"走力",v:sel.batting.speed},
    {s:"選球",v:sel.batting.eye},
    {s:"クラッチ",v:sel.batting.clutch},
    {s:"変化球",v:sel.batting.breakingBall},
  ]):[];
  return(
    <div>
      <div className="tabs">
        {[["batter","🏏 打者"],["pitcher","⚾ 投手"]].map(([k,l])=>(
          <button key={k} onClick={()=>{setSelId(null);setView(k);}} className={`tab ${view===k?"on":""}`}>{l}</button>
        ))}
      </div>
      {sel&&(
        <div className="card" style={{marginBottom:10}}>
          <div className="fsb" style={{marginBottom:8}}>
            <div><span style={{fontWeight:700,fontSize:15}}>{sel.name}</span><span style={{fontSize:11,color:"#374151",marginLeft:8}}>{sel.pos}/{sel.age}歳</span></div>
            <button className="bsm bgr" onClick={()=>setSelId(null)}>✕</button>
          </div>
          <div className="g2">
            <ResponsiveContainer width="100%" height={170}><RadarChart data={radar}><PolarGrid stroke="rgba(255,255,255,.07)"/><PolarAngleAxis dataKey="s" tick={{fill:"#374151",fontSize:10}}/><Radar dataKey="v" stroke="#f5c842" fill="#f5c842" fillOpacity={0.13}/></RadarChart></ResponsiveContainer>
            <div style={{fontSize:11}}>
              {sel.isPitcher?(()=>{const sp=saberPitcher(sel.stats);return[["防御率",sp.ERA],["WHIP",sp.WHIP],["FIP",sp.FIP],["xFIP",sp.xFIP],["三振率",fmtPct(sp.Kpct)],["四球率",fmtPct(sp.BBpct)],["WAR",sp.WAR]].map(([l,v])=><div key={l} className="fsb" style={{padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{color:"#374151"}}>{l}</span><span className="mono" style={{color:"#94a3b8"}}>{v}</span></div>);})():(()=>{const sb=saberBatter(sel.stats);return[["打率",fmtAvg(sel.stats.H,sel.stats.AB)],["OPS",sb.OPS.toFixed(3)],["wOBA",sb.wOBA.toFixed(3)],["wRC+",sb.wRCp],["ISO",sb.ISO.toFixed(3)],["四球率",fmtPct(sb.BBpct)],["三振率",fmtPct(sb.Kpct)],["打球速度",sb.EVavg>0?sb.EVavg+"km/h":"---"],["WAR",sb.WAR]].map(([l,v])=><div key={l} className="fsb" style={{padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{color:"#374151"}}>{l}</span><span className="mono" style={{color:"#94a3b8"}}>{v}</span></div>);})()}
            </div>
          </div>
          <CareerTable player={sel}/>
        </div>
      )}
      {view==="batter"&&(
        <div className="card">
          <div className="card-h">打者成績 — クリックで詳細</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr>
  <th>選手</th>
  <ThCell label="打席"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="打率"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="OPS"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="wOBA"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="wRC+"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="ISO"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="BABIP" openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="四球率" openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="三振率" openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="打球速度" openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="打球角度" openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="WAR"   openLabel={openTip} onOpen={setOpenTip}/>
  <th>本塁打</th>
  <th>打点</th>
  <th>盗塁</th>
</tr></thead>
              <tbody>
                {batters.sort((a,b)=>saberBatter(b.stats).OPS-saberBatter(a.stats).OPS).map(p=>{const sb=saberBatter(p.stats);return(
                  <tr key={p.id} style={{cursor:"pointer"}} onClick={()=>setSelId(p.id)}>
                    <td style={{fontWeight:700,fontSize:12,color:selId===p.id?"#f5c842":undefined}}>{p.name}</td>
                    <td className="mono">{p.stats.PA}</td>
                    <td className="mono">{fmtAvg(p.stats.H,p.stats.AB)}</td>
                    <td className="mono" style={{color:sb.OPS>=.850?"#34d399":sb.OPS>=.700?"#f5c842":undefined}}>{sb.OPS>0?sb.OPS.toFixed(3):"---"}</td>
                    <td className="mono">{sb.wOBA>0?sb.wOBA.toFixed(3):"---"}</td>
                    <td className="mono" style={{color:sb.wRCp>=130?"#34d399":sb.wRCp>=100?"#f5c842":sb.wRCp>0?"#f87171":undefined}}>{sb.wRCp||"---"}</td>
                    <td className="mono">{sb.ISO>0?sb.ISO.toFixed(3):"---"}</td>
                    <td className="mono">{sb.BABIP>0?sb.BABIP.toFixed(3):"---"}</td>
                    <td className="mono">{sb.BBpct>0?fmtPct(sb.BBpct):"---"}</td>
                    <td className="mono" style={{color:sb.Kpct>0.25?"#f87171":sb.Kpct<0.15?"#34d399":undefined}}>{sb.Kpct>0?fmtPct(sb.Kpct):"---"}</td>
                    <td className="mono" style={{color:sb.EVavg>=145?"#34d399":sb.EVavg>=130?"#f5c842":undefined}}>{sb.EVavg>0?sb.EVavg.toFixed(1):"---"}</td>
                    <td className="mono">{sb.LAavg!==0?sb.LAavg.toFixed(1):"---"}</td>
                    <td className="mono" style={{color:sb.WAR>=4?"#34d399":sb.WAR>=2?"#f5c842":sb.WAR<0?"#f87171":undefined}}>{sb.WAR!==0?sb.WAR:"---"}</td>
                    <td className="mono" style={{color:p.stats.HR>=20?"#f5c842":undefined}}>{p.stats.HR}</td>
                    <td className="mono">{p.stats.RBI}</td>
                    <td className="mono" style={{color:p.stats.SB>=20?"#34d399":undefined}}>{p.stats.SB}{p.stats.CS>0&&<span style={{fontSize:9,color:"#f87171",marginLeft:2}}>({p.stats.CS})</span>}</td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="pitcher"&&(
        <div className="card">
          <div className="card-h">投手成績</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr>
  <th>選手</th>
  <th>役割</th>
  <th>勝</th>
  <th>敗</th>
  <ThCell label="投球回"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="防御率"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="WHIP"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="FIP"    openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="xFIP"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="三振率"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="四球率"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="WAR"    openLabel={openTip} onOpen={setOpenTip}/>
</tr></thead>
              <tbody>
                {pitchers.sort((a,b)=>saberPitcher(a.stats).ERA-saberPitcher(b.stats).ERA).map(p=>{const sp=saberPitcher(p.stats);return(
                  <tr key={p.id} style={{cursor:"pointer"}} onClick={()=>setSelId(p.id)}>
                    <td style={{fontWeight:700,fontSize:12,color:selId===p.id?"#f5c842":undefined}}>{p.name}<HandBadge p={p}/></td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.subtype}</td>
                    <td className="mono" style={{color:"#34d399"}}>{p.stats.W}</td><td className="mono" style={{color:"#f87171"}}>{p.stats.L}</td>
                    <td className="mono">{p.stats.IP>0?fmtIP(p.stats.IP):"---"}</td>
                    <td className="mono" style={{color:sp.WHIP>0&&sp.WHIP<1.0?"#34d399":sp.WHIP<1.3?"#f5c842":sp.WHIP<1.5?"#94a3b8":"#f87171"}}>{sp.WHIP>0?sp.WHIP:"---"}</td>
                    <td className="mono" style={{color:sp.FIP<3?"#34d399":sp.FIP<4?"#f5c842":sp.FIP>0?"#f87171":undefined}}>{sp.FIP>0?sp.FIP:"---"}</td>
                    <td className="mono">{sp.xFIP>0?sp.xFIP:"---"}</td>
                    <td className="mono" style={{color:sp.Kpct>=0.30?"#34d399":undefined}}>{sp.Kpct>0?fmtPct(sp.Kpct):"---"}</td>
                    <td className="mono" style={{color:sp.BBpct<=0.05?"#34d399":sp.BBpct>=0.12?"#f87171":undefined}}>{sp.BBpct>0?fmtPct(sp.BBpct):"---"}</td>
                    <td className="mono" style={{color:sp.WAR>=3?"#34d399":sp.WAR>=1?"#f5c842":sp.WAR<0?"#f87171":undefined}}>{sp.WAR!==0?sp.WAR:"---"}</td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   STANDINGS TAB
═══════════════════════════════════════════════ */

function FinanceTab({team}){
  const rev=calcRevenue(team);
  return(
    <div>
      <div className="g2">
        <div className="card">
          <div className="card-h">収入（試合ごと）</div>
          {[["チケット",fmtM(rev.ticket)],["スポンサー",fmtM(rev.sponsor)],["グッズ",fmtM(rev.merch)]].map(([l,v])=>(
            <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
          ))}
          <div className="fsb" style={{padding:"8px 0",marginTop:4}}><span style={{fontWeight:700}}>合計</span><span className="mono" style={{color:"#34d399",fontSize:14}}>{fmtM(rev.ticket+rev.sponsor+rev.merch)}</span></div>
        </div>
        <div className="card">
          <div className="card-h">支出</div>
          {[["選手年俸",fmtM(team.players.reduce((s,p)=>s+p.salary,0))],["コーチ",fmtM(team.coaches.reduce((s,c)=>s+c.salary,0))]].map(([l,v])=>(
            <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#f87171"}}>{v}</span></div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-h">予算 / 年俸上位</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:24,color:"#60a5fa",marginBottom:12}}>{fmtM(team.budget)}</div>
        {team.players.sort((a,b)=>b.salary-a.salary).slice(0,6).map(p=>(
          <div key={p.id} className="fsb" style={{padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.025)"}}><span style={{fontSize:12}}>{p.name} <span style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.contractYearsLeft}年</span></span><span className="mono" style={{color:"#f5c842"}}>{fmtSal(p.salary)}</span></div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   RESULT SCREEN
═══════════════════════════════════════════════ */

function ContractTab({team,allTeams,onOffer,onRelease}){
  const [selId,setSelId]=useState(null);
  const [offerSal,setOfferSal]=useState(0);
  const [offerYrs,setOfferYrs]=useState(1);
  const expiring=team.players.filter(p=>p.contractYearsLeft<=1);
  const sel=team.players.find(p=>p.id===selId);
  const preview=sel?evalOffer(sel,{salary:offerSal*10000,years:offerYrs},team,allTeams):null;
  const ac=preview?.total>=ACCEPT_THRESHOLD?"#34d399":preview?.total>=40?"#f5c842":"#f87171";
  return(
    <div>
      <div className="card">
        <div className="card-h">契約満了選手 ({expiring.length}人)</div>
        {expiring.length===0&&<p style={{color:"#2a3a4c",fontSize:12}}>今季満了の選手はいません</p>}
        <div style={{overflowX:"auto"}}>{expiring.length>0&&(
          <table className="tbl">
            <thead><tr><th>選手名</th><th>守備</th><th>年齢</th><th>現年俸</th><th>残年数</th><th></th></tr></thead>
            <tbody>{expiring.map(p=>(
              <tr key={p.id} style={{background:selId===p.id?"rgba(245,200,66,.04)":undefined}}>
                <td style={{fontWeight:700,cursor:"pointer",color:selId===p.id?"#f5c842":undefined}} onClick={()=>{setSelId(p.id);setOfferSal(Math.round(p.salary/10000));setOfferYrs(1);}}>{p.name}</td>
                <td style={{fontSize:10,color:"#374151"}}>{p.pos}</td><td className="mono">{p.age}</td>
                <td className="mono">{fmtSal(p.salary)}</td>
                <td className="mono" style={{color:p.contractYearsLeft===0?"#f87171":"#f5c842"}}>{p.contractYearsLeft}年</td>
                <td><button className="bsm bgr" onClick={()=>onRelease(p.id)}>放出</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}</div>
      </div>
      {sel&&(
        <div className="card">
          <div className="card-h">{sel.name} — 契約交渉</div>
          <div className="g2">
            <div><div style={{fontSize:11,color:"#374151",marginBottom:6}}>選手の価値観</div><PersonalityView p={sel}/></div>
            <div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,color:"#4b5563",display:"block",marginBottom:4}}>年俸（万円）</label>
                <input type="number" value={offerSal} onChange={e=>setOfferSal(Number(e.target.value))} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,padding:"6px 10px",color:"#e0d4bf",fontFamily:"'Share Tech Mono',monospace",width:"100%"}}/>
                <div style={{fontSize:10,color:"#374151",marginTop:2}}>現在値: {fmtSal(sel.salary)}</div>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,color:"#4b5563",display:"block",marginBottom:4}}>契約年数</label>
                <div style={{display:"flex",gap:6}}>{[1,2,3,4,5].map(y=><button key={y} className={`bsm ${offerYrs===y?"bgy":"bgb"}`} onClick={()=>setOfferYrs(y)}>{y}年</button>)}</div>
              </div>
              {preview&&(
                <div style={{background:"rgba(0,0,0,.3)",borderRadius:8,padding:10,marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <div className="score-ring" style={{borderColor:ac,color:ac,width:46,height:46,fontSize:16}}>{preview.total}</div>
                    <div style={{fontSize:12,fontWeight:700,color:ac}}>{preview.total>=ACCEPT_THRESHOLD?"✅ 受諾見込み":preview.total>=40?"⚠️ 微妙":"❌ 拒否の可能性大"}</div>
                  </div>
                  {Object.entries(preview.breakdown).map(([k,v])=>{const def=PVAL_DEFS.find(d=>d.k===k);return(<div key={k} style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}><span style={{fontSize:9,color:"#374151",width:80}}>{def?.lbl}</span><div style={{flex:1,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${v.score}%`,background:def?.color||"#60a5fa"}}/></div><span style={{fontFamily:"monospace",fontSize:10,color:"#374151",width:22}}>{v.score}</span><span style={{fontSize:9,color:"#1e2d3d",width:28}}>×{v.weight}</span></div>);})}
                </div>
              )}
              <button className="btn btn-gold" style={{width:"100%"}} onClick={()=>onOffer(sel.id,offerSal*10000,offerYrs)}>オファーを送る</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   FINANCE TAB
═══════════════════════════════════════════════ */

function NewsTab({news,onInterview}){
  const [sel,setSel]=useState(null);
  const [answered,setAnswered]=useState({});
  const icon=t=>t==="game"?"⚾":t==="trade"?"🔄":t==="draft"?"📋":t==="interview"?"🎤":t==="season"?"🏆":"📰";
  const col=t=>t==="game"?"#60a5fa":t==="trade"?"#f97316":t==="draft"?"#a78bfa":t==="interview"?"#f5c842":t==="season"?"#34d399":"#94a3b8";
  const handleAnswer=(newsId,opt)=>{
    onInterview(newsId,opt);
    setAnswered(prev=>({...prev,[newsId]:opt}));
    setSel(prev=>prev?{...prev,_answered:opt}:null);
  };
  return(
    <div style={{display:"grid",gridTemplateColumns:sel?"1fr 1fr":"1fr",gap:8}}>
      <div className="card" style={{padding:"10px"}}>
        <div className="card-h">📰 スポーツニュース</div>
        {news.length===0&&<p style={{fontSize:11,color:"#374151",padding:"12px 0"}}>試合を進めるとニュースが届きます</p>}
        {[...news].sort((a,b)=>b.timestamp-a.timestamp).map(n=>{
          const needsAnswer=n.type==="interview"&&!answered[n.id];
          return(<div key={n.id} onClick={()=>setSel(n)} style={{padding:"8px 10px",marginBottom:4,borderRadius:6,cursor:"pointer",background:sel?.id===n.id?"rgba(245,200,66,.08)":needsAnswer?"rgba(245,200,66,.03)":"rgba(255,255,255,.02)",border:sel?.id===n.id?"1px solid rgba(245,200,66,.3)":needsAnswer?"1px solid rgba(245,200,66,.15)":"1px solid rgba(255,255,255,.04)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
              <span style={{fontSize:11,color:col(n.type)}}>{icon(n.type)}</span>
              {needsAnswer&&<span style={{fontSize:8,background:"#f5c842",color:"#000",borderRadius:4,padding:"1px 5px",fontWeight:700}}>回答待ち</span>}
              <span style={{fontSize:11,fontWeight:needsAnswer?700:400,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.headline}</span>
            </div>
            <div style={{fontSize:9,color:"#374151",paddingLeft:18}}>{n.source} · {n.dateLabel}</div>
          </div>);
        })}
      </div>
      {sel&&(
        <div className="card" style={{padding:"12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:10,color:col(sel.type),fontWeight:700}}>{icon(sel.type)} {sel.source}</span>
            <button className="bsm bga" onClick={()=>setSel(null)}>✕</button>
          </div>
          <div style={{fontWeight:700,fontSize:13,lineHeight:1.5,marginBottom:4}}>{sel.headline}</div>
          <div style={{fontSize:9,color:"#374151",marginBottom:10}}>{sel.dateLabel}</div>
          <div style={{fontSize:12,color:"#e0d4bf",lineHeight:1.8,marginBottom:12,whiteSpace:"pre-wrap"}}>{sel.body}</div>
          {sel.type==="interview"&&!answered[sel.id]&&!sel._answered&&(
            <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:10}}>
              <div style={{fontSize:11,color:"#f5c842",fontWeight:700,marginBottom:8}}>🎤 記者: 「{sel.question}」</div>
              <div style={{fontSize:10,color:"#374151",marginBottom:8}}>あなたの回答を選んでください（球団人気・選手モラルに影響）</div>
              {sel.options.map((opt,i)=>(
                <div key={i} onClick={()=>handleAnswer(sel.id,opt)} style={{padding:"10px",marginBottom:6,borderRadius:6,cursor:"pointer",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
                  <div style={{fontSize:11,color:"#e0d4bf",marginBottom:3}}>{opt.text}</div>
                  <div style={{fontSize:9,color:"#374151"}}>人気 {opt.popMod>=0?"+":""}{opt.popMod} ／ モラル {opt.moraleMod>=0?"+":""}{opt.moraleMod}</div>
                </div>
              ))}
            </div>
          )}
          {(answered[sel.id]||sel._answered)&&sel.type==="interview"&&(
            <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:10}}>
              <div style={{fontSize:10,color:"#374151",marginBottom:4}}>あなたの回答：</div>
              <div style={{fontSize:11,color:"#f5c842",fontStyle:"italic",lineHeight:1.6}}>{(answered[sel.id]||sel._answered)?.text}</div>
              <div style={{fontSize:9,color:"#34d399",marginTop:6}}>人気 {(answered[sel.id]||sel._answered)?.popMod>=0?"+":""}{(answered[sel.id]||sel._answered)?.popMod} ／ モラル {(answered[sel.id]||sel._answered)?.moraleMod>=0?"+":""}{(answered[sel.id]||sel._answered)?.moraleMod}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAILBOX SYSTEM
═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   RETIRE MODAL
═══════════════════════════════════════════════ */

function MailboxTab({mailbox, onRead, onAction, teams, myTeam, onTrade}){
  const [selected, setSelected] = useState(null);
  const unread = mailbox.filter(m=>!m.read).length;

  const handleSelect = (m) => {
    setSelected(m);
    if(!m.read) onRead(m.id);
  };

  const typeIcon = t => t==="trade"?"🔄":t==="info"?"📋":t==="scout"?"🔍":"📨";
  const typeColor = t => t==="trade"?"#f97316":t==="info"?"#60a5fa":t==="scout"?"#a78bfa":"#94a3b8";

  return(
    <div style={{display:"grid", gridTemplateColumns: selected?"1fr 1fr":"1fr", gap:8}}>
      {/* メール一覧 */}
      <div className="card" style={{padding:"10px"}}>
        <div className="card-h">
          📨 メールボックス
          {unread>0&&<span style={{marginLeft:8,background:"#f87171",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{unread}</span>}
        </div>
        {mailbox.length===0&&<p style={{fontSize:11,color:"#374151",padding:"12px 0"}}>メールはありません</p>}
        {[...mailbox].sort((a,b)=>b.timestamp-a.timestamp).map(m=>(
          <div key={m.id} onClick={()=>handleSelect(m)}
            style={{padding:"8px 10px",marginBottom:4,borderRadius:6,cursor:"pointer",
              background:selected?.id===m.id?"rgba(245,200,66,.08)":m.read?"rgba(255,255,255,.02)":"rgba(255,255,255,.05)",
              border:selected?.id===m.id?"1px solid rgba(245,200,66,.3)":m.read?"1px solid transparent":"1px solid rgba(255,255,255,.1)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
              <span style={{fontSize:12}}>{typeIcon(m.type)}</span>
              {!m.read&&<span style={{width:6,height:6,borderRadius:"50%",background:"#f87171",display:"inline-block",flexShrink:0}}/>}
              <span style={{fontSize:11,fontWeight:m.read?400:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title}</span>
            </div>
            <div style={{fontSize:9,color:"#374151",paddingLeft:18}}>{m.from} · {m.dateLabel}</div>
          </div>
        ))}
      </div>

      {/* メール詳細 */}
      {selected&&(
        <div className="card" style={{padding:"12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:10,color:typeColor(selected.type),fontWeight:700}}>{typeIcon(selected.type)} {selected.type==="trade"?"トレードオファー":"お知らせ"}</span>
            <button className="bsm bga" onClick={()=>setSelected(null)}>✕</button>
          </div>
          <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{selected.title}</div>
          <div style={{fontSize:10,color:"#374151",marginBottom:10}}>差出人: {selected.from} · {selected.dateLabel}</div>
          <div style={{fontSize:12,color:"#e0d4bf",lineHeight:1.7,marginBottom:12,whiteSpace:"pre-wrap"}}>{selected.body}</div>

          {/* トレードオファーの場合は承諾/拒否ボタン */}
          {selected.type==="trade"&&selected.offer&&!selected.resolved&&(
            <div>
              <div style={{marginBottom:10,padding:"8px",borderRadius:6,background:"rgba(249,115,22,.06)",border:"1px solid rgba(249,115,22,.2)"}}>
                <div style={{fontSize:10,color:"#374151",marginBottom:6}}>オファー内容</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:6,alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:9,color:"#f87171",marginBottom:2}}>あなたが出す</div>
                    {selected.offer.want.map(p=>(<div key={p.id} style={{fontSize:11,color:"#f87171",fontWeight:700}}>{p.name}<span style={{fontSize:9,color:"#374151",marginLeft:4}}>{p.pos}</span></div>))}
                  </div>
                  <div style={{fontSize:16}}>⇄</div>
                  <div>
                    <div style={{fontSize:9,color:"#34d399",marginBottom:2}}>あなたが受け取る</div>
                    {selected.offer.offer.map(p=>(<div key={p.id} style={{fontSize:11,color:"#34d399",fontWeight:700}}>{p.name}<span style={{fontSize:9,color:"#374151",marginLeft:4}}>{p.pos}</span></div>))}
                    {selected.offer.cash>0&&<div style={{fontSize:10,color:"#f5c842"}}>+{(selected.offer.cash/10000).toLocaleString()}万円</div>}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="bsm bga" style={{flex:1}} onClick={()=>{onAction(selected.id,"accept");setSelected({...selected,resolved:true});}}>✅ 承諾する</button>
                <button className="bsm bgr" style={{flex:1}} onClick={()=>{onAction(selected.id,"decline");setSelected({...selected,resolved:true});}}>❌ 断る</button>
              </div>
            </div>
          )}
          {selected.resolved&&<div style={{textAlign:"center",fontSize:11,color:"#374151",padding:"8px"}}>対応済み</div>}
        </div>
      )}
    </div>
  );
}


function TradeTab({myTeam,teams,onTrade,cpuOffers,onAcceptOffer,onDeclineOffer}){
  const [phase,setPhase]=useState("top");
  const [targetTeam,setTargetTeam]=useState(null);
  const [myOut,setMyOut]=useState([]);
  const [theirIn,setTheirIn]=useState([]);
  const [myCash,setMyCash]=useState(0);
  const [tradeResult,setTradeResult]=useState(null);
  const [counter,setCounter]=useState(null);

  const otherTeams=teams.filter(t=>t.id!==myTeam.id);
  const myOutVal=myOut.reduce((s,p)=>s+tradeValue(p),0);
  const theirInVal=theirIn.reduce((s,p)=>s+tradeValue(p),0);
  const cashVal=myCash*0.3;
  const balance=myOutVal+cashVal-theirInVal;
  const canPropose=theirIn.length>0;

  const toggleMyOut=p=>setMyOut(prev=>prev.find(x=>x.id===p.id)?prev.filter(x=>x.id!==p.id):[...prev,p]);
  const toggleTheirIn=p=>setTheirIn(prev=>prev.find(x=>x.id===p.id)?prev.filter(x=>x.id!==p.id):[...prev,p]);

  const proposeTrade=()=>{
    if(!canPropose||!targetTeam) return;
    const ev=evalTradeForCpu(targetTeam,myOut,theirIn,myCash);
    if(ev.favorable){
      onTrade(myOut,theirIn,targetTeam,myCash);setTradeResult("accept");
    } else if(ev.fair){
      if(Math.random()<0.55){onTrade(myOut,theirIn,targetTeam,myCash);setTradeResult("accept");}
      else {
        const extra=targetTeam.players.filter(p=>!theirIn.find(x=>x.id===p.id)).sort((a,b)=>tradeValue(a)-tradeValue(b))[0];
        const needCash=Math.max(0,Math.round((theirInVal-myOutVal-cashVal)*10));
        setCounter({extraPlayer:Math.random()<0.5&&extra?extra:null,extraCash:Math.random()<0.5&&extra?0:needCash});
        setTradeResult("counter");
      }
    } else { setTradeResult("reject"); }
  };

  const acceptCounter=()=>{
    const newIn=counter?.extraPlayer?[...theirIn,counter.extraPlayer]:theirIn;
    onTrade(myOut,newIn,targetTeam,myCash+(counter?.extraCash||0));
    setTradeResult("accept");
  };
  const reset=()=>{setPhase("top");setTargetTeam(null);setMyOut([]);setTheirIn([]);setMyCash(0);setTradeResult(null);setCounter(null);};
  const fmtV=v=>{const c=v>=80?"#ffd700":v>=65?"#34d399":v>=50?"#60a5fa":"#94a3b8";return <span style={{fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</span>;};
  const sl=p=>p.isPitcher?`球速${p.pitching?.velocity} 制球${p.pitching?.control}`:`ミート${p.batting?.contact} 長打${p.batting?.power}`;
  const balColor=balance>8?"#34d399":balance<-8?"#f87171":"#f5c842";
  const balLabel=balance>8?"⚠️ 相手に有利（承認されやすい）":balance<-8?"⚠️ 自分に有利（断られやすい）":"⚖️ ほぼ等価";

  return(
    <div>
      {cpuOffers.length>0&&(
        <div className="card" style={{marginBottom:10,border:"1px solid rgba(249,115,22,.3)"}}>
          <div className="card-h" style={{color:"#f97316"}}>📨 トレードオファー ({cpuOffers.length}件)</div>
          {cpuOffers.map((offer,i)=>(
            <div key={i} style={{padding:"10px",marginBottom:6,borderRadius:6,background:"rgba(249,115,22,.05)"}}>
              <div style={{fontWeight:700,color:offer.from.color,marginBottom:6}}>{offer.from.emoji} {offer.from.name} からのオファー</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center",marginBottom:8}}>
                <div><div style={{fontSize:9,color:"#374151",marginBottom:3}}>あなたが出す</div>
                  {offer.want.map(p=>(<div key={p.id} style={{fontSize:11,color:"#f87171",fontWeight:700}}>{p.name}<span style={{fontSize:9,color:"#374151",marginLeft:4}}>{p.pos} 評価{tradeValue(p)}</span></div>))}
                </div>
                <div style={{fontSize:20}}>⇄</div>
                <div><div style={{fontSize:9,color:"#374151",marginBottom:3}}>あなたが受け取る</div>
                  {offer.offer.length>0?offer.offer.map(p=>(<div key={p.id} style={{fontSize:11,color:"#34d399",fontWeight:700}}>{p.name}<span style={{fontSize:9,color:"#374151",marginLeft:4}}>{p.pos} 評価{tradeValue(p)}</span></div>)):<div style={{fontSize:11,color:"#34d399"}}>💴 金銭のみ</div>}
                  {offer.cash>0&&<div style={{fontSize:10,color:"#f5c842"}}>+{(offer.cash/10000).toLocaleString()}万円</div>}
                </div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button className="bsm bga" style={{flex:1}} onClick={()=>onAcceptOffer(i)}>✅ 承諾</button>
                <button className="bsm bgr" style={{flex:1}} onClick={()=>onDeclineOffer(i)}>❌ 拒否</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {phase==="top"&&(
        <div className="card">
          <div className="card-h">🔄 トレード交渉を始める</div>
          <p style={{fontSize:11,color:"#374151",marginBottom:10}}>交渉する球団を選んでください</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {otherTeams.map(t=>(<div key={t.id} style={{padding:"10px",borderRadius:6,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",cursor:"pointer"}} onClick={()=>{setTargetTeam(t);setPhase("build");}}>
              <div style={{fontWeight:700,color:t.color,marginBottom:4}}>{t.emoji} {t.name}</div>
              <div style={{fontSize:9,color:"#374151"}}>{analyzeTeamNeeds(t).map(n=>"📌"+n).join(" ")}</div>
            </div>))}
          </div>
        </div>
      )}
      {phase==="build"&&targetTeam&&!tradeResult&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <button className="bsm bga" onClick={reset}>← 戻る</button>
            <span style={{fontWeight:700,color:targetTeam.color}}>{targetTeam.emoji} {targetTeam.name} との交渉</span>
          </div>
          <div className="card" style={{marginBottom:8}}>
            <div className="card-h">💴 自分が支払う金額（任意）</div>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",flexWrap:"wrap"}}>
              {[0,500,1000,3000,5000].map(v=>(<button key={v} className={"bsm "+(myCash===v?"bgb":"bga")} onClick={()=>setMyCash(v)}>{v===0?"なし":v.toLocaleString()+"万"}</button>))}
              <input type="number" value={myCash} onChange={e=>setMyCash(Math.max(0,Number(e.target.value)))} step="100" min="0"
                style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,padding:"4px 8px",color:"#e0d4bf",fontFamily:"monospace",width:80}}/>
              <span style={{fontSize:10,color:"#374151"}}>万円</span>
            </div>
            {myOut.length===0&&myCash>0&&<div style={{fontSize:10,color:"#60a5fa",marginTop:4}}>💡 金銭のみで選手を獲得できます</div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div className="card" style={{padding:"10px"}}>
              <div className="card-h" style={{color:"#f87171",marginBottom:6}}>📤 自分が出す選手<span style={{fontSize:9,color:"#374151",fontWeight:400,marginLeft:6}}>（任意）</span></div>
              <div style={{maxHeight:220,overflowY:"auto"}}>
                {myTeam.players.map(p=>{const sel=!!myOut.find(x=>x.id===p.id);return(
                  <div key={p.id} onClick={()=>toggleMyOut(p)} style={{padding:"5px 6px",marginBottom:3,borderRadius:4,cursor:"pointer",background:sel?"rgba(248,113,113,.12)":"rgba(255,255,255,.02)",border:sel?"1px solid rgba(248,113,113,.4)":"1px solid transparent"}}>
                    <div className="fsb"><span style={{fontSize:11,fontWeight:sel?700:400}}>{p.name}</span>{fmtV(tradeValue(p))}</div>
                    <div style={{fontSize:9,color:"#374151"}}>{p.pos}/{p.age}歳 {sl(p)}</div>
                  </div>
                );})}
              </div>
            </div>
            <div className="card" style={{padding:"10px"}}>
              <div className="card-h" style={{color:"#34d399",marginBottom:6}}>📥 相手から受け取る</div>
              <div style={{maxHeight:220,overflowY:"auto"}}>
                {targetTeam.players.map(p=>{const sel=!!theirIn.find(x=>x.id===p.id);return(
                  <div key={p.id} onClick={()=>toggleTheirIn(p)} style={{padding:"5px 6px",marginBottom:3,borderRadius:4,cursor:"pointer",background:sel?"rgba(52,211,153,.08)":"rgba(255,255,255,.02)",border:sel?"1px solid rgba(52,211,153,.3)":"1px solid transparent"}}>
                    <div className="fsb"><span style={{fontSize:11,fontWeight:sel?700:400}}>{p.name}</span>{fmtV(tradeValue(p))}</div>
                    <div style={{fontSize:9,color:"#374151"}}>{p.pos}/{p.age}歳 {sl(p)}</div>
                  </div>
                );})}
              </div>
            </div>
          </div>
          {canPropose&&(<div className="card" style={{marginBottom:8,padding:"10px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center"}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:9,color:"#f87171"}}>あなたが出す</div><div style={{fontSize:20,fontWeight:700,color:"#f87171"}}>{myOutVal}</div>{myCash>0&&<div style={{fontSize:9,color:"#f5c842"}}>+{myCash.toLocaleString()}万円</div>}</div>
              <div style={{fontSize:18}}>⇄</div>
              <div style={{textAlign:"center"}}><div style={{fontSize:9,color:"#34d399"}}>受け取る</div><div style={{fontSize:20,fontWeight:700,color:"#34d399"}}>{theirInVal}</div></div>
            </div>
            <div style={{textAlign:"center",fontSize:10,marginTop:6,color:balColor}}>{balLabel}</div>
          </div>)}
          <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",opacity:canPropose?1:0.4}} disabled={!canPropose} onClick={proposeTrade}>📨 トレードを提案する</button>
          {!canPropose&&<div style={{fontSize:10,color:"#374151",textAlign:"center",marginTop:6}}>受け取る選手を1人以上選んでください</div>}
        </div>
      )}
      {tradeResult&&(<div className="card" style={{textAlign:"center",padding:"24px 16px"}}>
        {tradeResult==="accept"&&<><div style={{fontSize:40,marginBottom:8}}>🎉</div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#34d399",marginBottom:8}}>トレード成立！</div><p style={{fontSize:12,color:"#374151",marginBottom:16}}>{targetTeam?.name}との交渉が成立しました</p></>}
        {tradeResult==="reject"&&<><div style={{fontSize:40,marginBottom:8}}>❌</div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f87171",marginBottom:8}}>拒否されました</div><p style={{fontSize:12,color:"#374151",marginBottom:16}}>金銭を上乗せするか、条件を変えて再提案しましょう。</p></>}
        {tradeResult==="counter"&&counter&&<><div style={{fontSize:40,marginBottom:8}}>🔄</div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f5c842",marginBottom:8}}>逆提案が来ました！</div>
          <div className="card" style={{textAlign:"left",marginBottom:12}}><div className="card-h">{targetTeam?.name}の追加要求</div>
            {counter.extraPlayer&&<div style={{padding:"6px 0",fontSize:12,color:"#f5c842"}}>「{counter.extraPlayer.name}も一緒に欲しい」<span style={{fontSize:9,color:"#374151",marginLeft:6}}>{counter.extraPlayer.pos} 評価{tradeValue(counter.extraPlayer)}</span></div>}
            {!counter.extraPlayer&&counter.extraCash>0&&<div style={{padding:"6px 0",fontSize:12,color:"#f5c842"}}>「{counter.extraCash.toLocaleString()}万円を上乗せしてほしい」</div>}
          </div>
          <div style={{display:"flex",gap:8}}><button className="btn btn-gold" style={{flex:1}} onClick={acceptCounter}>✅ 受け入れる</button><button className="bsm bgr" style={{flex:1,padding:"10px 0"}} onClick={reset}>❌ 断る</button></div>
        </>}
        {(tradeResult==="reject"||tradeResult==="accept")&&<button className="bsm bga" style={{marginTop:12}} onClick={reset}>続けて交渉する</button>}
      </div>)}
    </div>
  );
}




function CareerTable({player}){
  const [mode,setMode]=useState("regular");
  const log=player.careerLog||[];
  if(log.length===0) return null;
  const hasPlayoff=log.some(r=>{const ps=r.playoffStats||emptyStats();return ps.PA>0||ps.BF>0;});
  const ip=player.isPitcher;

  // 各年のデータ取得
  const getS=(row)=>mode==="playoff"?(row.playoffStats||emptyStats()):(row.stats||emptyStats());

  // 通算計算
  const sumK=(k)=>log.reduce((a,r)=>a+(getS(r)[k]||0),0);
  const totals={PA:sumK("PA"),AB:sumK("AB"),H:sumK("H"),HR:sumK("HR"),RBI:sumK("RBI"),SB:sumK("SB"),BF:sumK("BF"),W:sumK("W"),L:sumK("L"),SV:sumK("SV"),IP:sumK("IP"),Kp:sumK("Kp"),ER:sumK("ER"),BB:sumK("BB"),HRA:sumK("HRA")};
  const hasTotals=ip?(totals.BF>0):(totals.PA>0);

  return(
    <div style={{marginTop:8,background:"rgba(0,0,0,.2)",borderRadius:6,padding:"8px 10px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <div style={{fontSize:10,color:"#f5c842",fontWeight:700}}>📅 年度別成績</div>
        {hasPlayoff&&(
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>setMode("regular")} style={{padding:"2px 8px",fontSize:9,borderRadius:3,border:"none",cursor:"pointer",background:mode==="regular"?"#f5c842":"rgba(255,255,255,.08)",color:mode==="regular"?"#0f1923":"#94a3b8"}}>レギュラー</button>
            <button onClick={()=>setMode("playoff")} style={{padding:"2px 8px",fontSize:9,borderRadius:3,border:"none",cursor:"pointer",background:mode==="playoff"?"#a78bfa":"rgba(255,255,255,.08)",color:mode==="playoff"?"#fff":"#94a3b8"}}>ポスト</button>
          </div>
        )}
      </div>
      <div style={{overflowX:"auto"}}>
        {ip&&(
          <table className="tbl" style={{fontSize:9,width:"100%"}}>
            <thead>
              <tr><th>年度</th><th>防御率</th><th>勝</th><th>負</th><th>S</th><th>回</th><th>K</th><th>WHIP</th></tr>
            </thead>
            <tbody>
              {[...log].reverse().map((row,ri)=>{
                const s=getS(row);
                if(mode==="playoff"&&s.BF===0) return null;
                const sp=saberPitcher(s);
                return(
                  <tr key={ri}>
                    <td className="mono" style={{color:"#f5c842"}}>{row.year}</td>
                    <td className="mono">{sp.ERA}</td>
                    <td className="mono" style={{color:"#34d399"}}>{s.W}</td>
                    <td className="mono" style={{color:"#f87171"}}>{s.L}</td>
                    <td className="mono">{s.SV}</td>
                    <td className="mono">{fmtIP(s.IP)}</td>
                    <td className="mono">{s.Kp}</td>
                    <td className="mono">{sp.WHIP}</td>
                  </tr>
                );
              })}
              {hasTotals&&(
                <tr style={{background:"rgba(245,200,66,.06)",fontWeight:700}}>
                  <td style={{color:"#f5c842",fontSize:9}}>通算</td>
                  <td className="mono">{saberPitcher(totals).ERA}</td>
                  <td className="mono" style={{color:"#34d399"}}>{totals.W}</td>
                  <td className="mono" style={{color:"#f87171"}}>{totals.L}</td>
                  <td className="mono">{totals.SV}</td>
                  <td className="mono">{fmtIP(totals.IP)}</td>
                  <td className="mono">{totals.Kp}</td>
                  <td className="mono">{saberPitcher(totals).WHIP}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {!ip&&(
          <table className="tbl" style={{fontSize:9,width:"100%"}}>
            <thead>
              <tr><th>年度</th><th>打席</th><th>打率</th><th>HR</th><th>打点</th><th>盗塁</th><th>OPS</th></tr>
            </thead>
            <tbody>
              {[...log].reverse().map((row,ri)=>{
                const s=getS(row);
                if(mode==="playoff"&&s.PA===0) return null;
                const sb=saberBatter(s);
                return(
                  <tr key={ri}>
                    <td className="mono" style={{color:"#f5c842"}}>{row.year}</td>
                    <td className="mono">{s.PA}</td>
                    <td className="mono">{fmtAvg(s.H,s.AB)}</td>
                    <td className="mono" style={{color:s.HR>=20?"#f5c842":undefined}}>{s.HR}</td>
                    <td className="mono">{s.RBI}</td>
                    <td className="mono">{s.SB}</td>
                    <td className="mono">{sb.OPS.toFixed(3)}</td>
                  </tr>
                );
              })}
              {hasTotals&&(
                <tr style={{background:"rgba(245,200,66,.06)",fontWeight:700}}>
                  <td style={{color:"#f5c842",fontSize:9}}>通算</td>
                  <td className="mono">{totals.PA}</td>
                  <td className="mono">{fmtAvg(totals.H,totals.AB)}</td>
                  <td className="mono" style={{color:totals.HR>=200?"#f5c842":undefined}}>{totals.HR}</td>
                  <td className="mono">{totals.RBI}</td>
                  <td className="mono">{totals.SB}</td>
                  <td className="mono">{saberBatter(totals).OPS.toFixed(3)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ALUMNI TAB
═══════════════════════════════════════════════ */


/* ═══ components/Draft.jsx ═══ */


function DraftPreviewScreen({teams,myId,year,pool,onStart}){
  const myTeam=teams.find(t=>t.id===myId);
  const rec=recommendForTeam(myTeam,pool);
  const spots=pool.filter(p=>p.spotlight);
  const predictTeam=player=>{
    const cands=[...teams].sort((a,b)=>a.wins-b.wins).slice(0,4);
    return cands.find(t=>{const n=analyzeTeamNeeds(t);return player.isPitcher?n.some(x=>x.includes("投手")):n.some(x=>x.includes("ミート"));})||cands[0];
  };
  const [tab,setTab]=useState("overview");
  const ov=p=>p.isPitcher?Math.round((p.pitching.velocity+p.pitching.control+p.pitching.breaking)/3):Math.round((p.batting.contact+p.batting.power+p.batting.eye)/3);
  return(
    <div className="app"><div style={{maxWidth:700,margin:"0 auto",padding:"16px 12px"}}>
      <div style={{textAlign:"center",marginBottom:14}}>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:36,color:"#f5c842",letterSpacing:".05em"}}>⚾ {year+1}年 ドラフト展望</div>
        <div style={{fontSize:11,color:"#374151"}}>会議開始前の事前情報 — スカウト陣からのレポート</div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["overview","📋 総評"],["teams","🏟️ 各球団"],["rec","⭐ おすすめ"]].map(([k,l])=>(<button key={k} className={"bsm "+(tab===k?"bgb":"bga")} style={{flex:1,padding:"7px 0",fontSize:12}} onClick={()=>setTab(k)}>{l}</button>))}
      </div>
      {tab==="overview"&&(<>
        <div className="card" style={{marginBottom:10}}>
          <div className="card-h">📊 今年のドラフト総評</div>
          <p style={{color:"#e0d4bf",fontSize:13,lineHeight:1.7,margin:"4px 0 10px"}}>{draftOverallComment(pool)}</p>
          <div style={{fontSize:10,color:"#374151"}}>上位5人平均ポテンシャル: <span style={{fontWeight:700,color:"#f5c842"}}>{Math.round(pool.slice(0,5).reduce((s,p)=>s+p.potential,0)/5)}</span>　候補総数: {pool.length}人</div>
        </div>
        <div className="card">
          <div className="card-h">👑 注目選手 &amp; 指名予想球団</div>
          {spots.map(p=>{const pred=predictTeam(p);return(<div key={p.id} style={{padding:"10px",marginBottom:8,borderRadius:6,background:"rgba(245,200,66,.05)",border:"1px solid rgba(245,200,66,.15)"}}>
            <div className="fsb"><div><span style={{fontSize:9,color:"#f97316",fontWeight:700}}>{p.spotlight} </span><span style={{fontWeight:700,fontSize:14}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span></div><OV v={ov(p)}/></div>
            <div style={{fontSize:10,color:"#374151",marginTop:4}}>{p.isPitcher?`球速${p.pitching.velocity} 制球${p.pitching.control} 変化${p.pitching.breaking}`:`ミート${p.batting.contact} 長打${p.batting.power} 走力${p.batting.speed}`}</div>
            <div style={{marginTop:6,fontSize:10,color:"#60a5fa"}}>📡 指名予想: <span style={{fontWeight:700,color:pred.color}}>{pred.emoji}{pred.name}</span><span style={{color:"#374151",marginLeft:6}}>({analyzeTeamNeeds(pred)[0]})</span></div>
          </div>);})}
        </div>
      </>)}
      {tab==="teams"&&(<div className="card"><div className="card-h">🏟️ 各球団の補強ポイント</div>
        {[...teams].sort((a,b)=>a.wins-b.wins).map((t,i)=>{const needs=analyzeTeamNeeds(t);const isMe=t.id===myId;return(<div key={t.id} style={{padding:"8px 10px",marginBottom:6,borderRadius:6,background:isMe?"rgba(245,200,66,.06)":"rgba(255,255,255,.02)",border:isMe?"1px solid rgba(245,200,66,.2)":"1px solid rgba(255,255,255,.04)"}}>
          <div className="fsb"><div><span style={{fontSize:10,color:"#374151",marginRight:6}}>{i+1}位指名</span><span style={{color:t.color,fontWeight:700}}>{t.emoji} {t.name}</span>{isMe&&<span style={{fontSize:9,color:"#f5c842",marginLeft:6}}>← あなた</span>}</div><span style={{fontSize:10,color:"#374151"}}>{t.wins}勝{t.losses}敗</span></div>
          <div style={{marginTop:4,display:"flex",gap:6,flexWrap:"wrap"}}>{needs.map((n,j)=>(<span key={j} style={{fontSize:9,background:"rgba(96,165,250,.1)",color:"#60a5fa",padding:"2px 7px",borderRadius:10}}>📌 {n}</span>))}</div>
        </div>);})}
      </div>)}
      {tab==="rec"&&(<div className="card"><div className="card-h">⭐ {myTeam?.name} おすすめ候補 TOP5</div>
        <p style={{fontSize:11,color:"#374151",marginBottom:10}}>チームの現状分析をもとにスカウト陣が選定しました</p>
        {rec.map((p,i)=>{const rankColor=["#ffd700","#94a3b8","#b45309","#374151","#374151"][i];return(<div key={p.id} style={{padding:"10px",marginBottom:6,borderRadius:6,background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)"}}>
          <div className="fsb"><div><span style={{fontSize:16,fontWeight:700,color:rankColor,marginRight:8}}>#{i+1}</span><span style={{fontWeight:700,fontSize:13}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>{p.spotlight&&<span style={{fontSize:9,color:"#f97316",marginLeft:4}}>{p.spotlight}</span>}</div><OV v={ov(p)}/></div>
          <div style={{fontSize:9,color:"#374151",marginTop:4}}>{p.isPitcher?`球速${p.pitching.velocity} 制球${p.pitching.control} 変化${p.pitching.breaking}`:`ミート${p.batting.contact} 長打${p.batting.power} 走力${p.batting.speed}`}</div>
          <div style={{fontSize:9,color:"#a78bfa",marginTop:2}}>ポテンシャル {p.potential} ／ {p.age<=20?"将来の大器":"即戦力候補"}{p.playerType&&<span style={{color:"#60a5fa",marginLeft:6}}>{p.playerType}</span>}</div>
          {p.playerComment&&<div style={{fontSize:8,color:"#374151",marginTop:1,fontStyle:"italic"}}>"{p.playerComment}"</div>}
          {p.fromScout&&<div style={{fontSize:8,color:"#34d399",marginTop:1}}>✅ スカウト済み選手</div>}
        </div>);})}
      </div>)}
      <div style={{textAlign:"center",marginTop:16}}><button className="btn btn-gold" style={{padding:"12px 48px",fontSize:15}} onClick={onStart}>⚾ ドラフト会議を開始する</button></div>
    </div></div>
  );
}


function DraftLotteryScreen({teams,myId,year,pool,onDone}){
  // phase: "select" → "announce" → "lottery" → "hazure" → "done"
  const [phase,setPhase]=useState("select");
  const [myPick,setMyPick]=useState(null);
  const [cpuPicks,setCpuPicks]=useState(null);
  const [lotteryTarget,setLotteryTarget]=useState(null); // 競合選手
  const [lotteryTeams,setLotteryTeams]=useState([]); // 競合球団
  const [lotteryResult,setLotteryResult]=useState(null); // 当選球団
  const [hazureTeams,setHazureTeams]=useState([]); // 外れ球団
  const [hazurePicks,setHazurePicks]=useState({}); // {teamId: player}
  const [myHazure,setMyHazure]=useState(false); // 自チームが外れたか
  const [round1Result,setRound1Result]=useState({}); // {teamId: player} 最終結果
  const [animStep,setAnimStep]=useState(0);
  const allSorted=[...teams].sort((a,b)=>a.wins-b.wins);
  const availPool=pool.filter(p=>!p._drafted);
  const myTeam=teams.find(t=>t.id===myId);

  // CPU1巡目指名ロジック
  const buildCpuPicks=()=>{
    const picks={};
    const used=new Set(myPick?[myPick.id]:[]);
    allSorted.forEach(t=>{
      if(t.id===myId) return;
      const avail=availPool.filter(p=>!used.has(p.id));
      if(!avail.length) return;
      const needs=analyzeTeamNeeds(t);
      const needsPitcher=needs.some(n=>n.includes("投手"));
      const scored=avail.map((p,i)=>{
        let s=100-i*3;
        if(needsPitcher&&p.isPitcher) s+=30;
        if(!needsPitcher&&!p.isPitcher) s+=20;
        return{p,s};
      }).sort((a,b)=>b.s-a.s);
      // 30%で2位以下から指名（競合を避ける戦略）
      const pick=Math.random()<0.3&&scored.length>1?scored[rng(1,Math.min(3,scored.length-1))].p:scored[0].p;
      picks[t.id]=pick;
      used.add(pick.id); // 競合を防ぐ（くじ引きで競合を演出する必要はない）
    });
    return picks;
  };

  // 一斉発表フェーズへ
  const handleAnnounce=()=>{
    if(!myPick) return;
    const cpu=buildCpuPicks();
    setCpuPicks(cpu);
    setPhase("announce");
    setAnimStep(0);
    // アニメーションで順番に表示
    let step=0;
    const timer=setInterval(()=>{
      step++;
      setAnimStep(step);
      if(step>=allSorted.length){
        clearInterval(timer);
        setTimeout(()=>processLottery(cpu),600);
      }
    },400);
  };

  // 競合処理
  const processLottery=(cpu)=>{
    const allPicks={...cpu,[myId]:myPick};
    // 競合チェック
    const byPlayer={};
    Object.entries(allPicks).forEach(([tid,p])=>{
      if(!p) return;
      if(!byPlayer[p.id]) byPlayer[p.id]=[];
      byPlayer[p.id].push(tid);
    });
    const contestedEntry=Object.entries(byPlayer).find(function(e){return e[1].length>1;});const contested=contestedEntry?[contestedEntry[0],contestedEntry[1]]:null;
    if(contested){
      const pid=contested[0];const tids=contested[1];
      const target=pool.find(p=>p.id===pid);
      setLotteryTarget(target);
      setLotteryTeams(tids.map(tid=>teams.find(t=>t.id===tid)).filter(t=>t!==undefined));
      setPhase("lottery");
    } else {
      // 競合なし → そのまま確定
      finalizeRound1(allPicks,{});
    }
  };

  // くじ引き実行
  const drawLottery=()=>{
    const winner=lotteryTeams[rng(0,lotteryTeams.length-1)];
    setLotteryResult(winner);
    setTimeout(()=>{
      const losers=lotteryTeams.filter(t=>t.id!==winner.id);
      if(losers.length>0){
        setHazureTeams(losers);
        setMyHazure(losers.some(t=>t.id===myId));
        // CPU外れ球団は自動で外れ1位を決める
        const hPicks={};
        losers.forEach(t=>{
          if(t.id===myId) return;
          const used=new Set([lotteryTarget.id,...Object.values(cpuPicks).filter(p=>p).map(p=>p.id)]);
          const avail=availPool.filter(p=>!used.has(p.id));
          if(avail.length) hPicks[t.id]=avail[rng(0,Math.min(2,avail.length-1))];
        });
        setHazurePicks(hPicks);
        setPhase("hazure");
      } else {
        const allPicks={...cpuPicks,[myId]:myPick};
        finalizeRound1(allPicks,{});
      }
    },1500);
  };

  // 外れ1位確定
  const confirmHazure=(myHazurePick)=>{
    const allPicks={...cpuPicks,[myId]:myPick};
    const allHazure={...hazurePicks};
    if(myHazurePick) allHazure[myId]=myHazurePick;
    // 外れ球団からlotteryTargetを除いて確定
    Object.entries(allPicks).forEach(([tid])=>{
      if(hazureTeams.find(t=>t.id===tid)) allPicks[tid]=null;
    });
    finalizeRound1(allPicks,allHazure);
  };

  const finalizeRound1=(picks,hazure)=>{
    const result={};
    // くじ当選者
    Object.entries(picks).forEach(([tid,p])=>{if(p) result[tid]=p;});
    // 外れ1位
    Object.entries(hazure).forEach(([tid,p])=>{if(p) result[tid]=p;});
    setRound1Result(result);
    setPhase("done");
  };

  // 外れ1位自チーム選択画面
  const [myHazurePick,setMyHazurePick]=useState(null);
  const hazurePool=availPool.filter(p=>p.id!==lotteryTarget?.id&&!Object.values(hazurePicks).find(x=>x&&x.id===p.id));

  if(phase==="select") return(
    <div className="app"><div style={{padding:"14px"}}>
      <div style={{fontSize:11,color:"#94a3b8",letterSpacing:".1em",marginBottom:2}}>DRAFT {year}</div>
      <div style={{fontSize:22,fontWeight:700,color:"#f5c842",marginBottom:4}}>📋 1巡目 — 指名選手を選択</div>
      <div style={{fontSize:11,color:"#94a3b8",marginBottom:14}}>全球団が同時発表します。被りはくじ引きで決定。</div>
      <div className="card" style={{marginBottom:10}}>
        <div className="card-h">{myTeam?.name} — 1位指名選手</div>
        {availPool.slice(0,20).map(p=>(
          <div key={p.id} onClick={()=>setMyPick(p)} style={{padding:"7px 6px",borderBottom:"1px solid rgba(255,255,255,.04)",cursor:"pointer",background:myPick?.id===p.id?"rgba(245,200,66,.08)":undefined}}>
            <div className="fsb">
              <div>
                <span style={{fontWeight:700,fontSize:13,color:myPick?.id===p.id?"#f5c842":"#e0d4bf"}}>{p.name}</span>
                <span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>
              </div>
              <span style={{fontSize:10,color:"#94a3b8"}}>{p.isPitcher?"投手":"野手"}</span>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",opacity:myPick?1:0.4}} onClick={handleAnnounce}>
        {myPick?`${myPick.name} を1位指名 →`:"選手を選んでください"}
      </button>
    </div></div>
  );

  if(phase==="announce") return(
    <div className="app"><div style={{padding:"14px"}}>
      <div style={{fontSize:22,fontWeight:700,color:"#f5c842",marginBottom:14,textAlign:"center"}}>📢 1巡目 一斉発表</div>
      <div className="card">
        {allSorted.map((t,idx)=>{
          const pick=t.id===myId?myPick:(cpuPicks?cpuPicks[t.id]:null);
          const visible=animStep>idx;
          return(
            <div key={t.id} style={{padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.04)",opacity:visible?1:0,transition:"opacity .3s",minHeight:36}}>
              {visible&&(
                <div className="fsb">
                  <div>
                    <span style={{fontSize:11,color:t.id===myId?"#f5c842":"#94a3b8"}}>{t.emoji} {t.name}</span>
                    <span style={{fontWeight:700,fontSize:13,marginLeft:8,color:t.id===myId?"#f5c842":"#e0d4bf"}}>{pick?.name||"---"}</span>
                  </div>
                  <span style={{fontSize:10,color:"#374151"}}>{pick?.pos}/{pick?.age}歳</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div></div>
  );

  if(phase==="lottery") return(
    <div className="app"><div style={{padding:"14px"}}>
      <div style={{fontSize:22,fontWeight:700,color:"#f5c842",marginBottom:4,textAlign:"center"}}>🎰 競合！くじ引き</div>
      <div style={{textAlign:"center",fontSize:13,color:"#94a3b8",marginBottom:14}}>{lotteryTarget?.name} に {lotteryTeams.length}球団が競合</div>
      <div className="card" style={{textAlign:"center",padding:24,marginBottom:12}}>
        <div style={{fontSize:40,marginBottom:8}}>📋</div>
        <div style={{fontSize:14,color:"#e0d4bf",marginBottom:12}}>競合球団:</div>
        {lotteryTeams.map(t=>(
          <div key={t.id} style={{fontSize:13,color:t.id===myId?"#f5c842":"#94a3b8",padding:"3px 0"}}>{t.emoji} {t.name}</div>
        ))}
        {!lotteryResult&&(
          <button className="btn btn-gold" style={{marginTop:20,padding:"10px 32px"}} onClick={drawLottery}>くじを引く！</button>
        )}
        {lotteryResult&&(
          <div style={{marginTop:20,padding:"16px",background:"rgba(245,200,66,.08)",borderRadius:8}}>
            <div style={{fontSize:32,marginBottom:4}}>{lotteryResult.id===myId?"🎉":"😢"}</div>
            <div style={{fontSize:16,fontWeight:700,color:lotteryResult.id===myId?"#f5c842":"#94a3b8"}}>
              {lotteryResult.emoji} {lotteryResult.name} が当選！
            </div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{lotteryTarget?.name} の交渉権獲得</div>
          </div>
        )}
      </div>
    </div></div>
  );

  if(phase==="hazure") return(
    <div className="app"><div style={{padding:"14px"}}>
      <div style={{fontSize:20,fontWeight:700,color:"#f5c842",marginBottom:4}}>外れ1位指名</div>
      <div style={{fontSize:11,color:"#94a3b8",marginBottom:14}}>くじに外れた球団が次の指名を行います</div>
      {myHazure&&(
        <div className="card" style={{marginBottom:10}}>
          <div className="card-h" style={{color:"#f5c842"}}>{myTeam?.name} — 外れ1位を選択</div>
          {hazurePool.slice(0,15).map(p=>(
            <div key={p.id} onClick={()=>setMyHazurePick(p)} style={{padding:"7px 6px",borderBottom:"1px solid rgba(255,255,255,.04)",cursor:"pointer",background:myHazurePick?.id===p.id?"rgba(245,200,66,.08)":undefined}}>
              <div className="fsb">
                <span style={{fontWeight:700,fontSize:13,color:myHazurePick?.id===p.id?"#f5c842":"#e0d4bf"}}>{p.name} <span style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.age}歳</span></span>
                <span style={{fontSize:10,color:"#94a3b8"}}>{p.isPitcher?"投手":"野手"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {Object.entries(hazurePicks).filter(([tid])=>tid!==myId).map(([tid,p])=>{
        const t=teams.find(x=>x.id===tid);
        return p?(
          <div key={tid} style={{fontSize:11,color:"#94a3b8",padding:"4px 0"}}>{t?.emoji} {t?.name} → 外れ1位: <span style={{color:"#e0d4bf",fontWeight:700}}>{p.name}</span></div>
        ):null;
      })}
      <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",marginTop:12,opacity:(!myHazure||myHazurePick)?1:0.4}} onClick={()=>{if(!myHazure||myHazurePick) confirmHazure(myHazurePick);}}>
        外れ1位確定 →
      </button>
    </div></div>
  );

  if(phase==="done") return(
    <div className="app"><div style={{padding:"14px"}}>
      <div style={{fontSize:22,fontWeight:700,color:"#f5c842",marginBottom:14,textAlign:"center"}}>✅ 1巡目結果</div>
      <div className="card" style={{marginBottom:14}}>
        {allSorted.map(t=>{
          const p=round1Result[t.id];
          return p?(
            <div key={t.id} className="fsb" style={{padding:"7px 6px",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
              <div>
                <span style={{fontSize:11,color:t.id===myId?"#f5c842":"#94a3b8"}}>{t.emoji} {t.name}</span>
                <span style={{fontWeight:700,fontSize:13,marginLeft:8,color:t.id===myId?"#f5c842":"#e0d4bf"}}>{p.name}</span>
              </div>
              <span style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.age}歳</span>
            </div>
          ):null;
        })}
      </div>
      <button className="btn btn-gold" style={{width:"100%",padding:"12px 0"}} onClick={()=>onDone(round1Result)}>
        2巡目以降へ →
      </button>
    </div></div>
  );

  return null;
}


function DraftScreen({teams,myId,year,pool,onDraftDone}){
  const allSorted=[...teams].sort((a,b)=>a.wins-b.wins);
  const draftOrder=[];
  for(let round=0;round<DRAFT_ROUNDS;round++){allSorted.forEach(t=>draftOrder.push({round,team:t}));}
  // 1巡目はlotteryで処理済みなのでスキップ
  const draftOrderFiltered=draftOrder.filter(function(d){return d.round>0;});
  const [pickIdx,setPickIdx]=useState(0);
  const [drafted,setDrafted]=useState({});
  const [log,setLog]=useState([]);
  const [done,setDone]=useState(false);
  const [scouted,setScouted]=useState(new Set());
  const [scoutPt,setScoutPt]=useState(5);
  const [announcement,setAnnouncement]=useState(null);
  const current=draftOrderFiltered[pickIdx];
  const isMyTurn=current&&current.team.id===myId&&!done;
  // 1巡目で指名済みの選手を除外
  const predrafted=pool.filter(p=>p._drafted).reduce((a,p)=>{a[p.id]=p._r1winner;return a;},{});
  const availPool=pool.filter(p=>!drafted[p.id]&&!p._drafted);
  const myPicks=pool.filter(p=>drafted[p.id]===myId);
  const doScout=pid=>{if(scoutPt<=0||scouted.has(pid)) return;setScouted(prev=>new Set([...prev,pid]));setScoutPt(n=>n-1);};
  const announce=(msg,color="#f5c842")=>{setAnnouncement({msg,color});setTimeout(()=>setAnnouncement(null),2200);};
  const doPick=(pick,isMe)=>{
    const newDrafted={...drafted,[pick.id]:isMe?myId:current.team.id};
    const comment=isMe?DRAFT_COMMENTS_MY[rng(0,DRAFT_COMMENTS_MY.length-1)]:`${current.team.name}${DRAFT_COMMENTS_CPU[rng(0,DRAFT_COMMENTS_CPU.length-1)]}`;
    setDrafted(newDrafted);
    setLog(prev=>[{round:current.round+1,team:current.team,player:pick,isMe,comment},...prev]);
    // 入団拒否リスク（自チーム指名時のみ、高ポテンシャルほど拒否しやすい）
    let refused=false;
    if(isMe){
      const refuseChance=clamp((pick.potential-70)/200,0,0.15); // 最大15%
      if(Math.random()<refuseChance){
        refused=true;
        announce(`❌ ${pick.name} が入団を拒否！他球団を選択...`,"#f87171");
        if(pickIdx+1>=draftOrderFiltered.length) setDone(true);
        else setPickIdx(i=>i+1);
        return;
      }
    }
    if(!refused){
      announce(isMe?`🎉 ${pick.name} を指名！${comment}`:`${current.team.emoji} ${pick.name} — ${comment}`,isMe?"#f5c842":current.team.color);
      if(pickIdx+1>=draftOrderFiltered.length) setDone(true);
      else setPickIdx(i=>i+1);
    }
  };
  const cpuPick=()=>{
    if(!current||done) return;
    const avail=pool.filter(p=>!drafted[p.id]);
    if(!avail.length){setDone(true);return;}
    // CPU戦略：補強ニーズに合う選手を優先
    const needs=analyzeTeamNeeds(current.team);
    const needsPitcher=needs.some(n=>n.includes("投手"));
    const needsPower=needs.some(n=>n.includes("長打"));
    const scored=avail.map((p,i)=>{
      let score=100-i*2; // ポテンシャル順の基礎点
      if(needsPitcher&&p.isPitcher) score+=25;
      if(!needsPitcher&&!p.isPitcher) score+=15;
      if(needsPower&&!p.isPitcher&&p.batting?.power>65) score+=10;
      return{p,score};
    }).sort((a,b)=>b.score-a.score);
    // 8%でサプライズ指名
    const surprise=Math.random()<0.08&&avail.length>6;
    const pick=surprise?avail[rng(4,Math.min(8,avail.length-1))]:scored[0].p;
    doPick(pick,false);
  };
  const myPick=pid=>{const pick=pool.find(p=>p.id===pid);if(!pick||drafted[pick.id]||!isMyTurn) return;doPick(pick,true);};
  useEffect(()=>{
    if(isMyTurn||done||pickIdx>=draftOrderFiltered.length) return;
    const timer=setTimeout(()=>cpuPick(),350);
    return()=>clearTimeout(timer);
  },[pickIdx,done]);
  const statView=p=>{const sc=scouted.has(p.id)||drafted[p.id]===myId||p.fromScout;return p.isPitcher?sc?`球速${p.pitching.velocity} 制球${p.pitching.control} 変化${p.pitching.breaking} スタ${p.pitching.stamina}`:`球速??? 制球??? 変化??? スタ???`:sc?`ミート${p.batting.contact} 長打${p.batting.power} 走力${p.batting.speed} 選球${p.batting.eye}`:`ミート??? 長打??? 走力??? 選球???`;};
  const ovView=p=>{if(!scouted.has(p.id)&&drafted[p.id]!==myId&&!p.fromScout) return "??";return p.isPitcher?Math.round((p.pitching.velocity+p.pitching.control+p.pitching.breaking)/3):Math.round((p.batting.contact+p.batting.power+p.batting.eye+p.batting.speed)/4);};
  const progress=Math.round(pickIdx/draftOrderFiltered.length*100);
  return(
    <div className="app">
      <style>{`.draft-pool{max-height:320px;overflow-y:auto;}.draft-pick{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;transition:.15s;}.draft-pick:hover{background:rgba(245,200,66,.06);}.draft-log{max-height:240px;overflow-y:auto;}@keyframes fadeSlide{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}.announce{animation:fadeSlide .3s ease;}`}</style>
      <div style={{maxWidth:740,margin:"0 auto",padding:"12px"}}>
        <div style={{textAlign:"center",marginBottom:10}}>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:38,color:"#f5c842",letterSpacing:".05em"}}>{year+1}年 ドラフト会議</div>
          <div style={{fontSize:10,color:"#374151"}}>2巡目以降 · {pickIdx}/{draftOrderFiltered.length}指名完了</div>
          <div style={{background:"rgba(255,255,255,.05)",borderRadius:4,height:5,margin:"8px 0",overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#f5c842,#f97316)",width:progress+"%",transition:".4s"}}/></div>
        </div>
        {pool.filter(p=>p.spotlight&&!drafted[p.id]).length>0&&(
          <div style={{display:"flex",gap:6,marginBottom:10,overflowX:"auto",paddingBottom:4}}>
            {pool.filter(p=>p.spotlight&&!drafted[p.id]).map(p=>(<div key={p.id} style={{minWidth:160,background:"linear-gradient(135deg,rgba(245,200,66,.12),rgba(249,115,22,.08))",border:"1px solid rgba(245,200,66,.3)",borderRadius:8,padding:"8px 10px",flexShrink:0}}>
              <div style={{fontSize:10,color:"#f97316",fontWeight:700,marginBottom:2}}>{p.spotlight}</div>
              <div style={{fontWeight:700,fontSize:13}}>{p.name}</div>
              <div style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.age}歳{p.isPitcher&&<HandBadge p={p}/>}</div>
              <div style={{fontSize:9,color:"#a78bfa",marginTop:2}}>ポテンシャル {p.potential}</div>
            </div>))}
          </div>
        )}
        {announcement&&(<div className="announce" style={{background:"rgba(0,0,0,.7)",border:`1px solid ${announcement.color}`,borderRadius:8,padding:"10px 16px",marginBottom:10,textAlign:"center",color:announcement.color,fontWeight:700,fontSize:13}}>{announcement.msg}</div>)}
        {done?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:36,marginBottom:8}}>🎊</div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:32,color:"#34d399",marginBottom:16}}>ドラフト終了！</div>
            <div className="card" style={{textAlign:"left",marginBottom:16}}>
              <div className="card-h">自チーム指名選手 ({myPicks.length}人)</div>
              {myPicks.map(p=>(<div key={p.id} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                <div className="fsb"><div><span style={{fontWeight:700,color:"#f5c842"}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.pos}/{p.age}歳</span>{p.spotlight&&<span style={{fontSize:9,color:"#f97316",marginLeft:6}}>{p.spotlight}</span>}</div><span style={{fontSize:10,color:"#a78bfa"}}>P:{p.potential}</span></div>
                <div style={{fontSize:10,color:"#34d399",marginTop:4}}>{statView(p)}</div>
              </div>))}
            </div>
            <button className="btn btn-gold" style={{padding:"12px 40px"}} onClick={()=>onDraftDone(pool,drafted)}>▶ 結果レビューへ</button>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div className="card" style={{padding:"10px"}}>
              <div className="card-h" style={{marginBottom:6}}>{isMyTurn?<span style={{color:"#f5c842",fontWeight:700}}>🔔 あなたの番！</span>:<span style={{color:"#94a3b8"}}>{current?.team.emoji} {current?.team.name} が選択中…</span>}<span style={{float:"right",fontSize:10,color:"#374151"}}>{current?.round+1}巡目</span></div>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",background:"rgba(167,139,250,.08)",borderRadius:5,marginBottom:8,fontSize:11}}>
                <span style={{color:"#a78bfa"}}>🔍 スカウトPT</span><span style={{fontWeight:700,color:scoutPt>0?"#f5c842":"#f87171"}}>{scoutPt}</span><span style={{color:"#374151",fontSize:10}}>残</span>
              </div>
              <div className="draft-pool">
                {availPool.slice(0,22).map(p=>{const isSc=scouted.has(p.id);const ov=ovView(p);return(<div key={p.id} className="draft-pick" style={{background:p.spotlight?"rgba(249,115,22,.04)":undefined,borderLeft:p.spotlight?"2px solid #f97316":undefined,opacity:isMyTurn?1:.55}}>
                  <div className="fsb"><div style={{flex:1}} onClick={()=>isMyTurn&&myPick(p.id)}><span style={{fontWeight:700,fontSize:12}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>{p.spotlight&&<span style={{fontSize:9,color:"#f97316",marginLeft:4}}>{p.spotlight}</span>}</div>
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      {!isSc&&<button className="bsm" style={{fontSize:9,padding:"1px 5px",background:"rgba(167,139,250,.15)",color:"#a78bfa",border:"1px solid rgba(167,139,250,.3)",borderRadius:3,opacity:scoutPt>0?1:.4,cursor:scoutPt>0?"pointer":"not-allowed"}} onClick={e=>{e.stopPropagation();doScout(p.id);}}>🔍-1</button>}
                      <span style={{fontSize:9,color:"#374151"}}>総合</span><span style={{fontFamily:"monospace",fontWeight:700,color:ov==="??"?"#374151":ov>=75?"#ffd700":ov>=65?"#34d399":"#94a3b8"}}>{ov}</span>
                    </div>
                  </div>
                  <div style={{fontSize:9,color:isSc?"#60a5fa":"#374151",marginTop:2}} onClick={()=>isMyTurn&&myPick(p.id)}>{statView(p)}</div>
                  {isSc&&<div style={{fontSize:9,color:"#a78bfa",marginTop:1}}>P:{p.potential}　{p.playerType&&<span style={{color:"#60a5fa"}}>{p.playerType}</span>}</div>}
                  {p.fromScout&&<div style={{fontSize:8,color:"#34d399",marginTop:1}}>✅ スカウト済み（能力値確認済み）</div>}
                  {isSc&&p.playerComment&&<div style={{fontSize:8,color:"#374151",marginTop:1,fontStyle:"italic"}}>"{p.playerComment}"</div>}
                </div>);})}
              </div>
            </div>
            <div className="card" style={{padding:"10px"}}>
              <div className="card-h">指名実況</div>
              <div className="draft-log">
                {log.map((e,i)=>(<div key={i} style={{padding:"6px 8px",marginBottom:4,borderRadius:5,background:e.isMe?"rgba(245,200,66,.08)":"rgba(255,255,255,.02)",borderLeft:`3px solid ${e.isMe?"#f5c842":e.team.color}`}}>
                  <div style={{fontSize:9,color:"#374151"}}>{e.round}巡目 · {e.team.emoji}{e.team.short}</div>
                  <div style={{fontSize:12,fontWeight:e.isMe?700:400,color:e.isMe?"#f5c842":"#e0d4bf"}}>{e.player.name}<span style={{fontSize:9,color:"#374151",marginLeft:6}}>{e.player.pos}/{e.player.age}歳</span></div>
                  <div style={{fontSize:9,color:e.isMe?"#34d399":"#374151",marginTop:1,fontStyle:"italic"}}>{e.comment}</div>
                </div>))}
                {log.length===0&&<div style={{color:"#374151",fontSize:11,padding:"8px"}}>指名待ち…</div>}
              </div>
              {myPicks.length>0&&(<div style={{marginTop:8,borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:8}}>
                <div style={{fontSize:9,color:"#374151",marginBottom:4}}>✅ 自チーム指名済み ({myPicks.length}/{DRAFT_ROUNDS}人)</div>
                {myPicks.map(p=>(<div key={p.id} style={{fontSize:10,color:"#f5c842",padding:"2px 0",display:"flex",gap:6,alignItems:"center"}}>{p.name}{p.isPitcher&&<HandBadge p={p}/>}<span style={{color:"#374151"}}>{p.pos}</span></div>))}
              </div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PLAYOFF SYSTEM
═══════════════════════════════════════════════ */

function DraftReviewScreen({teams,myId,year,pool,drafted,onEnd}){
  const myPicks=pool.filter(p=>drafted[p.id]===myId);
  const undrafted=pool.filter(p=>!drafted[p.id]);
  const [tab,setTab]=useState("myteam");
  const grade=()=>{
    if(!myPicks.length) return{g:"D",c:"指名なし。"};
    const sc=myPicks.reduce((s,p)=>s+p.potential,0)/myPicks.length+(myPicks.some(p=>p.spotlight)?10:0);
    if(sc>=82) return{g:"S",c:"素晴らしい！将来のチームの柱になりうる選手を獲得。完全勝利。"};
    if(sc>=74) return{g:"A",c:"上々のドラフト。ポテンシャルの高い選手を確保できた。"};
    if(sc>=66) return{g:"B",c:"平均的な結果。即戦力と将来性のバランスが取れた指名。"};
    if(sc>=58) return{g:"C",c:"やや物足りない。補強ポイントと合致しない指名もあった。"};
    return{g:"D",c:"厳しい結果。上位候補を逃した可能性が高い。"};
  };
  const pred=p=>{
    if(p.potential>=82) return{label:"💎 大当たり候補",color:"#ffd700"};
    if(p.potential>=74) return{label:"⭐ 当たり候補",color:"#34d399"};
    if(p.potential>=65) return{label:"🔵 普通",color:"#60a5fa"};
    return{label:"⚠️ 外れ候補",color:"#f87171"};
  };
  const {g,c}=grade();
  const gc=g==="S"?"#ffd700":g==="A"?"#34d399":g==="B"?"#60a5fa":g==="C"?"#f5c842":"#f87171";
  const ov=p=>p.isPitcher?Math.round((p.pitching.velocity+p.pitching.control+p.pitching.breaking)/3):Math.round((p.batting.contact+p.batting.power+p.batting.eye+p.batting.speed)/4);
  return(
    <div className="app"><div style={{maxWidth:700,margin:"0 auto",padding:"16px 12px"}}>
      <div style={{textAlign:"center",marginBottom:14}}><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:34,color:"#f5c842"}}>{year+1}年 ドラフト レビュー</div></div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["myteam","🏆 自チーム評価"],["allteams","📋 全球団結果"],["undrafted","😢 指名漏れ"]].map(([k,l])=>(<button key={k} className={"bsm "+(tab===k?"bgb":"bga")} style={{flex:1,padding:"7px 0",fontSize:11}} onClick={()=>setTab(k)}>{l}</button>))}
      </div>
      {tab==="myteam"&&(<>
        <div className="card" style={{marginBottom:10,textAlign:"center"}}>
          <div style={{fontSize:13,color:"#374151",marginBottom:6}}>自チーム ドラフト採点</div>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:72,color:gc,lineHeight:1}}>{g}</div>
          <p style={{color:"#e0d4bf",fontSize:12,marginTop:8,lineHeight:1.6}}>{c}</p>
        </div>
        <div className="card"><div className="card-h">指名選手 &amp; 成長予想メモ</div>
          <p style={{fontSize:10,color:"#374151",marginBottom:8}}>※ポテンシャルに基づく予想。実際の成長は育成次第！</p>
          {myPicks.map(p=>{const pr=pred(p);return(<div key={p.id} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
            <div className="fsb"><div><span style={{fontWeight:700,color:"#f5c842"}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>{p.spotlight&&<span style={{fontSize:9,color:"#f97316",marginLeft:4}}>{p.spotlight}</span>}</div><span style={{fontSize:11,fontWeight:700,color:pr.color}}>{pr.label}</span></div>
            <div style={{fontSize:9,color:"#94a3b8",marginTop:3}}>{p.isPitcher?`球速${p.pitching.velocity} 制球${p.pitching.control} 変化${p.pitching.breaking}`:`ミート${p.batting.contact} 長打${p.batting.power} 走力${p.batting.speed}`}<span style={{color:"#a78bfa",marginLeft:8}}>P:{p.potential}</span></div>
          </div>);})}
        </div>
      </>)}
      {tab==="allteams"&&(<div className="card"><div className="card-h">全球団 指名結果</div>
        {teams.map(t=>{const picks=pool.filter(p=>drafted[p.id]===t.id);const isMe=t.id===myId;return(<div key={t.id} style={{padding:"8px 10px",marginBottom:6,borderRadius:6,background:isMe?"rgba(245,200,66,.05)":"rgba(255,255,255,.02)",border:isMe?"1px solid rgba(245,200,66,.15)":"1px solid rgba(255,255,255,.04)"}}>
          <div style={{fontWeight:700,color:t.color,marginBottom:4}}>{t.emoji} {t.name}{isMe&&<span style={{fontSize:9,color:"#f5c842",marginLeft:6}}>← あなた</span>}</div>
          {picks.length===0?<span style={{fontSize:10,color:"#374151"}}>指名なし</span>:picks.map(p=>(<div key={p.id} style={{fontSize:11,color:isMe?"#f5c842":"#94a3b8",padding:"2px 0",display:"flex",gap:8,alignItems:"center"}}><span>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:9,color:"#374151"}}>{p.pos}/{p.age}歳</span>{p.spotlight&&<span style={{fontSize:8,color:"#f97316"}}>{p.spotlight}</span>}<span style={{fontSize:9,color:"#a78bfa",marginLeft:"auto"}}>P:{p.potential}</span></div>))}
        </div>);})}
      </div>)}
      {tab==="undrafted"&&(<div className="card"><div className="card-h">😢 指名漏れ ({undrafted.length}人)</div>
        {undrafted.slice(0,10).map(p=>(<div key={p.id} style={{padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.04)",display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1}}><span style={{fontWeight:700,fontSize:12}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>{p.spotlight&&<span style={{fontSize:9,color:"#f97316",marginLeft:4}}>{p.spotlight}</span>}<div style={{fontSize:9,color:"#374151",marginTop:2}}>{p.isPitcher?`球速${p.pitching.velocity} 制球${p.pitching.control} 変化${p.pitching.breaking}`:`ミート${p.batting.contact} 長打${p.batting.power} 走力${p.batting.speed}`}</div></div>
          <div style={{textAlign:"right"}}><OV v={ov(p)}/><div style={{fontSize:9,color:"#a78bfa"}}>P:{p.potential}</div></div>
        </div>))}
      </div>)}
      <div style={{textAlign:"center",marginTop:16}}><button className="btn btn-gold" style={{padding:"12px 40px"}} onClick={onEnd}>▶ {year+1}年シーズン開幕！</button></div>
    </div></div>
  );
}



/* ═══ components/PlayoffScreen.jsx ═══ */


function PlayoffScreen({playoff,setPlayoff,teams,myId,year,onFinish}){
  const myTeam=teams.find(t=>t.id===myId);
  const phase=playoff.phase;
  const [simMsg,setSimMsg]=useState(null);

  const simOneGame=(seriesKey,need,nextPhaseBuilder)=>{
    const s=playoff[seriesKey];
    const t0=teams.find(t=>t.id===s.teams[0].id)||s.teams[0];
    const t1=teams.find(t=>t.id===s.teams[1].id)||s.teams[1];
    const r=quickSimGame(t0,t1);
    const my=r.score.my||0;
    const op=r.score.opp||0;
    const scoreStr=my+"-"+op;
    const won0=my>op;
    const nw=[s.wins[0]+(won0?1:0),s.wins[1]+(!won0?1:0)];
    const ng=[...s.games,{score:scoreStr,won0}];
    const w=nw[0]>=need?0:nw[1]>=need?1:null;
    const ns={...s,wins:nw,games:ng,done:w!==null,winner:w};
    const msg=(won0?t0.name:t1.name)+" が勝利！（"+scoreStr+"）"+(w!==null?"→ "+[t0,t1][w].name+"がシリーズ突破！":"");
    setSimMsg(msg);
    if(w!==null&&nextPhaseBuilder){
      const {nextPhase,extra}=nextPhaseBuilder([t0,t1][w],ns);
      setPlayoff(prev=>({...prev,[seriesKey]:ns,...extra,phase:nextPhase}));
    } else {
      setPlayoff(prev=>({...prev,[seriesKey]:ns}));
    }
  };

  const isMyGame=(seriesKey)=>{
    const s=playoff[seriesKey];
    return s&&!s.done&&(s.teams[0].id===myId||s.teams[1].id===myId);
  };

  // 全試合まとめてオートシム
  const simAllRemaining=()=>{
    const order=["cs1_se","cs1_pa","cs2_se","cs2_pa","jpSeries"];
    const needs={cs1_se:2,cs1_pa:2,cs2_se:4,cs2_pa:4,jpSeries:4};
    let state={...playoff};

    const simSeriesAll=(seriesKey,need)=>{
      let s=state[seriesKey];
      if(!s||s.done) return;
      while(!s.done){
        const t0=teams.find(t=>t.id===s.teams[0].id)||s.teams[0];
        const t1=teams.find(t=>t.id===s.teams[1].id)||s.teams[1];
        const r=quickSimGame(t0,t1);
        const my=r.score.my||0;const op=r.score.opp||0;
        const won0=my>op;
        const nw=[s.wins[0]+(won0?1:0),s.wins[1]+(!won0?1:0)];
        const ng=[...s.games,{score:my+"-"+op,won0}];
        const w=nw[0]>=need?0:nw[1]>=need?1:null;
        s={...s,wins:nw,games:ng,done:w!==null,winner:w};
      }
      state[seriesKey]=s;
      return [s.teams[0],s.teams[1]][s.winner];
    };

    // CS1
    const seW1=simSeriesAll("cs1_se",2);
    const paW1=simSeriesAll("cs1_pa",2);

    // CS2（CS1の勝者が確定してから）
    if(seW1&&state.cs1_se&&state.cs1_se.done){
      const cs1Se=state.cs1_se;
      const seTop=cs1Se.teams[0]; // 1位チーム（アドバンテージあり）
      state.cs2_se={label:"CSファイナルステージ（セ）",teams:[seTop,seW1],wins:[1,0],adv:[1,0],games:[],done:false,winner:null};
      simSeriesAll("cs2_se",4);
    }
    if(paW1&&state.cs1_pa&&state.cs1_pa.done){
      const cs1Pa=state.cs1_pa;
      const paTop=cs1Pa.teams[0];
      state.cs2_pa={label:"CSファイナルステージ（パ）",teams:[paTop,paW1],wins:[1,0],adv:[1,0],games:[],done:false,winner:null};
      simSeriesAll("cs2_pa",4);
    }

    // 日本シリーズ
    const seChamp=state.cs2_se&&state.cs2_se.done?[state.cs2_se.teams[0],state.cs2_se.teams[1]][state.cs2_se.winner]:null;
    const paChamp=state.cs2_pa&&state.cs2_pa.done?[state.cs2_pa.teams[0],state.cs2_pa.teams[1]][state.cs2_pa.winner]:null;
    if(seChamp&&paChamp){
      state.jpSeries={label:"日本シリーズ",teams:[seChamp,paChamp],wins:[0,0],adv:[0,0],games:[],done:false,winner:null};
      const jpW=simSeriesAll("jpSeries",4);
      if(jpW) state={...state,champion:jpW,phase:"champion"};
    }

    setPlayoff(state);
    setSimMsg("全試合シミュレーション完了！");
  };

  const renderSeries=(seriesKey,need,label)=>{
    const s=playoff[seriesKey];
    if(!s) return null;
    const t0=s.teams[0];const t1=s.teams[1];
    const active=phase===seriesKey&&!s.done;
    return(
      <div className="card" style={{marginBottom:8,border:active?"1px solid rgba(245,200,66,.3)":"1px solid rgba(255,255,255,.06)"}}>
        <div style={{fontSize:10,color:"#f5c842",fontWeight:700,marginBottom:6}}>{s.label}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:8,marginBottom:8}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:12,fontWeight:700,color:t0.color}}>{t0.emoji} {t0.short||t0.name}</div>
            {s.adv[0]>0&&<div style={{fontSize:9,color:"#94a3b8"}}>({s.adv[0]}勝アドバンテージ)</div>}
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:700,color:"#f5c842"}}>{s.wins[0]} - {s.wins[1]}</div>
            <div style={{fontSize:9,color:"#374151"}}>先に{need}勝</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:12,fontWeight:700,color:t1.color}}>{t1.emoji} {t1.short||t1.name}</div>
          </div>
        </div>
        {s.games.length>0&&(
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
            {s.games.map((g,i)=><span key={i} style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:g.won0?"rgba(59,130,246,.2)":"rgba(239,68,68,.2)",color:g.won0?"#60a5fa":"#f87171"}}>{g.score}</span>)}
          </div>
        )}
        {s.done&&<div style={{fontSize:11,color:"#34d399",textAlign:"center"}}>✅ {[t0,t1][s.winner].name} 突破！</div>}
        {active&&(
          <button className="btn btn-gold" style={{width:"100%",marginTop:6}} onClick={()=>{
            const need2=seriesKey==="cs1_se"||seriesKey==="cs1_pa"?2:seriesKey==="jpSeries"?4:4;
            const nextPhaseBuilder=
              seriesKey==="cs1_se"?((w)=>({nextPhase:"cs1_pa",extra:{cs2_se:{...{label:"CSファイナルステージ（セ）",teams:[playoff.se1,w],wins:[1,0],adv:[1,0],games:[],done:false,winner:null}}}})):
              seriesKey==="cs1_pa"?((w)=>({nextPhase:"cs2_se",extra:{cs2_pa:{...{label:"CSファイナルステージ（パ）",teams:[playoff.pa1,w],wins:[1,0],adv:[1,0],games:[],done:false,winner:null}}}})):
              seriesKey==="cs2_se"?((w,s)=>({nextPhase:"cs2_pa",extra:{}})):
              seriesKey==="cs2_pa"?((w,s)=>{
                const seChamp=playoff.cs2_se?[playoff.cs2_se.teams[0],playoff.cs2_se.teams[1]][playoff.cs2_se.winner]:playoff.se1;
                return{nextPhase:"jpSeries",extra:{jpSeries:{label:"日本シリーズ",teams:[seChamp,w],wins:[0,0],adv:[0,0],games:[],done:false,winner:null}}};
              }):
              seriesKey==="jpSeries"?((w)=>({nextPhase:"champion",extra:{champion:w}})):null;
            simOneGame(seriesKey,need2,nextPhaseBuilder?((w,sNew)=>nextPhaseBuilder(w,sNew)):null);
          }}>
            {isMyGame(seriesKey)?"⚾ 試合を行う（自動シム）":"⚾ 試合を進める"}
          </button>
        )}
      </div>
    );
  };

  if(phase==="champion"&&playoff.champion){
    const champ=playoff.champion;
    const isMe=champ.id===myId;
    return(
      <div className="app"><div style={{maxWidth:580,margin:"0 auto",padding:"40px 20px",textAlign:"center"}}>
        <div style={{fontSize:64,marginBottom:10}}>🏆</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:48,color:"#f5c842",letterSpacing:".1em",marginBottom:8}}>{year}年 日本一！</div>
        <div style={{fontSize:20,color:champ.color,fontWeight:700,marginBottom:4}}>{champ.emoji} {champ.name}</div>
        {isMe&&<div style={{fontSize:16,color:"#34d399",margin:"12px 0"}}>おめでとうございます！日本一達成！🎊</div>}
        {!isMe&&<div style={{fontSize:13,color:"#94a3b8",margin:"12px 0"}}>あなたのチームは今年の頂点には届きませんでした。</div>}
        <button className="btn btn-gold" style={{padding:"12px 36px",marginTop:16}} onClick={onFinish}>⚾ 引退フェーズへ →</button>
      </div></div>
    );
  }

  return(
    <div className="app"><div style={{maxWidth:580,margin:"0 auto",padding:"20px"}}>
      <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:32,color:"#f5c842",letterSpacing:".1em",marginBottom:16,textAlign:"center"}}>🏆 {year}年 ポストシーズン</div>
      {simMsg&&<div style={{padding:"8px 12px",borderRadius:6,background:"rgba(245,200,66,.08)",border:"1px solid rgba(245,200,66,.2)",fontSize:11,color:"#f5c842",marginBottom:10,textAlign:"center"}}>{simMsg}</div>}
      <button className="bsm bga" style={{width:"100%",padding:"8px 0",marginBottom:10,fontSize:11}} onClick={simAllRemaining}>
        ⚡ 全試合まとめてオートシム
      </button>
      {renderSeries("cs1_se",2)}
      {renderSeries("cs1_pa",2)}
      {playoff.cs2_se&&renderSeries("cs2_se",4)}
      {playoff.cs2_pa&&renderSeries("cs2_pa",4)}
      {playoff.jpSeries&&renderSeries("jpSeries",4)}
    </div></div>
  );
}



/* ═══ App.jsx ═══ */

/* ═══════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════ */

// Constants

// Utils

// Engine

// Components

const INIT_TEAMS=TEAM_DEFS.map(function(d){const t=buildTeam(d);t.history=[];return t;});

function LoadConfirmScreen({ onContinue, onNewGame }) {
  const saved = loadSaveData();
  if (!saved) { onNewGame(); return null; }

  const { data } = saved;
  const team = TEAM_DEFS.find(t => t.id === data.myId);
  const savedDate = new Date(saved.savedAt).toLocaleString('ja-JP');
  const leagueTeams = TEAM_DEFS.filter(t => t.league === team?.league)
    .sort((a, b) => {
      const ta = data.teams.find(x => x.id === a.id);
      const tb = data.teams.find(x => x.id === b.id);
      return (tb?.wins ?? 0) - (ta?.wins ?? 0);
    });
  const rank = leagueTeams.findIndex(t => t.id === data.myId) + 1;
  const myTeamData = data.teams.find(t => t.id === data.myId);

  return (
    <div className="app">
      <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px 16px'}}>
        <div style={{fontSize:11,color:'#374151',letterSpacing:'.2em',marginBottom:16}}>SAVE DATA FOUND</div>

        <div style={{background:'#0b1c30',border:'1px solid rgba(255,255,255,.1)',borderRadius:12,padding:'20px 24px',maxWidth:360,width:'100%',marginBottom:24}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
            <span style={{fontSize:28}}>{team?.emoji}</span>
            <div>
              <div style={{fontWeight:700,fontSize:15,color: team?.color}}>{team?.name}</div>
              <div style={{fontSize:11,color:'#374151'}}>{data.year}年 / 第{data.gameDay}戦</div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,fontSize:12,textAlign:'center'}}>
            <div style={{background:'rgba(255,255,255,.04)',borderRadius:8,padding:'8px 4px'}}>
              <div style={{color:'#374151',fontSize:10,marginBottom:4}}>成績</div>
              <div style={{color:'#c0cfe0',fontWeight:700}}>{myTeamData?.wins}勝{myTeamData?.losses}敗</div>
            </div>
            <div style={{background:'rgba(255,255,255,.04)',borderRadius:8,padding:'8px 4px'}}>
              <div style={{color:'#374151',fontSize:10,marginBottom:4}}>順位</div>
              <div style={{color:'#f5c842',fontWeight:700}}>{rank}位</div>
            </div>
            <div style={{background:'rgba(255,255,255,.04)',borderRadius:8,padding:'8px 4px'}}>
              <div style={{color:'#374151',fontSize:10,marginBottom:4}}>選手数</div>
              <div style={{color:'#c0cfe0',fontWeight:700}}>{myTeamData?.players?.length}人</div>
            </div>
          </div>
          <div style={{fontSize:10,color:'#374151',marginTop:12,textAlign:'right'}}>保存日時: {savedDate}</div>
        </div>

        <button
          className="btn btn-gold"
          style={{width:'100%',maxWidth:360,marginBottom:10,padding:'14px'}}
          onClick={onContinue}
        >
          ▶ 続きからプレイ
        </button>
        <button
          style={{width:'100%',maxWidth:360,background:'transparent',border:'1px solid rgba(255,255,255,.15)',borderRadius:8,padding:'12px',color:'#374151',cursor:'pointer',fontSize:13}}
          onClick={onNewGame}
        >
          新規ゲーム開始
        </button>
        <div style={{fontSize:10,color:'#374151',marginTop:8}}>※ 新規開始してもセーブデータは削除されません</div>
      </div>
    </div>
  );
}

export default function App(){
  const [screen,setScreen]=useState("title");
  const [retireModal,setRetireModal]=useState(null); // {player,type:"announce"|"season_end"}
  const [retireGamePlayer,setRetireGamePlayer]=useState(null); // 引退試合対象選手
  const [retireRole,setRetireRole]=useState(null); // "starter"|"reliever"|"pinch"|"runner"
  const [teams,setTeams]=useState(INIT_TEAMS);
  const [myId,setMyId]=useState(null);
  const [tab,setTab]=useState("roster");
  const [gameDay,setGameDay]=useState(1);
  const [year,setYear]=useState(2025);
  const [gameResult,setGameResult]=useState(null);
  const [faPool,setFaPool]=useState([]);
  const [notif,setNotif]=useState(null);
  const [currentOpp,setCurrentOpp]=useState(null);
  const [gameMode,setGameMode]=useState(null); // "tactical"|"auto"
  const [batchResults,setBatchResults]=useState([]);

  const myTeam=useMemo(()=>teams.find(t=>t.id===myId),[teams,myId]);
  const notify=useCallback((msg,type="ok")=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3500);},[]);
  const upd=useCallback((id,fn)=>setTeams(prev=>prev.map(t=>t.id===id?fn(t):t)),[]);

  const addToHistory=(teamId,player,exitReason)=>{
    if(!player) return;
    setTeams(prev=>prev.map(function(t){
      if(t.id!==teamId) return t;
      const joinYear=(player.careerLog&&player.careerLog.length>0)?player.careerLog[0].year:0;
      const tenure=joinYear>0?year-joinYear+1:1;
      const record=Object.assign({},player,{exitYear:year,exitReason:exitReason,tenure:tenure});
      return Object.assign({},t,{history:[...(t.history||[]),record]});
    }));
  };

  const handleSelect=id=>{setMyId(id);setScreen("hub");setTab("roster");};

  // Pick opponent and go to mode select
  const handleStartGame=()=>{
    if(!myTeam) return;
    const sameLeague=teams.filter(t=>t.id!==myId&&t.league===myTeam.league);
    const opp=sameLeague[rng(0,sameLeague.length-1)];
    // CPU vs CPU for other games
    let newTeams=[...teams];
    const others=newTeams.filter(t=>t.id!==myId&&t.id!==opp.id);
    for(let i=0;i<others.length-1;i+=2){
      const a=newTeams.find(t=>t.id===others[i].id);
      const b=newTeams.find(t=>t.id===others[i+1]?.id);
      if(!a||!b) continue;
      const r=quickSimGame(a,b);
      if(r.won){a.wins++;a.rf+=r.score.my;a.ra+=r.score.opp;b.losses++;b.rf+=r.score.opp;b.ra+=r.score.my;}
      else{b.wins++;b.rf+=r.score.opp;b.ra+=r.score.my;a.losses++;a.rf+=r.score.my;a.ra+=r.score.opp;}
    }
    setTeams(newTeams);
    setCurrentOpp(opp);
    setScreen("mode_select");
  };

  // Mode selected → start appropriate game type
  const handleModeSelect=mode=>{
    setGameMode(mode);
    if(mode==="tactical"){
      setScreen("tactical_game");
    } else {
      // Auto-sim: run instantly
      const myT=teams.find(t=>t.id===myId);
      const r=quickSimGame(myT,currentOpp);
      handleAutoSimEnd(r);
    }
  };

  // Auto sim result handler
  const handleAutoSimEnd=r=>{
    const myT=teams.find(t=>t.id===myId);
    if(!myT) return;
    const won=r.score.my>r.score.opp;
    upd(myId,t=>{
      let updated={...t,
        wins:t.wins+(won?1:0),losses:t.losses+(won?0:1),
        rf:t.rf+r.score.my,ra:t.ra+r.score.opp,
        rotIdx:t.rotIdx+1,
      };
      updated.players=applyGameStatsFromLog(updated.players, r.log||[], true, won);
      updated.players=applyPostGameCondition(updated.players, r.log||[], true);
      const rev=calcRevenue(updated);
      updated.budget+=rev.ticket+rev.sponsor+rev.merch;
      return updated;
    });
    setGameResult({score:r.score,won,log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:currentOpp});
    tryGenCpuOffer();
    // 引退表明ランダム発生
    if(Math.random()<0.04&&myTeam){
      const cands=myTeam.players.filter(p=>p.age>=35&&!p._retireNow&&calcRetireWill(p)>=40);
      if(cands.length>0){
        const rp=cands[rng(0,cands.length-1)];
        setRetireModal({player:rp,type:"announce"});
        addNews({type:"season",headline:"【引退表明】"+rp.name+"選手が今季限りでの引退を示唆",source:"スポーツ報知",dateLabel:year+"年 "+gameDay+"日目",body:rp.name+"選手（"+rp.age+"歳）が引退を示唆するコメントを発表した。チーム関係者は今後の対応を検討している。"});
      }
    }
    const _tmpl=won?NEWS_TEMPLATES_WIN:NEWS_TEMPLATES_LOSE;
    const _hl=_tmpl[rng(0,_tmpl.length-1)].replace("{team}",myTeam?.name||"自チーム").replace("{opp}",currentOpp?.name||"相手").replace("{score}",r.score);
    addNews({type:"game",headline:_hl,source:"スポーツ報知",dateLabel:year+"年 "+gameDay+"日目",body:(won?myTeam?.name+"が"+currentOpp?.name+"に"+r.score+"で勝利した。\n\n投打ともに噛み合い、理想的な試合運びで勝点を積み上げた。":myTeam?.name+"は"+currentOpp?.name+"に"+r.score+"で敗れた。\n\n流れを引き戻せず、次戦での巻き返しが期待される。")});
    if(Math.random()<0.2){
      const _qs=won?INTERVIEW_QUESTIONS_WIN:INTERVIEW_QUESTIONS_LOSE;
      const _opts=won?INTERVIEW_OPTIONS_WIN:INTERVIEW_OPTIONS_LOSE;
      addNews({type:"interview",headline:"【インタビュー】"+(myTeam?.name||"")+"監督に直撃！",source:"野球速報",dateLabel:year+"年 "+gameDay+"日目",body:"試合後、記者団が監督にコメントを求めた。",question:_qs[rng(0,_qs.length-1)],options:_opts});
    }
    setGameDay(d=>d+1);
    if(gameDay>=SEASON_GAMES){setPlayoff(initPlayoff(teams));setScreen("playoff");}
    else setScreen("result");
  };

  // 5試合まとめてオートシム
  const handleBatchSim=()=>{
    if(!myTeam) return;
    const count=Math.min(BATCH, SEASON_GAMES-(gameDay-1));
    if(count<=0) return;
    runBatchGames(count);
  };

  // 残り全試合まとめてオートシム
  const handleSeasonSim=()=>{
    if(!myTeam) return;
    const count=SEASON_GAMES-(gameDay-1);
    if(count<=0) return;
    runBatchGames(count);
  };

  // バッチ処理の共通ロジック
  const runBatchGames=(count)=>{
    if(!myTeam) return;
    const sameLeague=teams.filter(t=>t.id!==myId&&t.league===myTeam.league);
    let newTeams=[...teams.map(t=>({...t,players:[...t.players.map(p=>({...p,stats:{...p.stats}}))],...(t.id===myId?{}:{})}))];
    const results=[];
    let newDay=gameDay;

    for(let g=0;g<count;g++){
      const opp=sameLeague[rng(0,sameLeague.length-1)];
      // CPU vs CPU
      const others=newTeams.filter(t=>t.id!==myId&&t.id!==opp.id);
      for(let i=0;i<others.length-1;i+=2){
        const a=newTeams.find(t=>t.id===others[i].id);
        const b=newTeams.find(t=>t.id===others[i+1]?.id);
        if(!a||!b) continue;
        const r=quickSimGame(a,b);
        if(r.won){a.wins++;a.rf+=r.score.my;a.ra+=r.score.opp;b.losses++;b.rf+=r.score.opp;b.ra+=r.score.my;}
        else{b.wins++;b.rf+=r.score.opp;b.ra+=r.score.my;a.losses++;a.rf+=r.score.my;a.ra+=r.score.opp;}
      }
      // 自チームの試合
      const myT=newTeams.find(t=>t.id===myId);
      const r=quickSimGame(myT,opp);
      const won=r.score.my>r.score.opp;
      if(won){myT.wins++;myT.rf+=r.score.my;myT.ra+=r.score.opp;}
      else{myT.losses++;myT.rf+=r.score.my;myT.ra+=r.score.opp;}
      myT.rotIdx++;
      myT.players=applyGameStatsFromLog(myT.players, r.log||[], true, won);
      myT.players=applyPostGameCondition(myT.players, r.log||[], true);
      results.push({...r,won,oppTeam:opp,gameNo:newDay});
      newDay++;
    }

    // 収益更新
    const myFinal=newTeams.find(t=>t.id===myId);
    for(let g=0;g<count;g++){
      const rev=calcRevenue(myFinal);
      myFinal.budget+=rev.ticket+rev.sponsor+rev.merch;
    }

    setTeams(newTeams);
    setGameDay(newDay);
    setBatchResults(results);
    if(newDay-1>=SEASON_GAMES){setPlayoff(initPlayoff(teams));setScreen("playoff");}
    else setScreen("batch_result");
  };

  // Game over callback from TacticalGameScreen
  const handleTacticalGameEnd=gsResult=>{
    if(!myTeam||!currentOpp) return;
    const won=gsResult.score.my>gsResult.score.opp;
    upd(myId,t=>{
      let updated={...t,
        wins:t.wins+(won?1:0),losses:t.losses+(won?0:1),
        rf:t.rf+gsResult.score.my,ra:t.ra+gsResult.score.opp,
        rotIdx:t.rotIdx+1,
      };
      updated.players=applyGameStatsFromLog(updated.players, gsResult.log, true, won);
      updated.players=applyPostGameCondition(updated.players, gsResult.log, true);
      const rev=calcRevenue(updated);
      updated.budget+=rev.ticket+rev.sponsor+rev.merch;
      return updated;
    });
    setGameResult({...gsResult,oppTeam:currentOpp,won});
    setGameDay(d=>d+1);
    if(gameDay>=SEASON_GAMES){setPlayoff(initPlayoff(teams));setScreen("playoff");}
    else setScreen("result");
  };

  const toggleLineup=pid=>{
    if(!myTeam) return;
    const inL=myTeam.lineup.includes(pid);
    const p=myTeam.players.find(x=>x.id===pid);
    if(p?.isPitcher){notify("投手は打線に入れられません","warn");return;}
    if(p?.injury){notify("故障中は出場不可","warn");return;}
    if(!inL&&myTeam.lineup.length>=9){notify("打線は最大9人です","warn");return;}
    if(inL&&myTeam.lineup.length<=4){notify("最低4人必要です","warn");return;}
    upd(myId,t=>({...t,lineup:inL?t.lineup.filter(id=>id!==pid):[...t.lineup,pid]}));
  };
  const setStarter=pid=>{upd(myId,t=>({...t,rotation:t.rotation.includes(pid)?t.rotation:[...t.rotation,pid]}));notify("先発ローテに追加","ok");};
  const promote=pid=>{if(!myTeam) return;const p=myTeam.farm.find(x=>x.id===pid);if(!p) return;if(myTeam.players.length>=MAX_ROSTER){notify("一軍枠満杯","warn");return;}upd(myId,t=>({...t,players:[...t.players,p],farm:t.farm.filter(x=>x.id!==pid)}));notify(`${p.name}を一軍昇格！`,"ok");};
  const demote=pid=>{if(!myTeam) return;const p=myTeam.players.find(x=>x.id===pid);if(!p) return;if(myTeam.farm.length>=MAX_FARM){notify("二軍満杯","warn");return;}upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid),lineup:t.lineup.filter(id=>id!==pid),rotation:t.rotation.filter(id=>id!==pid),farm:[...t.farm,p]}));notify(`${p.name}を二軍降格`,"warn");};
  const hireCoach=(cd,cg)=>{if(!myTeam||myTeam.budget<cg.salary*12){notify("予算不足","warn");return;}upd(myId,t=>({...t,budget:t.budget-cg.salary*12,coaches:[...t.coaches,{type:cd.type,typeName:cd.name,emoji:cd.emoji,name:pname(),grade:cg.g,label:cg.label,salary:cg.salary*12,bonus:cg.bonus}]}));notify(`${cd.name}(Lv${cg.g})を雇いました！`,"ok");};
  const fireCoach=idx=>{upd(myId,t=>({...t,coaches:t.coaches.filter((_,i)=>i!==idx)}));notify("コーチを解雇","warn");};

  const sendScout=region=>{
    if(!myTeam||myTeam.budget<region.cost){notify("予算不足","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-region.cost,scoutMissions:[...t.scoutMissions,{id:uid(),name:region.name,weeksLeft:region.weeks,qMin:region.qMin,qMax:region.qMax,cost:region.cost,foreign:region.foreign}]}));
    notify(`${region.name}へスカウト派遣！`,"ok");
    setTimeout(()=>{
      upd(myId,t=>{const mis=t.scoutMissions.find(m=>m.name===region.name);if(!mis) return t;const np=makePlayer(Math.random()<0.4?"先発":POSITIONS[rng(0,7)],rng(mis.qMin,mis.qMax),Math.random()<0.4,undefined,mis.foreign&&Math.random()<0.7);return{...t,scoutMissions:t.scoutMissions.filter(m=>m!==mis),scoutResults:[...t.scoutResults,np]};});
      notify("スカウト報告が届きました！","ok");
    },3000);
  };
  const signPlayer=idx=>{if(!myTeam) return;const p=myTeam.scoutResults[idx];if(!p||myTeam.budget<p.salary){notify("予算不足","warn");return;}if(myTeam.farm.length>=MAX_FARM){notify("二軍枠満杯","warn");return;}upd(myId,t=>({...t,budget:t.budget-p.salary,farm:[...t.farm,{...p,contractYearsLeft:2}],scoutResults:t.scoutResults.filter((_,i)=>i!==idx)}));notify(`${p.name}を獲得！`,"ok");};
  const handleContractOffer=(pid,sal,yrs)=>{
    const p=myTeam?.players.find(x=>x.id===pid);if(!p) return;
    const r=evalOffer(p,{salary:sal,years:yrs},myTeam,teams);
    if(r.total>=ACCEPT_THRESHOLD){upd(myId,t=>({...t,players:t.players.map(x=>x.id===pid?{...x,salary:sal,contractYears:yrs,contractYearsLeft:yrs}:x)}));notify(`✅ ${p.name}が合意 (${r.total})`,"ok");}
    else{addToHistory(myId,p,"FA移籍");upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid)}));setFaPool(prev=>[...prev,{...p,isFA:true,highestBid:0}]);notify(`❌ ${p.name}がFA宣言 (${r.total})`,"warn");}
  };
  const addNews=(article)=>{
    setNews(prev=>[{id:uid(),timestamp:Date.now(),...article},...prev].slice(0,50));
  };
  const handleInterview=(newsId,opt)=>{
    upd(myId,t=>({...t,popularity:clamp((t.popularity||50)+opt.popMod,0,100),players:t.players.map(p=>({...p,morale:clamp((p.morale||60)+opt.moraleMod,0,100)}))}));
    notify("回答しました！ 人気"+(opt.popMod>=0?"+":"")+opt.popMod+" モラル"+(opt.moraleMod>=0?"+":"")+opt.moraleMod,"ok");
  };
  const handleTrade=(myOut,theirIn,tgtTeam,cash)=>{
    myOut.forEach(function(p){addToHistory(myId,p,"トレード");});
    setTeams(prev=>prev.map(t=>{
      if(t.id===myId){
        const np=[...t.players.filter(p=>!myOut.find(x=>x.id===p.id)),...theirIn];
        let nl=t.lineup.filter(id=>!myOut.find(x=>x.id===id));
        let nr=t.rotation.filter(id=>!myOut.find(x=>x.id===id));
        theirIn.filter(p=>!p.isPitcher).forEach(p=>{if(nl.length<9)nl=[...nl,p.id];});
        theirIn.filter(p=>p.isPitcher&&p.subtype==="先発").forEach(p=>{if(nr.length<6)nr=[...nr,p.id];});
        return{...t,players:np,lineup:nl,rotation:nr,budget:t.budget-(cash||0)*10000};
      }
      if(t.id===tgtTeam.id) return{...t,players:[...t.players.filter(p=>!theirIn.find(x=>x.id===p.id)),...myOut],budget:t.budget+(cash||0)*10000};
      return t;
    }));
    setCpuTradeOffers([]);
    notify("🔄 トレード成立！","ok");
    addNews({type:"trade",headline:"【移籍】"+(theirIn.map(p=>p.name).join("、")||"選手")+"が"+(myTeam?.name||"")+"へ",source:"Baseball Times",dateLabel:year+"年 "+gameDay+"日目",body:(myTeam?.name||"自チーム")+"と"+(tgtTeam?.name||"相手")+"の間でトレードが成立。"+(myTeam?.name||"")+"は"+(theirIn.map(p=>p.name).join("、")||"選手")+"を獲得し、"+(myOut.map(p=>p.name).join("、")||"選手")+"を放出した。"+(cash&&cash>0?"\nなお"+Math.abs(cash).toLocaleString()+"万円の金銭も含まれる。":"")});
  };
  const acceptCpuOffer=(idx)=>{const o=cpuTradeOffers[idx];if(!o)return;handleTrade(o.want,o.offer,o.from,-(o.cash||0)/10000);};
  const declineCpuOffer=(idx)=>{setCpuTradeOffers(prev=>prev.filter((_,i)=>i!==idx));notify("オファーを断りました","warn");};
  const tryGenCpuOffer=()=>{
    if(Math.random()>0.05||cpuTradeOffers.length>=2||!myTeam) return;
    const others=teams.filter(t=>t.id!==myId);
    const cpu=others[rng(0,others.length-1)];
    const o=generateCpuOffer(cpu,myTeam);
    if(o) setCpuTradeOffers(prev=>[...prev,o]);
  };
  const handleMailRead=(id)=>{
    setMailbox(prev=>prev.map(m=>m.id===id?{...m,read:true}:m));
  };
  const handleMailAction=(id,action)=>{
    const mail=mailbox.find(m=>m.id===id);
    if(!mail||!mail.offer) return;
    if(action==="accept"){
      handleTrade(mail.offer.want,mail.offer.offer,mail.offer.from,-(mail.offer.cash||0)/10000);
    } else {
      notify('オファーを断りました','warn');
    }
    setMailbox(prev=>prev.map(m=>m.id===id?{...m,resolved:true,read:true}:m));
  };
  const tryGenerateCpuOffer=()=>{
    if(Math.random()>0.05||cpuTradeOffers.length>=2||!myTeam) return;
    const others=teams.filter(t=>t.id!==myId);
    if(!others.length) return;
    const cpuTeam=others[rng(0,others.length-1)];
    const offer=generateCpuOffer(cpuTeam,myTeam);
    if(offer){
      const mail={
        id:uid(),
        type:"trade",
        title:`${offer.from.name}からトレードオファー`,
        from:offer.from.name,
        dateLabel:`${year}年 ${gameDay}日目`,
        timestamp:Date.now(),
        read:false,
        resolved:false,
        body:`${offer.from.name}より交渉の申し入れがありました。\n\n■ あなたが出す: ${offer.want.map(p=>p.name).join('、')}\n■ 受け取る: ${offer.offer.length>0?offer.offer.map(p=>p.name).join('、'):'なし'}${offer.cash>0?'\n■ 金銭: +'+(offer.cash/10000).toLocaleString()+'万円':''}\n\n期限内にご検討ください。`,
        offer
      };
      setMailbox(prev=>[...prev,mail]);
      notify(offer.from.name+'からトレードオファーが届きました！','ok');
    }
  };

  // 引退モーダル：引き留め
  const handleRetain=(p)=>{
    const success=Math.random()*100>(p.retireStyle||50);
    if(success){
      notify(p.name+"の引き留めに成功！","ok");
      upd(myId,t=>({...t,players:t.players.map(x=>x.id===p.id?{...x,morale:Math.min(100,(x.morale||60)+10)}:x)}));
      addNews({type:"season",headline:"【慰留成功】"+p.name+"選手が引退撤回",source:"スポーツ報知",dateLabel:year+"年 "+gameDay+"日目",body:p.name+"選手が引退を撤回し、来季も続投することが決まった。"});
    } else {
      notify(p.name+"の引き留めに失敗…","warn");
      addNews({type:"season",headline:"【引退】"+p.name+"選手が引退を決意",source:"スポーツ報知",dateLabel:year+"年 "+gameDay+"日目",body:p.name+"選手は引退の意志を固め、今季限りで現役を退くことになった。"});
      setRetireModal({player:p,type:"retire_game"});
      return;
    }
    setRetireModal(null);
  };
  // 引退受け入れ→引退試合画面へ
  const handleAcceptRetire=(p)=>{
    setRetireModal({player:p,type:"retire_game"});
  };
  // 引退試合実施
  const handleStartRetireGame=(p)=>{
    upd(myId,t=>({...t,budget:t.budget+50000,players:t.players.map(x=>x.id===p.id?{...x,_retireRole:retireRole}:x)}));
    setRetireGamePlayer(p);
    setRetireModal(null);
    notify(p.name+"の引退試合！観客収入2倍","ok");
    addNews({type:"season",headline:"【引退試合】"+p.name+"選手の引退試合が開催",source:"野球速報",dateLabel:year+"年 "+gameDay+"日目",body:"満員の観衆が見守る中、"+p.name+"選手の引退試合が行われた。"});
  };
  // 引退試合なし
  const handleSkipRetireGame=(p)=>{
    upd(myId,t=>({...t,players:t.players.map(x=>x.id===p.id?{...x,isRetired:true,_retireNow:true}:x)}));
    setRetireModal(null);
    notify(p.name+"が引退しました","warn");
  };

  const handleNextYear=()=>{
    setYear(y=>y+1);setGameDay(1);setFaPool([]);setTeams(prev=>prev.map(t=>({...t,wins:0,losses:0,draws:0,rf:0,ra:0,rotIdx:0,players:t.players.filter(p=>!p._retireNow).map(p=>({...p,age:p.age+1,stats:emptyStats(),playoffStats:emptyStats(),injury:null,condition:clamp(p.condition+20,60,100),contractYearsLeft:Math.max(0,p.contractYearsLeft-1),growthPhase:p.age+1<=24?"growth":p.age+1<=30?"peak":"decline",retireStyle:p.retireStyle!==undefined?p.retireStyle:(p.age+1>=35?rng(0,100):undefined),careerLog:[...(p.careerLog||[]),{year,stats:{...p.stats},playoffStats:{...(p.playoffStats||emptyStats())}}]})),farm:t.farm.map(p=>({...p,age:p.age+1,stats:emptyStats(),injury:null}))})));setScreen("hub");setTab("roster");notify(`${year+1}年シーズン開幕！`,"ok");};

  const [news,setNews]=useState([]);
  const [mailbox,setMailbox]=useState([]);
  const [cpuTradeOffers,setCpuTradeOffers]=useState([]);
  const [draftPool,setDraftPool]=useState(null);
  const [draftResult,setDraftResult]=useState(null);
  const [playoff,setPlayoff]=useState(null);

  // 起動時にセーブデータを確認し、あれば "load_confirm" 画面を表示
  useEffect(() => {
    const saved = loadSaveData();
    if (saved) {
      setScreen('load_confirm');
    }
  }, []); // 初回のみ

  useEffect(() => {
    if (!myId) return; // 球団未選択時はスキップ
    const savePayload = buildSaveData({ teams, myId, gameDay, year, faPool, news, mailbox, cpuTradeOffers });
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(savePayload));
    } catch { /* 容量不足等は無視 */ }
  }, [gameDay]);

  // initDraftPool is imported from engine/draft.js
  const handleDraftComplete=(pl,dr)=>{
    const myPicks=pl.filter(p=>dr[p.id]===myId);
    setTeams(prev=>prev.map(t=>{if(t.id!==myId) return t;return{...t,farm:[...t.farm,...myPicks.map(p=>({...p,育成:true}))]};}));
    handleNextYear();
  };

  // ── RENDER ──
  if (screen === 'load_confirm') return (
    <>
      <style>{G}</style>
      <LoadConfirmScreen
        onContinue={() => {
          const saved = loadSaveData();
          if (!saved) { setScreen('title'); return; }
          const { data } = saved;
          setTeams(data.teams);
          setMyId(data.myId);
          setGameDay(data.gameDay);
          setYear(data.year);
          setFaPool(data.faPool || []);
          setNews(data.news || []);
          setMailbox(data.mailbox || []);
          setCpuTradeOffers(data.cpuTradeOffers || []);
          setScreen('hub');
          setTab('roster');
        }}
        onNewGame={() => setScreen('title')}
      />
    </>
  );

  if(screen==="title") return(<><style>{G}</style><div className="app"><div className="title"><div className="tlogo">⚾ BASEBALL<br/>MANAGER 2025</div><div className="tsub">NPB SIMULATION v2.1 — TACTICAL MODE</div><div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,zIndex:1,position:"relative"}}>◈ セントラルリーグ</div><div className="tgrid" style={{marginBottom:14}}>{TEAM_DEFS.filter(t=>t.league==="セ").map(t=><div key={t.id} className="tcard" style={{"--c":t.color}} onClick={()=>handleSelect(t.id)}><span style={{fontSize:24,display:"block",marginBottom:5}}>{t.emoji}</span><div className="tcard-nm">{t.name}</div></div>)}</div><div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,zIndex:1,position:"relative"}}>◈ パシフィックリーグ</div><div className="tgrid">{TEAM_DEFS.filter(t=>t.league==="パ").map(t=><div key={t.id} className="tcard" style={{"--c":t.color}} onClick={()=>handleSelect(t.id)}><span style={{fontSize:24,display:"block",marginBottom:5}}>{t.emoji}</span><div className="tcard-nm">{t.name}</div></div>)}</div></div></div></>);

  if(screen==="mode_select") return(<><style>{G}</style><ModeSelectScreen myTeam={myTeam} oppTeam={currentOpp} onSelect={handleModeSelect} onBack={()=>setScreen("hub")}/></>);
  if(screen==="tactical_game"&&currentOpp) return(<><style>{G}</style><TacticalGameScreen myTeam={myTeam} oppTeam={currentOpp} onGameEnd={handleTacticalGameEnd}/></>);
  if(screen==="batch_result") return(<><style>{G}</style><BatchResultScreen results={batchResults} myTeam={myTeam} onEnd={()=>setScreen("hub")}/></>);

  if(screen==="result"&&gameResult) return(<><style>{G}</style><ResultScreen gsResult={gameResult} myTeam={myTeam} oppTeam={gameResult.oppTeam} gameDay={gameDay-1} onNext={()=>setScreen("hub")}/></>);

  if(screen==="retire_phase") return(<><style>{G}</style><RetirePhaseScreen teams={teams} myId={myId} year={year} onNext={(decisions)=>{
    // 引退処理
    if(decisions){Object.entries(decisions).forEach(function(e){const pid=e[0];const dec=e[1];const p=myTeam?.players.find(function(x){return x.id===pid;});if(!p) return;if(dec==="accepted"||dec==="retain_failed"){upd(myId,function(t){return{...t,players:t.players.map(function(x){return x.id===pid?{...x,isRetired:true,_retireNow:true}:x;})};});addToHistory(myId,p,"引退");addNews({type:"season",headline:"【引退】"+p.name+"選手が現役引退",source:"野球速報",dateLabel:year+"年",body:p.name+"選手（"+p.age+"歳）が"+year+"年シーズンをもって現役を引退した。"});}else if(dec==="retained"){notify(p.name+"の引き留め成功！","ok");}});
    }
    // 他チーム引退
    teams.filter(t=>t.id!==myId).forEach(t=>{t.players.filter(p=>p.age>=35&&rollRetire(p)).forEach(p=>{addNews({type:"season",headline:"【引退】"+p.name+"（"+t.name+"）が引退",source:"野球速報",dateLabel:year+"年",body:p.name+"選手が引退を発表。"});});});
    setScreen("waiver_phase");
  }}/></> );
  if(screen==="waiver_phase") return(<><style>{G}</style><WaiverPhaseScreen teams={teams} myId={myId} year={year} onRelease={(pid)=>{const p=myTeam?.players.find(x=>x.id===pid);upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid)}));if(p) setFaPool(prev=>[...prev,{...p,isFA:true}]);}} onNext={(markedIds)=>{markedIds.forEach(pid=>{const p=myTeam?.players.find(x=>x.id===pid);upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid)}));if(p){addToHistory(myId,p,"戦力外");setFaPool(prev=>[...prev,{...p,isFA:true}]);addNews({type:"season",headline:"【戦力外】"+p.name+"選手に戦力外通告",source:"野球速報",dateLabel:year+"年",body:p.name+"選手（"+p.age+"歳）が戦力外通告を受けた。"});}});setDraftPool(initDraftPool(myTeam));setScreen("draft_preview");}}/></> );
  if(screen==="playoff"&&playoff) return(<><style>{G}</style><PlayoffScreen playoff={playoff} setPlayoff={setPlayoff} teams={teams} myId={myId} year={year} onFinish={()=>setScreen("retire_phase")}/></>);
  if(screen==="draft_preview"&&draftPool) return(<><style>{G}</style><DraftPreviewScreen teams={teams} myId={myId} year={year} pool={draftPool} onStart={()=>setScreen("draft_lottery")}/></>);
  if(screen==="draft_lottery"&&draftPool) return(<><style>{G}</style><DraftLotteryScreen teams={teams} myId={myId} year={year} pool={draftPool} onDone={(r1)=>{setDraftPool(prev=>prev.map(p=>{const winner=Object.entries(r1).find(function(e){return e[1]&&e[1].id===p.id;});return{...p,_drafted:winner?true:undefined,_r1winner:winner?winner[0]:undefined};}));setScreen("draft");}}/></>);
  if(screen==="draft"&&draftPool) return(<><style>{G}</style><DraftScreen teams={teams} myId={myId} year={year} pool={draftPool} onDraftDone={(pl,dr)=>{setDraftResult({pool:pl,drafted:dr});setScreen("draft_review");}}/></>);
  if(screen==="draft_review"&&draftResult) return(<><style>{G}</style><DraftReviewScreen teams={teams} myId={myId} year={year} pool={draftResult.pool} drafted={draftResult.drafted} onEnd={()=>handleDraftComplete(draftResult.pool,draftResult.drafted)}/></>);

  const g=(myTeam?.wins||0)+(myTeam?.losses||0);
  const remain=SEASON_GAMES-g;

  return(<><style>{G}</style><div className="app"><div className="hub">
    <div className="topbar">
      <span style={{fontSize:26}}>{myTeam?.emoji}</span>
      <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:myTeam?.color}}>{myTeam?.name}</div><div style={{fontSize:10,color:"#374151"}}>{year}年 / 第{gameDay}戦 / 残り{remain}試合</div></div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><span className="chip cg">{myTeam?.wins}勝</span><span className="chip cr">{myTeam?.losses}敗</span><span className="chip cy">{fmtM(myTeam?.budget||0)}</span></div>
      <div style={{display:'flex',gap:4}}>
        <button
          style={{background:'transparent',border:'1px solid rgba(245,200,66,.4)',borderRadius:6,color:'#f5c842',fontSize:10,padding:'4px 8px',cursor:'pointer'}}
          onClick={() => {
            const savePayload = buildSaveData({ teams, myId, gameDay, year, faPool, news, mailbox, cpuTradeOffers });
            try {
              localStorage.setItem(SAVE_KEY, JSON.stringify(savePayload));
              notify('セーブしました', 'ok');
            } catch { notify('セーブ失敗', 'bad'); }
          }}
        >💾</button>
        <button
          style={{background:'transparent',border:'1px solid rgba(248,113,113,.3)',borderRadius:6,color:'#f87171',fontSize:10,padding:'4px 8px',cursor:'pointer'}}
          onClick={() => {
            if (window.confirm('セーブデータを削除して最初からやり直しますか？')) {
              deleteSaveData();
              window.location.reload();
            }
          }}
        >🗑</button>
      </div>
      <div className="tb-record">{myTeam?.wins}勝{myTeam?.losses}敗</div>
    </div>

    {notif&&<div className={`notif ${notif.type==="ok"?"nok":notif.type==="warn"?"nwarn":"nbad"}`}>{notif.msg}</div>}

    {gameDay<=SEASON_GAMES&&(
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
        <button className="sim-btn" style={{margin:0,fontSize:12}} onClick={handleStartGame}>
          ⚾ 1試合<br/><span style={{fontSize:9,opacity:.7}}>采配 or オート</span>
        </button>
        <button className="sim-btn" style={{margin:0,fontSize:12,background:"linear-gradient(135deg,#071a2c,#0d2840)",borderColor:"rgba(96,165,250,.5)",color:"#60a5fa"}} onClick={handleBatchSim}>
          ⚡ {Math.min(BATCH,SEASON_GAMES-(gameDay-1))}試合まとめて<br/><span style={{fontSize:9,opacity:.7}}>オートシム</span>
        </button>
        <button className="sim-btn" style={{margin:0,fontSize:12,background:"linear-gradient(135deg,#1a0730,#2d0f50)",borderColor:"rgba(167,139,250,.5)",color:"#a78bfa"}} onClick={handleSeasonSim}>
          🚀 残り全{remain}試合<br/><span style={{fontSize:9,opacity:.7}}>シーズン一括消化</span>
        </button>
      </div>
    )}

    <div className="tabs">
      {[["roster","👥 ロースター"],["news","📰 ニュース"],["mailbox","📨 メール"],["trade","🔄 トレード"],["contract","📝 契約"],["fa","🏪 FA"],["scout","🔍 スカウト"],["finance","💴 財務"],["standings","🏆 順位"],["stats","📊 成績"]].map(([id,l])=>(
        <button key={id} className={`tab ${tab===id?"on":""}`} onClick={()=>setTab(id)}>
          {l}{id==="mailbox"&&mailbox.filter(m=>!m.read).length>0&&<span style={{marginLeft:4,background:"#f87171",color:"#fff",borderRadius:8,padding:"0 5px",fontSize:9,fontWeight:700}}>{mailbox.filter(m=>!m.read).length}</span>}
        </button>
      ))}
    </div>

    {tab==="roster"&&<RosterTab team={myTeam} onToggle={toggleLineup} onSetStarter={setStarter} onPromo={promote} onDemo={demote}/>}
    {tab==="news"&&<NewsTab news={news} onInterview={handleInterview}/>}
    {tab==="mailbox"&&<MailboxTab mailbox={mailbox} onRead={handleMailRead} onAction={handleMailAction} teams={teams} myTeam={myTeam} onTrade={handleTrade}/>}
    {tab==="trade"&&<TradeTab myTeam={myTeam} teams={teams} onTrade={handleTrade} cpuOffers={[]} onAcceptOffer={()=>{}} onDeclineOffer={()=>{}}/>}
    {tab==="contract"&&<ContractTab team={myTeam} allTeams={teams} onOffer={handleContractOffer} onRelease={pid=>{const p=myTeam?.players.find(x=>x.id===pid);upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid)}));if(p){addToHistory(myId,p,"自由契約");setFaPool(prev=>[...prev,{...p,isFA:true}]);}notify("放出しました","warn");}}/>}
    {tab==="fa"&&(
      <div className="card">
        <div className="card-h">FA市場 ({faPool.length}人)</div>
        {faPool.length===0&&<p style={{color:"#2a3a4c",fontSize:12}}>現在FA選手はいません</p>}
        {faPool.map((p,i)=><div key={p.id} className="card2">
          <div className="fsb"><div><span style={{fontWeight:700,fontSize:13}}>{p.name}</span><span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.pos}/{p.age}歳</span></div>
          <button className="bsm bga" onClick={()=>{if(myTeam.budget<p.salary){notify("予算不足","warn");return;}upd(myId,t=>({...t,budget:t.budget-p.salary,players:[...t.players,{...p,contractYearsLeft:2}]}));setFaPool(prev=>prev.filter((_,j)=>j!==i));notify(`${p.name}を獲得！`,"ok");}}>獲得 {fmtSal(p.salary)}/年</button></div>
        </div>)}
      </div>
    )}
    {tab==="scout"&&(
      <div>
        {myTeam?.scoutResults.length>0&&<div className="card"><div className="card-h">スカウト報告</div>{myTeam.scoutResults.map((p,i)=><div key={p.id} className="card2"><div className="fsb"><span style={{fontWeight:700}}>{p.name} <span style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.age}歳</span></span><div style={{display:"flex",gap:6}}><button className="bsm bga" onClick={()=>signPlayer(i)}>獲得</button><button className="bsm bgr" onClick={()=>upd(myId,t=>({...t,scoutResults:t.scoutResults.filter((_,j)=>j!==i)}))}>見送り</button></div></div></div>)}</div>}
        <div className="card"><div className="card-h">スカウト派遣</div><div className="g2">{SCOUT_REGIONS.map(sr=><div key={sr.id} className="card2" style={{cursor:"pointer"}} onClick={()=>sendScout(sr)}><div style={{fontWeight:700,fontSize:12,marginBottom:3}}>{sr.name}</div><div style={{fontSize:10,color:"#374151"}}>費用:{fmtSal(sr.cost)} / Lv{sr.qMin}〜{sr.qMax}</div></div>)}</div></div>
      </div>
    )}
    {tab==="finance"&&<FinanceTab team={myTeam}/>}
    {tab==="standings"&&<StandingsTab teams={teams} myId={myId}/>}
    {tab==="stats"&&<StatsTab teams={teams} myId={myId}/>}

    {tab==="roster"&&(
      <div className="card">
        <div className="card-h">コーチ陣</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>{myTeam?.coaches.map((c,i)=><div key={i} className="card2" style={{display:"flex",alignItems:"center",gap:8,flex:"1 1 190px"}}><span style={{fontSize:18}}>{c.emoji}</span><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700}}>{c.typeName} <span style={{color:"#f5c842",fontSize:10}}>Lv{c.grade}</span></div><div style={{fontSize:10,color:"#374151"}}>{c.name}</div></div><button className="bsm bgr" onClick={()=>fireCoach(i)}>解雇</button></div>)}</div>
        <details><summary style={{fontSize:11,color:"#374151",cursor:"pointer"}}>+ コーチを雇う</summary><div className="g2" style={{marginTop:8}}>{COACH_DEFS.map(cd=>COACH_GRADES.map(cg=>{const hired=myTeam?.coaches.some(c=>c.type===cd.type&&c.grade===cg.g);return <div key={cd.type+cg.g} className="card2" style={{opacity:hired?0.5:1}}><div className="fsb"><span style={{fontSize:11}}>{cd.emoji}{cd.name} Lv{cg.g}</span><button className="bsm bga" disabled={hired} onClick={()=>hireCoach(cd,cg)}>{hired?"済":"雇う"}</button></div><div style={{fontSize:10,color:"#374151",marginTop:2}}>{fmtSal(cg.salary)}/月 · +{cg.bonus}成長</div></div>;}))}</div></details>
      </div>
    )}
    <RetireModal modal={retireModal} retireRole={retireRole} setRetireRole={setRetireRole} onRetain={()=>handleRetain(retireModal.player)} onAccept={()=>handleAcceptRetire(retireModal.player)} onStartRetireGame={()=>handleStartRetireGame(retireModal.player)} onSkipRetireGame={()=>handleSkipRetireGame(retireModal.player)}/>
  </div></div></>);
}
