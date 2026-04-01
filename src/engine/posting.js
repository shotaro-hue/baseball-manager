import { rngf } from '../utils';
import { tradeValue } from './trade';

/**
 * ポスティングシステム — 選手申請確率・MLB入札額計算
 * @module posting
 */

export const POSTING_FEE_RATE        = 0.20; // 移籍金: 落札額の20%
export const POSTING_OVERSEAS_THRESHOLD = 60; // 申請可能最低 overseas 値

/**
 * オフシーズンにおける選手のポスティング申請確率を計算する（純関数）。
 * @param {{ personality?: { overseas?: number }, age?: number, morale?: number, isPitcher?: boolean, stats?: { PA?: number, BF?: number }, postingRequested?: boolean }} player
 * @returns {number} 0.0〜0.9 の申請確率
 */
export function calcPostingRequestProb(player) {
  const overseas = player.personality?.overseas ?? 0;
  if (overseas < POSTING_OVERSEAS_THRESHOLD) return 0;
  if (player.postingRequested) return 0;

  // overseas 60→0.0, 80→0.5, 100→1.0
  const base = (overseas - POSTING_OVERSEAS_THRESHOLD) / (100 - POSTING_OVERSEAS_THRESHOLD);

  const age = player.age ?? 25;
  const ageFactor = (age >= 24 && age <= 30) ? 1.0 : age > 30 ? 0.7 : 0.5;

  const morale = player.morale ?? 70;
  const moraleFactor = morale < 50 ? 1.3 : morale > 80 ? 0.7 : 1.0;

  const pa = player.stats?.PA ?? 0;
  const bf = player.stats?.BF ?? 0;
  const underused = player.isPitcher ? bf < 80 : pa < 200;
  const playFactor = underused ? 1.2 : 1.0;

  return Math.min(0.9, base * ageFactor * moraleFactor * playFactor);
}

/**
 * MLB 球団からの入札額を計算する（純関数）。
 * tradeValue(0-100) を 500万円スケールに変換し、乱数 0.8〜1.5 を掛ける。
 * @param {Object} player
 * @returns {number} 入札額（円）
 */
export function calcPostingBid(player) {
  const baseValue = tradeValue(player) * 5_000_000;
  return Math.round(baseValue * rngf(0.8, 1.5));
}
