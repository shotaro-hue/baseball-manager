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

  // 2. リーグ内カード生成（各リーグ42カード前後 × 各カード3試合固定）
  const ceCards = buildLeagueRounds(ceIds, preDates.length + postDates.length);
  const rawPaCards = buildLeagueRounds(paIds, preDates.length + postDates.length);

  // 3. 交流戦ラウンド生成（18ラウンド×6試合）
  const ilRounds = buildInterleagueRounds(ceIds, paIds, params);

  // 4. 日付へ割り当て
  const schedule = [null]; // 1-indexed

  // PAラウンドを甲子園ブラックアウト対策で並び替え:
  // オリックスアウェイラウンドをブラックアウト日付に優先配置し、
  // ホーム試合数の減少を防ぐ（57→約69試合に改善）
  const regularDates = [...preDates, ...postDates];
  const paCards = reorderPaRoundsForOrix(rawPaCards, regularDates, params.koshienBlackout);

  const regularState = { ceIdx: 0, paIdx: 0 };

  /**
   * 仕様:
   * - レギュラーシーズンは「カード単位」で割り当てる（同一対戦を連続3試合）。
   * - 月曜休み/オールスター休止日は buildCalendarSections で除外済みなので、
   *   カードは「連続するゲーム日」に展開される（暦日連続は保証しない）。
   * - 甲子園制約はカードを分断せず、各ゲーム日に制約適用のみ行う。
   * - レギュラー125日のように3で割り切れない端数日は末尾カードのみ2試合になる。
   */
  const assignRegularCards = (dates) => {
    let dateIdx = 0;
    while (dateIdx < dates.length) {
      const ceCard = ceCards[regularState.ceIdx++];
      const paCard = paCards[regularState.paIdx++];
      if (!ceCard || !paCard) break;

      const games = Math.min(ceCard.games, paCard.games, dates.length - dateIdx);
      for (let g = 0; g < games; g++) {
        const date = dates[dateIdx++];
        const isBlackout = isKoshienBlackout(date, params.koshienBlackout);
        const matchups = [
          ...ceCard.matchups.map(m => applyHanshinConstraint(m, isBlackout)),
          ...paCard.matchups.map(m => applyOrixConstraint(m, isBlackout)),
        ];

        schedule.push({
          gameNo: schedule.length,
          date,
          isInterleague: false,
          matchups,
        });
      }
    }
  };

  assignRegularCards(preDates);

  // 交流戦ラウンドを挿入
  for (let i = 0; i < 18; i++) {
    schedule.push({
      gameNo: schedule.length,
      date: ilDates[i],
      isInterleague: true,
      matchups: ilRounds[i].map(m => ({ ...m, venueNote: null })),
    });
  }

  assignRegularCards(postDates);

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
function reorderPaRoundsForOrix(paCards, regularDates, koshienBlackout) {
  if (!koshienBlackout) return paCards;

  // カードをオリックスホーム/アウェイで分類
  const cardDateRanges = [];
  let dateIdx = 0;
  paCards.forEach(card => {
    const start = dateIdx;
    const end = Math.min(regularDates.length - 1, dateIdx + card.games - 1);
    cardDateRanges.push({ start, end });
    dateIdx += card.games;
  });

  const orixAwayIdx = [];
  const orixHomeIdx = [];
  paCards.forEach((card, i) => {
    const m = card.matchups.find(r => r.homeId === ORIX_ID || r.awayId === ORIX_ID);
    if (m && m.homeId === ORIX_ID) orixHomeIdx.push(i);
    else orixAwayIdx.push(i);
  });

  // ブラックアウトに触れるカード/触れないカードを抽出
  const blackoutCardPos = [];
  const nonBlackoutCardPos = [];
  cardDateRanges.forEach(({ start, end }, i) => {
    let hasBlackout = false;
    for (let d = start; d <= end; d++) {
      if (isKoshienBlackout(regularDates[d], koshienBlackout)) {
        hasBlackout = true;
        break;
      }
    }
    if (hasBlackout) blackoutCardPos.push(i);
    else nonBlackoutCardPos.push(i);
  });

  const reordered = new Array(paCards.length);

  // ブラックアウトに触れるカードへオリックスアウェイカードを優先割り当て
  const awayQ = [...orixAwayIdx];
  const homeQ = [...orixHomeIdx];

  for (const pos of blackoutCardPos) {
    const srcIdx = awayQ.length > 0 ? awayQ.shift() : homeQ.shift();
    reordered[pos] = paCards[srcIdx];
  }

  // 非ブラックアウトカードに残りを割り当て（ホーム優先）
  const remainingQ = [...homeQ, ...awayQ];
  for (const pos of nonBlackoutCardPos) {
    reordered[pos] = paCards[remainingQ.shift()];
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
 * 1リーグ（6チーム）のカード配列を生成
 * - 1カード = 同一対戦3試合固定（末尾のみ2試合になる場合あり）
 * - return: [{ matchups: Matchup[3], games: 2|3 }, ...]
 */
function buildLeagueRounds(teamIds, totalGames = 125) {
  const berger = bergerRounds(teamIds); // 5ラウンド
  const totalCards = Math.ceil(totalGames / 3);

  // ペアごとのカード出現回数（ホーム交互にする）
  const pairCardCount = {};
  const cards = [];

  for (let cardIdx = 0; cardIdx < totalCards; cardIdx++) {
    const round = berger[cardIdx % berger.length];
    const matchups = round.map(([a, b]) => {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      const count = pairCardCount[key] || 0;
      pairCardCount[key] = count + 1;
      return count % 2 === 0
        ? { homeId: a, awayId: b }
        : { homeId: b, awayId: a };
    });

    const remaining = totalGames - cardIdx * 3;
    cards.push({ matchups, games: Math.min(3, remaining) });
  }

  return cards;
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

/**
 * オールスター実施タイミング（「休止明け最初のゲーム日」）を返す
 * - useSeasonFlow 側は gameDay+1 と比較して発火するため、
 *   この値は「休止明け再開日の gameDay」を返す。
 */
export function getAllStarBreakInfo(year, schedule) {
  const params = SEASON_PARAMS[year] || getDefaultParams(year);
  const skips = params.allStarSkipDates || [];
  if (!schedule?.length || skips.length === 0) {
    return { triggerGameDay: 72, restDates: [], gameDates: [], breakDates: [] };
  }

  const toNum = (d) => d.month * 100 + d.day;
  const sorted = [...skips].sort((a, b) => toNum(a) - toNum(b));
  const breakDates = sorted;
  const restDates = [sorted[0], sorted[sorted.length - 1]].filter(Boolean);
  const gameDates = sorted.slice(1, 3); // 前後1休み・中2試合

  for (let dayNo = 1; dayNo < schedule.length; dayNo++) {
    const d = schedule[dayNo]?.date;
    if (d && toNum(d) > toNum(sorted[sorted.length - 1])) {
      return { triggerGameDay: dayNo, restDates, gameDates, breakDates };
    }
  }
  return { triggerGameDay: 72, restDates, gameDates, breakDates };
}

/**
 * 後方互換: 旧API（オールスター発火gameDayのみ）
 */
export function getAllStarGameDay(year, schedule) {
  return getAllStarBreakInfo(year, schedule).triggerGameDay;
}
