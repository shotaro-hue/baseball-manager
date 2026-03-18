/* ═══════════════════════════════════════════════
   NPBシーズン日程生成エンジン
   - 143試合分のScheduleDayを事前生成する
   - 2025年は実績パラメータ準拠、2026年以降は自動算出
═══════════════════════════════════════════════ */

import { SEASON_PARAMS, getDefaultParams } from '../data/scheduleParams.js';

const HANSHIN_ID = 3;
const ORIX_ID    = 11;

/* ─── 型定義（JSDoc参照）─────────────────────────
  ScheduleDay = {
    gameNo: number,          // 1-143
    date: {month, day},
    isInterleague: boolean,
    matchups: Matchup[],     // 常に6要素
  }
  Matchup = {
    homeId: number,
    awayId: number,
    isInterleague: boolean,
    venueNote: null | "kyocera",
  }
──────────────────────────────────────────────── */

/**
 * シーズン日程を生成して返す
 * @param {number} year
 * @param {Array} teams - 12チームの配列（id, leagueプロパティを持つ）
 * @returns {Array} schedule - インデックス0はnull、1〜143がScheduleDay
 */
export function generateSeasonSchedule(year, teams) {
  const params = SEASON_PARAMS[year] || getDefaultParams(year);

  const ceIds = teams
    .filter(t => t.league === 'セ')
    .sort((a, b) => a.id - b.id)
    .map(t => t.id); // [0,1,2,3,4,5]

  const paIds = teams
    .filter(t => t.league === 'パ')
    .sort((a, b) => a.id - b.id)
    .map(t => t.id); // [6,7,8,9,10,11]

  // 1. カレンダーセクションを構築
  const { preDates, ilDates, postDates } = buildCalendarSections(year, params);
  // preDates + postDates = 125日、ilDates = 18日

  // 2. リーグ内ラウンド生成（各リーグ125ラウンド×3試合）
  const ceRounds = buildLeagueRounds(ceIds);   // length=125
  const rawPaRounds = buildLeagueRounds(paIds); // length=125

  // 3. 交流戦ラウンド生成（18ラウンド×6試合）
  const ilRounds = buildInterleagueRounds(ceIds, paIds, params);

  // 4. 日付へ割り当て
  const schedule = [null]; // 1-indexed

  // PAラウンドを甲子園ブラックアウト対策で並び替え:
  // オリックスアウェイラウンドをブラックアウト日付に優先配置し、
  // ホーム試合数の減少を防ぐ（57→約69試合に改善）
  const regularDates = [...preDates, ...postDates]; // 125日
  const paRounds = reorderPaRoundsForOrix(rawPaRounds, regularDates, params.koshienBlackout);

  let ceIdx = 0;
  let paIdx = 0;

  const assignRegular = (dates) => {
    for (const date of dates) {
      const isBlackout = isKoshienBlackout(date, params.koshienBlackout);
      const ceRound = ceRounds[ceIdx++];
      const paRound = paRounds[paIdx++];

      const matchups = [
        ...ceRound.map(m => applyHanshinConstraint(m, isBlackout)),
        ...paRound.map(m => applyOrixConstraint(m, isBlackout)),
      ];

      schedule.push({
        gameNo: schedule.length,
        date,
        isInterleague: false,
        matchups,
      });
    }
  };

  assignRegular(preDates);

  // 交流戦ラウンドを挿入
  for (let i = 0; i < 18; i++) {
    schedule.push({
      gameNo: schedule.length,
      date: ilDates[i],
      isInterleague: true,
      matchups: ilRounds[i].map(m => ({ ...m, venueNote: null })),
    });
  }

  assignRegular(postDates);

  // schedule[1..143] が完成（schedule.length - 1 === 143 のはず）
  return schedule;
}

/* ─── カレンダー構築 ──────────────────────────── */

/**
 * 前半戦・交流戦・後半戦の日付配列を返す
 */
function buildCalendarSections(year, params) {
  const { openingDate, interleagueStart, allStarSkipDates } = params;
  const skipSet = new Set(
    (allStarSkipDates || []).map(d => `${d.month}-${d.day}`)
  );

  let { month, day } = openingDate;
  const allDates = [];

  // 143日分のゲーム日を収集（月曜+AllStarスキップ）
  while (allDates.length < 143) {
    const dow = new Date(year, month - 1, day).getDay(); // 0=日,1=月,...
    const isMon = dow === 1;
    const isSkip = skipSet.has(`${month}-${day}`);

    if (!isMon && !isSkip) {
      allDates.push({ month, day });
    }

    // 翌日へ
    day++;
    const maxDay = new Date(year, month, 0).getDate();
    if (day > maxDay) { day = 1; month++; }
    if (month > 12) break;
  }

  // 交流戦開始インデックスを特定
  let ilStartIdx = allDates.findIndex(
    d => d.month === interleagueStart.month && d.day === interleagueStart.day
  );
  if (ilStartIdx < 0) {
    // 交流戦開始日がゲーム日に含まれない場合は近い日付を探す
    ilStartIdx = allDates.findIndex(
      d => d.month === interleagueStart.month && d.day >= interleagueStart.day
    );
    if (ilStartIdx < 0) ilStartIdx = 57; // フォールバック
  }

  return {
    preDates:  allDates.slice(0, ilStartIdx),
    ilDates:   allDates.slice(ilStartIdx, ilStartIdx + 18),
    postDates: allDates.slice(ilStartIdx + 18),
  };
}

