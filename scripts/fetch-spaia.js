#!/usr/bin/env node
/**
 * fetch-spaia.js
 * spaia.jp の非公式 JSON API から NPB 2024 成績を取得し、
 * src/data/npb2025.js を生成するスクリプト。
 *
 * 使い方:
 *   node scripts/fetch-spaia.js
 *   node scripts/fetch-spaia.js --year=2024
 *   node scripts/fetch-spaia.js --dry-run   # ファイル出力せずコンソールに表示
 *
 * 動作確認済み Node.js バージョン: v18 以上（fetch built-in）
 * v16 以下の場合は  npm install node-fetch  後に先頭を変更:
 *   const fetch = require('node-fetch');
 */

const fs   = require('fs');
const path = require('path');

// ── CLI オプション ──────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const YEAR    = (() => {
  const y = args.find(a => a.startsWith('--year='));
  return y ? parseInt(y.split('=')[1], 10) : 2024;
})();

console.log(`[fetch-spaia] year=${YEAR}  dry-run=${DRY_RUN}`);

// ── SPAIA チーム ID ↔ ゲーム内チーム ID マッピング ────────
// ゲーム内 id は constants.js の TEAM_DEFS と対応
const TEAM_MAP = [
  { gameId:  0, name: '東京ヤクルトスワローズ', spaia:   2, city: '東京'   },
  { gameId:  1, name: '横浜DeNAベイスターズ',   spaia:   3, city: '横浜'   },
  { gameId:  2, name: '広島東洋カープ',          spaia:   6, city: '広島'   },
  { gameId:  3, name: '阪神タイガース',          spaia:  34, city: '大阪'   },
  { gameId:  4, name: '読売ジャイアンツ',        spaia:   1, city: '東京'   },
  { gameId:  5, name: '中日ドラゴンズ',          spaia:   4, city: '名古屋' },
  { gameId:  6, name: '福岡ソフトバンクホークス', spaia: 12, city: '福岡'   },
  { gameId:  7, name: '東北楽天ゴールデンイーグルス', spaia: 376, city: '仙台' },
  { gameId:  8, name: '埼玉西武ライオンズ',      spaia:   7, city: '所沢'   },
  { gameId:  9, name: '千葉ロッテマリーンズ',    spaia:   9, city: '千葉'   },
  { gameId: 10, name: '北海道日本ハムファイターズ', spaia: 8, city: '札幌'  },
  { gameId: 11, name: 'オリックス・バファローズ', spaia:  11, city: '大阪'   },
];

const BASE = 'https://spaia.jp/baseball/npb/api';
const DELAY_MS = 800; // サーバー負荷軽減のための待機時間

// ── ユーティリティ ────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; baseball-manager-fetcher/1.0)',
      'Accept': 'application/json',
      'Referer': 'https://spaia.jp/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

// ── フィールド名の正規化 ─────────────────────────────────
// API レスポンスのフィールド名は実際に叩いて確認すること。
// ここでは既知の候補を列挙し、存在するものを採用する。
function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

// ── 守備位置の正規化 ─────────────────────────────────────
const POS_MAP = {
  '捕手':   '捕手',   'C':  '捕手',
  '一塁手': '一塁手', '1B': '一塁手',
  '二塁手': '二塁手', '2B': '二塁手',
  '三塁手': '三塁手', '3B': '三塁手',
  '遊撃手': '遊撃手', 'SS': '遊撃手',
  '左翼手': '左翼手', 'LF': '左翼手',
  '中堅手': '中堅手', 'CF': '中堅手',
  '右翼手': '右翼手', 'RF': '右翼手',
  '外野手': '中堅手', 'OF': '中堅手',  // 汎用外野はCFに割当
  '内野手': '三塁手', 'IF': '三塁手',  // 汎用内野は3Bに割当
  // 投手ポジション
  '先発':   '先発',   'SP': '先発',
  '中継ぎ': '中継ぎ', 'RP': '中継ぎ',
  '抑え':   '抑え',   'CL': '抑え',
  '投手':   '先発',   'P':  '先発',
};

function normalizePos(raw) {
  if (!raw) return null;
  return POS_MAP[String(raw).trim()] ?? null;
}

