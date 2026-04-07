#!/usr/bin/env node
/**
 * fetch-spaia.cjs
 * spaia.jp の非公式 JSON API から NPB 成績を取得し、
 * src/data/npb2025.js を生成するスクリプト。
 *
 * 使い方:
 *   node scripts/fetch-spaia.cjs                    # 2024年データ取得・書き込み
 *   node scripts/fetch-spaia.cjs --year=2023         # 年度指定
 *   node scripts/fetch-spaia.cjs --dry-run           # ファイル書き込みなしで確認
 *   node scripts/fetch-spaia.cjs --debug             # 1チーム分の生JSONを出力して終了
 *   node scripts/fetch-spaia.cjs --debug --team=2    # デバッグ対象チーム指定(SPAIA ID)
 *
 * 動作確認済み Node.js バージョン: v18 以上（fetch が組み込み）
 * v16 以下: npm install node-fetch  してから先頭に追記:
 *   const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// ── CLI オプション ──────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DEBUG   = args.includes('--debug');
const YEAR    = (() => {
  const y = args.find(a => a.startsWith('--year='));
  return y ? parseInt(y.split('=')[1], 10) : 2024;
})();
const DEBUG_TEAM = (() => {
  const t = args.find(a => a.startsWith('--team='));
  return t ? parseInt(t.split('=')[1], 10) : null;
})();

console.log(`[fetch-spaia] year=${YEAR}  dry-run=${DRY_RUN}  debug=${DEBUG}`);

// ── SPAIA チーム ID ↔ ゲーム内チーム ID マッピング ────────
const TEAM_MAP = [
  { gameId:  0, name: '東京ヤクルトスワローズ',     spaia:   2, city: '東京'   },
  { gameId:  1, name: '横浜DeNAベイスターズ',       spaia:   3, city: '横浜'   },
  { gameId:  2, name: '広島東洋カープ',              spaia:   6, city: '広島'   },
  { gameId:  3, name: '阪神タイガース',              spaia:  5, city: '兵庫'   },
  { gameId:  4, name: '読売ジャイアンツ',            spaia:   1, city: '東京'   },
  { gameId:  5, name: '中日ドラゴンズ',              spaia:   4, city: '名古屋' },
  { gameId:  6, name: '福岡ソフトバンクホークス',   spaia:  12, city: '福岡'   },
  { gameId:  7, name: '東北楽天ゴールデンイーグルス', spaia: 376, city: '仙台'  },
  { gameId:  8, name: '埼玉西武ライオンズ',          spaia:   7, city: '所沢'   },
  { gameId:  9, name: '千葉ロッテマリーンズ',        spaia:   9, city: '千葉'   },
  { gameId: 10, name: '北海道日本ハムファイターズ',  spaia:   8, city: '札幌'   },
  { gameId: 11, name: 'オリックス・バファローズ',    spaia:  11, city: '大阪'   },
];

const BASE     = 'https://spaia.jp/baseball/npb/api';
const DELAY_MS = 900; // サーバー負荷軽減

// ── ユーティリティ ────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; baseball-manager-fetcher/1.0)',
      'Accept': 'application/json',
      'Referer': 'https://spaia.jp/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

/** 複数フィールド候補から最初に存在する値を返す */
function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '-' && obj[k] !== '') return obj[k];
  }
  return undefined;
}

/** --debug 時のみ、見つからなかったフィールドと利用可能なキーを警告出力する */
function pickDebug(label, obj, ...keys) {
  const val = pick(obj, ...keys);
  if (val === undefined && DEBUG) {
    console.warn(`  [FIELD NOT FOUND] ${label}: tried [${keys.join(', ')}]`);
    console.warn(`  Available keys: ${Object.keys(obj).join(', ')}`);
  }
  return val;
}