/* ─── PAラウンド並び替え（オリックスホーム均等化） ── */

/**
 * PAラウンド配列を並び替えて、甲子園ブラックアウト期間に
 * オリックスがアウェイになるラウンドを優先配置する。
 * これにより applyOrixConstraint によるスワップ回数を最小化し、
 * オリックスのシーズンホーム試合数を約69試合（57→+12改善）に近づける。
 */
function reorderPaRoundsForOrix(paRounds, regularDates, koshienBlackout) {
  if (!koshienBlackout) return paRounds;

  // ラウンドをオリックスホーム/アウェイで分類
  const orixAwayIdx = [];
  const orixHomeIdx = [];
  paRounds.forEach((round, i) => {
    const m = round.find(r => r.homeId === ORIX_ID || r.awayId === ORIX_ID);
    if (m && m.homeId === ORIX_ID) orixHomeIdx.push(i);
    else orixAwayIdx.push(i);
  });

  // ブラックアウト/非ブラックアウト日付インデックスを抽出
  const blackoutPos    = [];
  const nonBlackoutPos = [];
  regularDates.forEach((d, i) => {
    if (isKoshienBlackout(d, koshienBlackout)) blackoutPos.push(i);
    else nonBlackoutPos.push(i);
  });

  const reordered = new Array(paRounds.length);

  // ブラックアウト日付にオリックスアウェイラウンドを優先割り当て
  const awayQ = [...orixAwayIdx];
  const homeQ = [...orixHomeIdx];

  for (const pos of blackoutPos) {
    const srcIdx = awayQ.length > 0 ? awayQ.shift() : homeQ.shift();
    reordered[pos] = paRounds[srcIdx];
  }

  // 非ブラックアウト日付に残りのラウンドを割り当て（ホーム優先）
  const remainingQ = [...homeQ, ...awayQ];
  for (const pos of nonBlackoutPos) {
    reordered[pos] = paRounds[remainingQ.shift()];
  }

  return reordered;
}

/* ─── 甲子園制約 ─────────────────────────────── */

function isKoshienBlackout(date, koshienBlackout) {
  if (!koshienBlackout) return false;
  const n = date.month * 100 + date.day;
  const inRange = (r) => {
    if (!r) return false;
    const s = r.start.month * 100 + r.start.day;
    const e = r.end.month * 100 + r.end.day;
    return n >= s && n <= e;
  };
  return inRange(koshienBlackout.spring) || inRange(koshienBlackout.summer);
}

/** 阪神ホームゲームに甲子園制約適用 */
function applyHanshinConstraint(matchup, isBlackout) {
  const venueNote = (isBlackout && matchup.homeId === HANSHIN_ID) ? 'kyocera' : null;
  return { ...matchup, isInterleague: false, venueNote };
}

/**
 * オリックスホームゲームに甲子園競合制約適用
 * 阪神が京セラを使う期間はオリックスをアウェイ側に移動
 */
function applyOrixConstraint(matchup, isBlackout) {
  if (isBlackout && matchup.homeId === ORIX_ID) {
    return {
      homeId: matchup.awayId,
      awayId: ORIX_ID,
      isInterleague: false,
      venueNote: null,
    };
  }
  return { ...matchup, isInterleague: false, venueNote: null };
}

/* ─── Bergerラウンドロビン ───────────────────── */

/**
 * 6チームのBerger方式ラウンドロビン（1サイクル=5ラウンド）
 * 各ラウンドに3マッチアップ（全チームが1試合ずつ）
 * @param {number[]} ids - 6チームのID配列
 * @returns {Array} 5ラウンド × [{a,b}]
 */
function bergerRounds(ids) {
  const n = ids.length; // 6
  const fixed = ids[n - 1];
  let rotating = ids.slice(0, n - 1); // [0,1,2,3,4]

  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [[rotating[0], fixed]];
    for (let i = 1; i < n / 2; i++) {
      pairs.push([rotating[i], rotating[n - 1 - i]]);
    }
    rounds.push(pairs);
    // 右ローテート: 最後を先頭へ
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, rotating.length - 1)];
  }
  return rounds; // 5ラウンド × 3ペア
}

/* ─── リーグ内日程生成 ───────────────────────── */

/**
 * 1リーグ（6チーム）の125ラウンドを生成
 * 各ペアが25試合（13H/12A）
 */
