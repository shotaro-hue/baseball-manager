import {
  POP_WIN_BASE, POP_WIN_STREAK,
  POP_LOSS_BASE, POP_LOSS_STREAK3, POP_LOSS_STREAK5,
  POP_DRIFT_RATE,
} from '../constants';

/**
 * 試合結果に基づく popularity 変動値を返す。
 * @param {boolean} won  勝利
 * @param {boolean} drew 引き分け
 * @param {number}  loseStreak 前試合時点の連敗数
 * @param {number}  winStreak  前試合時点の連勝数
 * @returns {number}
 */
export function calcPopularityDelta(won, drew, loseStreak, winStreak) {
  if (drew) return 0;
  if (won)  return winStreak >= 3 ? POP_WIN_STREAK : POP_WIN_BASE;
  return loseStreak >= 5 ? POP_LOSS_STREAK5 : loseStreak >= 3 ? POP_LOSS_STREAK3 : POP_LOSS_BASE;
}

/**
 * オフシーズン終了時の popularity 補正値を返す。
 * @param {number}  rank        リーグ内順位（1始まり）
 * @param {number}  totalTeams  リーグチーム数
 * @param {boolean} isChampion  日本一
 * @param {boolean} isPennant   リーグ優勝
 * @param {boolean} isCS        CS出場（上位3位以内）
 * @returns {number}
 */
export function calcOffseasonPopDelta(rank, totalTeams, isChampion, isPennant, isCS) {
  if (isChampion) return 15;
  if (isPennant)  return 8;
  if (isCS)       return 3;
  if (rank === totalTeams) return -5;
  return 0;
}

/**
 * popularity を50方向へ POP_DRIFT_RATE 分だけ回帰させる（オフシーズン適用）。
 * @param {number} pop
 * @returns {number}
 */
export function driftPopularity(pop) {
  return pop + Math.round((50 - pop) * POP_DRIFT_RATE);
}

/**
 * 試合後のチーム state 差分（popularity / winStreak / loseStreak）を返す。
 * 副作用なし。読み取りは team の pre-game 値を使うこと。
 * @param {{ popularity?: number, winStreak?: number, loseStreak?: number }} team
 * @param {boolean} won
 * @param {boolean} drew
 * @returns {{ popularity: number, winStreak: number, loseStreak: number }}
 */
export function applyPopularityDelta(team, won, drew) {
  const prevLose = team.loseStreak ?? 0;
  const prevWin  = team.winStreak  ?? 0;
  const delta    = calcPopularityDelta(won, drew, prevLose, prevWin);
  return {
    popularity:  Math.min(100, Math.max(0, (team.popularity ?? 50) + delta)),
    winStreak:   won             ? prevWin  + 1 : 0,
    loseStreak:  (!won && !drew) ? prevLose + 1 : 0,
  };
}