// ── 投手ポジション判定（防御率・セーブ・IP から推測） ────
function inferPitcherSubtype(p) {
  const sv  = num(pick(p, 'save', 'sv', 'SV', 'セーブ'), 0);
  const ip  = num(pick(p, 'innings_pitched', 'ip', 'IP', '投球回'), 0);
  const gs  = num(pick(p, 'games_started', 'gs', 'GS', '先発試合'), 0);
  const pos = normalizePos(pick(p, 'position', 'pos', 'defense_position', '守備'));

  if (pos && ['先発','中継ぎ','抑え'].includes(pos)) return pos;
  if (sv >= 10) return '抑え';
  if (gs >= 10 || ip >= 100) return '先発';
  return '中継ぎ';
}

// ── 打者データ変換 ────────────────────────────────────────
function convertBatter(p, cityFallback) {
  const name = pick(p, 'name', 'player_name', 'name_jp', '選手名');
  if (!name) return null;

  const age  = num(pick(p, 'age', '年齢', 'player_age'), 25);
  const pos  = normalizePos(pick(p, 'position', 'pos', 'defense_position', '守備', 'main_position')) ?? '一塁手';
  const city = pick(p, 'birth_place', 'hometown', '出身地') ?? cityFallback;
  const salary = Math.round(num(pick(p, 'salary', '年俸', 'annual_salary'), 5000) / 10000) * 10000 || 5000;
  const foreign = !!(pick(p, 'is_foreign', 'isForeign', 'foreign') ?? (pick(p, 'nationality', '国籍') && pick(p, 'nationality', '国籍') !== '日本'));

  const AVG = num(pick(p, 'batting_average', 'avg', 'AVG', '打率'), 0.250);
  const HR  = num(pick(p, 'home_run', 'hr', 'HR', '本塁打'), 5);
  const RBI = num(pick(p, 'runs_batted_in', 'rbi', 'RBI', '打点'), 30);
  const SB  = num(pick(p, 'stolen_base', 'sb', 'SB', '盗塁'), 5);
  const BB  = num(pick(p, 'base_on_balls', 'bb', 'BB', 'walks', '四球'), 30);
  const PA  = num(pick(p, 'plate_appearance', 'pa', 'PA', '打席'), 300);
  const OPS = num(pick(p, 'ops', 'OPS'), 0.680);

  return {
    name,
    age,
    pos,
    hometown: city,
    ...(foreign ? { isForeign: true } : {}),
    salary,
    stats: { AVG, HR, RBI, SB, BB, PA, OPS },
  };
}

// ── 投手データ変換 ────────────────────────────────────────
function convertPitcher(p, cityFallback) {
  const name = pick(p, 'name', 'player_name', 'name_jp', '選手名');
  if (!name) return null;

  const age  = num(pick(p, 'age', '年齢', 'player_age'), 27);
  const subtype = inferPitcherSubtype(p);
  const hand = (() => {
    const raw = pick(p, 'pitch_hand', 'throw_hand', 'hand', '投球腕', '投げ');
    if (!raw) return 'right';
    return String(raw).includes('左') || raw === 'L' ? 'left' : 'right';
  })();
  const city = pick(p, 'birth_place', 'hometown', '出身地') ?? cityFallback;
  const salary = Math.round(num(pick(p, 'salary', '年俸', 'annual_salary'), 5000) / 10000) * 10000 || 5000;
  const foreign = !!(pick(p, 'is_foreign', 'isForeign', 'foreign') ?? (pick(p, 'nationality', '国籍') && pick(p, 'nationality', '国籍') !== '日本'));

  const ERA  = num(pick(p, 'earned_run_average', 'era', 'ERA', '防御率'), 4.00);
  const W    = num(pick(p, 'win', 'w', 'W', '勝'), 5);
  const L    = num(pick(p, 'loss', 'l', 'L', '敗'), 8);
  const IP   = num(pick(p, 'innings_pitched', 'ip', 'IP', '投球回'), 80);
  const K    = num(pick(p, 'strikeout', 'k', 'K', 'so', 'SO', '奪三振'), 70);
  const BB   = num(pick(p, 'base_on_balls', 'bb', 'BB', 'walks', '四球'), 35);
  const WHIP = num(pick(p, 'whip', 'WHIP'), 1.40);
  const SV   = num(pick(p, 'save', 'sv', 'SV', 'セーブ'), 0);

  return {
    name,
    age,
    pos: subtype,
    hand,
    hometown: city,
    ...(foreign ? { isForeign: true } : {}),
    salary,
    stats: { ERA, W, L, IP, K, BB, WHIP, ...(SV > 0 ? { SV } : {}) },
  };
}