/** 数値化（'-' や null → fallback） */
function num(v, fallback = 0) {
  if (v === '-' || v === null || v === undefined) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

// ── 守備位置の正規化 ─────────────────────────────────────
const POS_MAP = {
  '捕手': '捕手', 'C': '捕手',
  '一塁手': '一塁手', '1B': '一塁手',
  '二塁手': '二塁手', '2B': '二塁手',
  '三塁手': '三塁手', '3B': '三塁手',
  '遊撃手': '遊撃手', 'SS': '遊撃手',
  '左翼手': '左翼手', 'LF': '左翼手',
  '中堅手': '中堅手', 'CF': '中堅手',
  '右翼手': '右翼手', 'RF': '右翼手',
  '外野手': '中堅手', 'OF': '中堅手',
  '内野手': '三塁手', 'IF': '三塁手',
  '先発': '先発', 'SP': '先発',
  '中継ぎ': '中継ぎ', 'RP': '中継ぎ',
  '抑え': '抑え',   'CL': '抑え',
  '投手': '先発',   'P': '先発',
};
function normalizePos(raw) {
  if (!raw) return null;
  return POS_MAP[String(raw).trim()] ?? null;
}

// ── 投手サブタイプ推定 ───────────────────────────────────
function inferPitcherSubtype(p) {
  const pos = normalizePos(pick(p, 'Position', 'position', 'pos', '守備'));
  if (pos && ['先発', '中継ぎ', '抑え'].includes(pos)) return pos;
  const sv = num(pick(p, 'Save', 'save', 'SV'), 0);
  const ip = num(pick(p, 'InningsPitched', 'innings_pitched', 'IP'), 0);
  const gs = num(pick(p, 'GamesStarted', 'games_started', 'GS'), 0);
  if (sv >= 10) return '抑え';
  if (gs >= 10 || ip >= 100) return '先発';
  return '中継ぎ';
}

// ── history 正規化（打者） ────────────────────────────────
const HISTORY_YEARS = 999;
function normalizeHistoryBatter(history) {
  if (!Array.isArray(history) || history.length === 0) return undefined;
  const minYear = YEAR - HISTORY_YEARS;
  const entries = history
    .map(r => ({
      year: num(r.Year ?? r.year, 0),
      AVG:  num(pick(r, 'BattingAverage', 'batting_average', 'AVG'), 0),
      HR:   num(pick(r, 'Homerun', 'home_run', 'HR'), 0),
      RBI:  num(pick(r, 'RunsBattingIn', 'runs_batted_in', 'RBI'), 0),
      SB:   num(pick(r, 'StolenBase', 'stolen_base', 'SB'), 0),
      BB:   num(pick(r, 'BaseOnBall', 'base_on_balls', 'BB'), 0),
      PA:   num(pick(r, 'PlateAppearance', 'plate_appearance', 'PA'), 0),
      OPS:  num(pick(r, 'Ops', 'ops', 'OPS'), 0),
    }))
    .filter(r => r.year > minYear && r.year < YEAR && r.PA >= 10)
    .sort((a, b) => a.year - b.year);
  return entries.length > 0 ? entries : undefined;
}

// ── history 正規化（投手） ────────────────────────────────
function normalizeHistoryPitcher(history) {
  if (!Array.isArray(history) || history.length === 0) return undefined;
  const minYear = YEAR - HISTORY_YEARS;
  const entries = history
    .map(r => ({
      year: num(r.Year ?? r.year, 0),
      ERA:  num(pick(r, 'EarnedRunAverage', 'earned_run_average', 'ERA'), 0),
      W:    num(pick(r, 'Win', 'win', 'W'), 0),
      L:    num(pick(r, 'Loss', 'loss', 'L'), 0),
      IP:   num(pick(r, 'InningsPitched', 'innings_pitched', 'IP'), 0),
      K:    num(pick(r, 'StrikeOut', 'strikeout', 'SO', 'K'), 0),
      BB:   num(pick(r, 'BaseOnBall', 'base_on_balls', 'BB'), 0),
      WHIP: num(pick(r, 'Whip', 'whip', 'WHIP'), 0),
      SV:   num(pick(r, 'Save', 'save', 'SV'), 0),
    }))
    .filter(r => r.year > minYear && r.year < YEAR && r.IP >= 5)
    .sort((a, b) => a.year - b.year);
  return entries.length > 0 ? entries : undefined;
}

// ── 打者データ変換 ────────────────────────────────────────
function convertBatter(info, stats, history, cityFallback) {
  // ── プロフィール: batter_list (info) から取得 ──────────
  // ※ hitting_stats_by_year (stats) には年齢・守備位置・年俸・出身地が
  //    古い値や空値で入るため stats で上書きしてはいけない
  const name = pick(info, 'Name', 'name', 'player_name', '選手名');
  if (!name) return null;

  const age  = num(pickDebug('age', info, 'Age', 'age', '年齢', 'PlayerAge', 'player_age', 'BirthAge', 'birth_age'), 25);
  const pos  = normalizePos(pickDebug('pos', info, 'Position', 'DefensePosition', 'defense_position', 'DefensePos', 'DefPos', 'position', 'pos', '守備', '守備位置')) ?? '一塁手';
  const city = pick(info, 'BirthPlace', 'birth_place', 'hometown', 'BirthPref', 'birth_pref', '出身地', '出身') ?? cityFallback;
  const salary = (() => {
    const raw = num(pickDebug('salary', info, 'Salary', 'salary', '年俸', 'AnnualSalary', 'annual_salary', 'Contract', 'contract', '契約金'), 0);
    if (raw > 0 && raw < 1000) return raw * 10000;  // 万円 → 円
    return raw || 5000;
  })();
  const foreign = !!(pick(info, 'IsForeign', 'is_foreign', 'isForeign'));

  // ── 成績: hitting_stats_by_year (stats) から取得 ────────
  // playerCD が見つからない場合 stats = info なので引き続き機能する
  const AVG = num(pick(stats, 'BattingAverage', 'batting_average', 'AVG'), 0.250);
  const HR  = num(pick(stats, 'Homerun', 'home_run', 'HR'), 5);
  const RBI = num(pick(stats, 'RunsBattingIn', 'runs_batted_in', 'RBI'), 30);
  const SB  = num(pick(stats, 'StolenBase', 'stolen_base', 'SB'), 5);
  const BB  = num(pick(stats, 'BaseOnBall', 'base_on_balls', 'BB'), 30);
  const PA  = num(pick(stats, 'PlateAppearance', 'plate_appearance', 'PA'), 300);
  const OPS = num(pick(stats, 'Ops', 'ops', 'OPS'), 0.680);

  const hist = normalizeHistoryBatter(history);
  return {
    name,
    age,
    pos,
    hometown: city,
    ...(foreign ? { isForeign: true } : {}),
    salary,
    stats: { AVG, HR, RBI, SB, BB, PA, OPS },
    ...(hist ? { history: hist } : {}),
  };
}

// ── 投手データ変換 ────────────────────────────────────────
function convertPitcher(info, stats, history, cityFallback) {
  // ── プロフィール: pitcher_list (info) から取得 ──────────
  const name = pick(info, 'Name', 'name', 'player_name', '選手名');
  if (!name) return null;

  const age     = num(pickDebug('age', info, 'Age', 'age', '年齢', 'PlayerAge', 'player_age', 'BirthAge', 'birth_age'), 27);
  const subtype = inferPitcherSubtype(info);  // info から推定（stats で上書きしない）
  const hand    = (() => {
    const raw = pick(info, 'ThrowHand', 'PitchHand', 'throw_hand', 'pitch_hand', 'hand', '投球腕', '投球の手');
    if (!raw) return 'right';
    return String(raw).includes('左') || raw === 'L' || raw === 1 ? 'left' : 'right';
  })();
  const city    = pick(info, 'BirthPlace', 'birth_place', 'hometown', 'BirthPref', 'birth_pref', '出身地', '出身') ?? cityFallback;
  const salary  = (() => {
    const raw = num(pickDebug('salary', info, 'Salary', 'salary', '年俸', 'AnnualSalary', 'annual_salary', 'Contract', 'contract', '契約金'), 0);
    if (raw > 0 && raw < 1000) return raw * 10000;  // 万円 → 円
    return raw || 5000;
  })();
  const foreign = !!(pick(info, 'IsForeign', 'is_foreign', 'isForeign'));

  // ── 成績: pitching_stats_by_year (stats) から取得 ────────
  const ERA  = num(pick(stats, 'EarnedRunAverage', 'earned_run_average', 'ERA'), 4.00);
  const W    = num(pick(stats, 'Win', 'win', 'W'), 5);
  const L    = num(pick(stats, 'Loss', 'loss', 'L'), 8);
  const IP   = num(pick(stats, 'InningsPitched', 'innings_pitched', 'IP'), 80);
  // K: APIフィールド名が不明のため多めに候補を列挙
  const K    = num(pick(stats, 'StrikeOut', 'Strikeout', 'Strikeouts', 'strikeout', 'strikeouts', 'SO', 'K', 'KO'), 70);
  const BB   = num(pick(stats, 'BaseOnBall', 'base_on_balls', 'BB', 'Walk', 'walks'), 35);
  const WHIP = num(pick(stats, 'Whip', 'whip', 'WHIP'), 1.40);
  const SV   = num(pick(stats, 'Save', 'save', 'SV'), 0);

  const hist = normalizeHistoryPitcher(history);
  return {
    name,
    age,
    pos: subtype,
    hand,
    hometown: city,
    ...(foreign ? { isForeign: true } : {}),
    salary,
    stats: { ERA, W, L, IP, K, BB, WHIP, ...(SV > 0 ? { SV } : {}) },
    ...(hist ? { history: hist } : {}),
  };
}

// ── 選手リスト → PlayerCD マッピング ────────────────────
function extractList(data) {
  if (Array.isArray(data)) return data;
  return data.players ?? data.data ?? data.batters ?? data.pitchers ?? [];
}

// ── 年度別成績取得（1選手・指定年度のみ） ────────────────
async function fetchPlayerStats(playerCD, isBatter) {
  const list = await fetchPlayerHistory(playerCD, isBatter);
  // 指定年度 → なければ最新年度を使用
  const byYear = list.find(r => num(r.Year ?? r.year, 0) === YEAR)
              ?? list.sort((a, b) => num(b.Year ?? b.year) - num(a.Year ?? a.year))[0]
              ?? {};
  return byYear;
}

// ── 年度別成績取得（1選手・全年度） ──────────────────────
async function fetchPlayerHistory(playerCD, isBatter) {
  const endpoint = isBatter ? 'hitting_stats_by_year' : 'pitching_stats_by_year';
  const url = `${BASE}/${endpoint}?player_id=${playerCD}`;
  await sleep(DELAY_MS);
  try {
    const data = await fetchJSON(url);
    return Array.isArray(data) ? data : (data.stats ?? data.data ?? []);
  } catch {
    return [];
  }
}

// ── チームデータ取得 ──────────────────────────────────────
async function fetchTeam(teamDef) {
  const { gameId, name, spaia, city } = teamDef;
  console.log(`  [${gameId}] ${name} (spaia=${spaia}) ...`);

  let batters  = [];
  let pitchers = [];

  // ── 打者 ─────────────────────────────────────────────
  try {
    await sleep(DELAY_MS);
    const batData = await fetchJSON(`${BASE}/batter_list?team=${spaia}&year=${YEAR}`);
    const batList = extractList(batData);

    if (DEBUG && !DEBUG_TEAM) {
      console.log('\n[DEBUG] batter_list 生レスポンス（先頭2件）:');
      console.log(JSON.stringify(batList.slice(0, 2), null, 2));
    }

    // PA ≥ 50 の選手のみ対象（試合出場が少ない選手を除外）
    const mainBatters = batList.filter(p => num(pick(p, 'PlateAppearance', 'PA'), 0) >= 50);
    const targets = mainBatters.length > 0 ? mainBatters : batList.slice(0, 15);

    for (const info of targets) {
      const playerCD = pick(info, 'PlayerCD', 'player_cd', 'player_id', 'id');
      let stats = {};
      let history = [];
      if (playerCD) {
        history = await fetchPlayerHistory(playerCD, true);
        // 指定年度 or 最新年度を現行成績として使用
        stats = history.find(r => num(r.Year ?? r.year, 0) === YEAR)
             ?? history.sort((a, b) => num(b.Year ?? b.year) - num(a.Year ?? a.year))[0]
             ?? {};
        if (DEBUG && !DEBUG_TEAM) {
          console.log('\n[DEBUG] hitting_stats_by_year 生レスポンス:');
          console.log(JSON.stringify(history.slice(0, 3), null, 2));
        }
      } else {
        // PlayerCD がない場合は batter_list の情報だけで変換
        stats = info;
      }
      const converted = convertBatter(info, stats, history, city);
      if (converted) batters.push(converted);
    }
    console.log(`    → 打者 ${batters.length} 名`);
  } catch (e) {
    console.warn(`    ⚠ 打者取得失敗: ${e.message}`);
  }

  // ── 投手 ─────────────────────────────────────────────
  try {
    await sleep(DELAY_MS);
    const pitData = await fetchJSON(`${BASE}/pitcher_list?team=${spaia}&year=${YEAR}`);
    const pitList = extractList(pitData);

    if (DEBUG && !DEBUG_TEAM) {
      console.log('\n[DEBUG] pitcher_list 生レスポンス（先頭2件）:');
      console.log(JSON.stringify(pitList.slice(0, 2), null, 2));
    }

    const mainPitchers = pitList.filter(p => num(pick(p, 'InningsPitched', 'PlateAppearance', 'IP'), 0) >= 10);
    const targets = mainPitchers.length > 0 ? mainPitchers : pitList.slice(0, 12);

    for (const info of targets) {
      const playerCD = pick(info, 'PlayerCD', 'player_cd', 'player_id', 'id');
      let stats = {};
      let history = [];
      if (playerCD) {
        history = await fetchPlayerHistory(playerCD, false);
        stats = history.find(r => num(r.Year ?? r.year, 0) === YEAR)
             ?? history.sort((a, b) => num(b.Year ?? b.year) - num(a.Year ?? a.year))[0]
             ?? {};
        if (DEBUG && !DEBUG_TEAM) {
          console.log('\n[DEBUG] pitching_stats_by_year 生レスポンス:');
          console.log(JSON.stringify(history.slice(0, 3), null, 2));
        }
      } else {
        stats = info;
      }
      const converted = convertPitcher(info, stats, history, city);
      if (converted) pitchers.push(converted);
    }
    console.log(`    → 投手 ${pitchers.length} 名`);
  } catch (e) {
    console.warn(`    ⚠ 投手取得失敗: ${e.message}`);
  }

  if (batters.length === 0 || pitchers.length === 0) {
    console.warn(`    ⚠ ${name}: データ不足 (打者=${batters.length}, 投手=${pitchers.length})`);
    console.warn(`    → 元の npb2025.js の値が維持されます`);
  }

  return { gameId, batters, pitchers };
}

// ── JS ファイル生成 ───────────────────────────────────────
function buildFileContent(rosters) {
  const lines = [
    `/* NPB ${YEAR} 実選手データ（spaia.jp API より自動取得）`,
    ` * 生成日時: ${new Date().toLocaleString('ja-JP')}`,
    ` * 取得スクリプト: scripts/fetch-spaia.js`,
    ` * このファイルは自動生成です。手動編集は次回実行で上書きされます。`,
    ' */',
    'export const NPB2025_ROSTERS = {',
  ];

  for (const { gameId, batters, pitchers } of rosters) {
    const team = TEAM_MAP.find(t => t.gameId === gameId);
    lines.push(`  // ${gameId}: ${team?.name ?? '?'}`);
    lines.push(`  ${gameId}: {`);

    lines.push('    batters: [');
    for (const b of batters) {
      const { name, age, pos, hometown, isForeign, salary, stats, history } = b;
      const { AVG, HR, RBI, SB, BB, PA, OPS } = stats;
      const foreignStr = isForeign ? ', isForeign:true' : '';
      const histStr = history?.length ? `, history:${JSON.stringify(history)}` : '';
      lines.push(
        `      { name:'${name}', age:${age}, pos:'${pos}', hometown:'${hometown}'${foreignStr}, salary:${salary},` +
        ` stats:{ AVG:${AVG.toFixed(3)}, HR:${HR}, RBI:${RBI}, SB:${SB}, BB:${BB}, PA:${PA}, OPS:${OPS.toFixed(3)} }${histStr} },`
      );
    }
    lines.push('    ],');

    lines.push('    pitchers: [');
    for (const p of pitchers) {
      const { name, age, pos, hand, hometown, isForeign, salary, stats, history } = p;
      const { ERA, W, L, IP, K, BB, WHIP, SV } = stats;
      const foreignStr = isForeign ? ', isForeign:true' : '';
      const svStr = SV > 0 ? `, SV:${SV}` : '';
      const histStr = history?.length ? `, history:${JSON.stringify(history)}` : '';
      lines.push(
        `      { name:'${name}', age:${age}, pos:'${pos}', hand:'${hand}', hometown:'${hometown}'${foreignStr}, salary:${salary},` +
        ` stats:{ ERA:${ERA.toFixed(2)}, W:${W}, L:${L}, IP:${IP.toFixed(1)}, K:${K}, BB:${BB}, WHIP:${WHIP.toFixed(2)}${svStr} }${histStr} },`
      );
    }
    lines.push('    ],');
    lines.push('  },');
    lines.push('');
  }

  lines.push('};');
  return lines.join('\n');
}

// ── メイン ───────────────────────────────────────────────
(async () => {
  // --debug モード：1チームだけ叩いて生JSONを出力して終了
  if (DEBUG) {
    const targetSpaia = DEBUG_TEAM ?? TEAM_MAP[0].spaia;
    const teamDef = TEAM_MAP.find(t => t.spaia === targetSpaia) ?? TEAM_MAP[0];
    console.log(`\n=== DEBUG モード: ${teamDef.name} (spaia=${teamDef.spaia}) ===\n`);

    const batUrl = `${BASE}/batter_list?team=${teamDef.spaia}&year=${YEAR}`;
    const pitUrl = `${BASE}/pitcher_list?team=${teamDef.spaia}&year=${YEAR}`;

    console.log('[batter_list URL]', batUrl);
    try {
      const bd = await fetchJSON(batUrl);
      const bl = extractList(bd);
      console.log('\n[batter_list] 先頭3件:');
      console.log(JSON.stringify(bl.slice(0, 3), null, 2));
      if (bl[0]) console.log('\n[batter_list] フィールド一覧:', Object.keys(bl[0]));

      // 最初の選手の年度別成績も確認
      const firstPlayerCD = pick(bl[0] ?? {}, 'PlayerCD', 'player_cd', 'player_id', 'id');
      if (firstPlayerCD) {
        await sleep(DELAY_MS);
        const sUrl = `${BASE}/hitting_stats_by_year?player_id=${firstPlayerCD}`;
        console.log('\n[hitting_stats_by_year URL]', sUrl);
        const sd = await fetchJSON(sUrl);
        console.log('\n[hitting_stats_by_year] 先頭3件:');
        const sl = Array.isArray(sd) ? sd : (sd.stats ?? sd.data ?? []);
        console.log(JSON.stringify(sl.slice(0, 3), null, 2));
        if (sl[0]) console.log('\n[hitting_stats_by_year] フィールド一覧:', Object.keys(sl[0]));
      }
    } catch (e) {
      console.error('打者取得失敗:', e.message);
    }

    await sleep(DELAY_MS);
    console.log('\n[pitcher_list URL]', pitUrl);
    try {
      const pd = await fetchJSON(pitUrl);
      const pl = extractList(pd);
      console.log('\n[pitcher_list] 先頭3件:');
      console.log(JSON.stringify(pl.slice(0, 3), null, 2));
      if (pl[0]) console.log('\n[pitcher_list] フィールド一覧:', Object.keys(pl[0]));

      const firstPitcherCD = pick(pl[0] ?? {}, 'PlayerCD', 'player_cd', 'player_id', 'id');
      if (firstPitcherCD) {
        await sleep(DELAY_MS);
        const sUrl = `${BASE}/pitching_stats_by_year?player_id=${firstPitcherCD}`;
        console.log('\n[pitching_stats_by_year URL]', sUrl);
        const sd = await fetchJSON(sUrl);
        console.log('\n[pitching_stats_by_year] 先頭3件:');
        const sl = Array.isArray(sd) ? sd : (sd.stats ?? sd.data ?? []);
        console.log(JSON.stringify(sl.slice(0, 3), null, 2));
        if (sl[0]) console.log('\n[pitching_stats_by_year] フィールド一覧:', Object.keys(sl[0]));
      }
    } catch (e) {
      console.error('投手取得失敗:', e.message);
    }

    console.log('\n=== DEBUG 完了。上記のフィールド名を確認して scripts/fetch-spaia.js を調整してください ===');
    return;
  }

  // 通常モード
  console.log('\n=== spaia.jp データ取得開始 ===\n');
  const rosters = [];
  for (const teamDef of TEAM_MAP) {
    const result = await fetchTeam(teamDef);
    rosters.push(result);
  }

  console.log('\n=== ファイル生成 ===');
  const content = buildFileContent(rosters);

  if (DRY_RUN) {
    console.log('\n--- 生成内容（dry-run、先頭3000文字）---');
    console.log(content.slice(0, 3000));
    console.log('...(以下省略)...');
  } else {
    const outPath = path.join(__dirname, '..', 'src', 'data', 'npb2025.js');
    if (fs.existsSync(outPath)) {
      const backupPath = outPath.replace('.js', `.backup.${Date.now()}.js`);
      fs.copyFileSync(outPath, backupPath);
      console.log(`バックアップ: ${path.basename(backupPath)}`);
    }
    fs.writeFileSync(outPath, content, 'utf8');
    console.log(`出力完了: ${outPath}`);
  }

  console.log('\n=== 取得結果サマリー ===');
  for (const { gameId, batters, pitchers } of rosters) {
    const team = TEAM_MAP.find(t => t.gameId === gameId);
    const ok = batters.length > 0 && pitchers.length > 0;
    console.log(`  ${ok ? '✅' : '⚠'} [${gameId}] ${team?.name}: 打者${batters.length}名 / 投手${pitchers.length}名`);
  }
  console.log('\n完了。');
})().catch(e => {
  console.error('致命的エラー:', e);
  process.exit(1);
});