function buildLeagueRounds(teamIds) {
  const berger = bergerRounds(teamIds); // 5ラウンド

  // 全ペアの25試合スケジュールを生成
  // 各ペア (a,b): aが「Berger上の先側」→ 奇数ゲームでaがホーム（13回）、偶数でbがホーム（12回）
  const pairGames = {};
  const pairOrder = {};
  let pairCount = 0;
  berger.forEach(round => {
    round.forEach(([a, b]) => {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (!pairGames[key]) {
        const firstHome = a; // Bergerの先側をfirstHomeとする
        const secondHome = b;
        const games = [];
        for (let g = 0; g < 25; g++) {
          // 偶数g: firstHome がホーム（0,2,4,...,24 → 13回）
          // 奇数g: secondHome がホーム（1,3,...,23 → 12回）
          games.push(g % 2 === 0
            ? { homeId: firstHome, awayId: secondHome }
            : { homeId: secondHome, awayId: firstHome }
          );
        }
        pairGames[key] = games;
        pairOrder[key] = pairCount++;
      }
    });
  });

  // 各ペアの消費インデックス
  const pairIdx = {};
  Object.keys(pairGames).forEach(k => { pairIdx[k] = 0; });

  // 125ラウンドを生成（25 repetitions × 5 Berger rounds）
  const rounds = [];
  for (let rep = 0; rep < 25; rep++) {
    for (const round of berger) {
      const matchups = round.map(([a, b]) => {
        const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
        return { ...pairGames[key][pairIdx[key]++] };
      });
      rounds.push(matchups);
    }
  }

  return rounds; // 125ラウンド × 3マッチアップ
}

/* ─── 交流戦日程生成 ─────────────────────────── */

/**
 * 交流戦の18ラウンド（各ラウンド=6マッチアップ）を生成
 * 各チームが相手リーグ全6チームと各3試合（計18試合）
 * ラウンド0,2,4 → PAホーム；ラウンド1,3,5 → CEホーム
 *
 * 修正: r=0のpaHostsMapによるCE→PA初期対応から各CEチームの
 * PAオフセットを算出し、ラウンドr→offset+r でローテーション。
 * これにより全CEチームが全PAチームと正確に3試合ずつ対戦する。
 */
function buildInterleagueRounds(ceIds, paIds, params) {
  const paHostsMap = params.interleagueRound1PaHosts;

  // 各CEチームの開始PAインデックス（paIds内のインデックス）を決定
  // r=0でのCE→PA対応から算出; paHostsMapがない場合はceIdx%6
  const offsets = ceIds.map((ceId, ceIdx) => {
    if (paHostsMap) {
      const paId = paIds.find(pid => (paHostsMap[pid] || []).includes(ceId));
      if (paId !== undefined) return paIds.indexOf(paId);
    }
    return ceIdx % 6;
  });

  // ラウンドr、CEインデックスceIdxのマッチアップを生成
  // offset+r でPAチームをローテーション → 全6PAチームと1回ずつ対戦
  const getMatchup = (r, ceIdx) => {
    const ceId = ceIds[ceIdx];
    const paId = paIds[(offsets[ceIdx] + r) % 6];
    const isPaHome = r % 2 === 0; // 偶数ラウンド: PAがホーム
    return isPaHome
      ? { homeId: paId, awayId: ceId, isInterleague: true }
      : { homeId: ceId, awayId: paId, isInterleague: true };
  };

  const days = []; // 18要素（6ラウンド × 3連戦）

  for (let r = 0; r < 6; r++) {
    const series = ceIds.map((_, i) => getMatchup(r, i)); // 6マッチアップ
    for (let d = 0; d < 3; d++) {
      days.push(series.map(m => ({ ...m })));
    }
  }

  return days; // 18ラウンド × 6マッチアップ
}

/* ─── App.jsx から呼ぶユーティリティ ─────────── */

/**
 * 指定gameDay・チームIDのマッチアップを返す
 * @returns {{ oppId, isHome, venueNote, isInterleague } | null}
 */
export function getMyMatchup(schedule, gameDay, myId) {
  const day = schedule?.[gameDay];
  if (!day) return null;
  const m = day.matchups.find(x => x.homeId === myId || x.awayId === myId);
  if (!m) return null;
  return {
    oppId: m.homeId === myId ? m.awayId : m.homeId,
    isHome: m.homeId === myId,
    venueNote: m.venueNote,
    isInterleague: day.isInterleague,
  };
}

/**
 * 指定gameDay のCPU同士の試合マッチアップを返す（myId と oppId を除く）
 * @returns {Array<{homeId, awayId, isInterleague, venueNote}>}
 */
export function getCpuMatchups(schedule, gameDay, myId, oppId) {
  const day = schedule?.[gameDay];
  if (!day) return [];
  return day.matchups.filter(
    m => m.homeId !== myId && m.awayId !== myId &&
         m.homeId !== oppId && m.awayId !== oppId
  );
}