// ── チームデータ取得 ──────────────────────────────────────
async function fetchTeam(teamDef) {
  const { gameId, name, spaia, city } = teamDef;
  console.log(`  [${gameId}] ${name} (spaia=${spaia}) ...`);

  let batters  = [];
  let pitchers = [];

  try {
    // 打者リスト
    const batUrl = `${BASE}/batter_list?team=${spaia}&year=${YEAR}`;
    await sleep(DELAY_MS);
    const batData = await fetchJSON(batUrl);

    // レスポンスは配列か { players: [...] } か { data: [...] } の可能性がある
    const batList = Array.isArray(batData)
      ? batData
      : (batData.players ?? batData.data ?? batData.batters ?? []);

    for (const p of batList) {
      const converted = convertBatter(p, city);
      if (converted) batters.push(converted);
    }
    console.log(`    → 打者 ${batters.length} 名`);
  } catch (e) {
    console.warn(`    ⚠ 打者取得失敗: ${e.message}`);
  }

  try {
    // 投手リスト
    const pitUrl = `${BASE}/pitcher_list?team=${spaia}&year=${YEAR}`;
    await sleep(DELAY_MS);
    const pitData = await fetchJSON(pitUrl);

    const pitList = Array.isArray(pitData)
      ? pitData
      : (pitData.players ?? pitData.data ?? pitData.pitchers ?? []);

    for (const p of pitList) {
      const converted = convertPitcher(p, city);
      if (converted) pitchers.push(converted);
    }
    console.log(`    → 投手 ${pitchers.length} 名`);
  } catch (e) {
    console.warn(`    ⚠ 投手取得失敗: ${e.message}`);
  }

  // データが取れなかった場合のフォールバック警告
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

    // 打者
    lines.push('    batters: [');
    for (const b of batters) {
      const { name, age, pos, hometown, isForeign, salary, stats } = b;
      const foreignStr = isForeign ? ', isForeign:true' : '';
      const { AVG, HR, RBI, SB, BB, PA, OPS } = stats;
      lines.push(
        `      { name:'${name}', age:${age}, pos:'${pos}', hometown:'${hometown}'${foreignStr}, salary:${salary},` +
        ` stats:{ AVG:${AVG.toFixed(3)}, HR:${HR}, RBI:${RBI}, SB:${SB}, BB:${BB}, PA:${PA}, OPS:${OPS.toFixed(3)} } },`
      );
    }
    lines.push('    ],');

    // 投手
    lines.push('    pitchers: [');
    for (const p of pitchers) {
      const { name, age, pos, hand, hometown, isForeign, salary, stats } = p;
      const foreignStr = isForeign ? ', isForeign:true' : '';
      const { ERA, W, L, IP, K, BB, WHIP, SV } = stats;
      const svStr = SV > 0 ? `, SV:${SV}` : '';
      lines.push(
        `      { name:'${name}', age:${age}, pos:'${pos}', hand:'${hand}', hometown:'${hometown}'${foreignStr}, salary:${salary},` +
        ` stats:{ ERA:${ERA.toFixed(2)}, W:${W}, L:${L}, IP:${IP.toFixed(1)}, K:${K}, BB:${BB}, WHIP:${WHIP.toFixed(2)}${svStr} } },`
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
  console.log('\n=== spaia.jp データ取得開始 ===\n');

  const rosters = [];

  for (const teamDef of TEAM_MAP) {
    const result = await fetchTeam(teamDef);
    rosters.push(result);
  }

  console.log('\n=== ファイル生成 ===');
  const content = buildFileContent(rosters);

  if (DRY_RUN) {
    console.log('\n--- 生成内容（dry-run）---');
    console.log(content.slice(0, 3000));
    console.log('...(以下省略)...');
  } else {
    const outPath = path.join(__dirname, '..', 'src', 'data', 'npb2025.js');
    // バックアップ作成
    const backupPath = outPath.replace('.js', `.backup.${Date.now()}.js`);
    if (fs.existsSync(outPath)) {
      fs.copyFileSync(outPath, backupPath);
      console.log(`バックアップ: ${path.basename(backupPath)}`);
    }
    fs.writeFileSync(outPath, content, 'utf8');
    console.log(`出力完了: ${outPath}`);
  }

  // 統計サマリー
  console.log('\n=== 取得結果サマリー ===');
  for (const { gameId, batters, pitchers } of rosters) {
    const team = TEAM_MAP.find(t => t.gameId === gameId);
    const status = batters.length > 0 && pitchers.length > 0 ? '✅' : '⚠';
    console.log(`  ${status} [${gameId}] ${team?.name}: 打者${batters.length}名 / 投手${pitchers.length}名`);
  }

  console.log('\n完了。');
})().catch(e => {
  console.error('致命的エラー:', e);
  process.exit(1);
});
