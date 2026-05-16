import { uid, rng, rngf, gameDayToDate } from '../utils';
import {
  checkForInjuries,
  tickInjuries,
  tickPositionTraining,
} from '../engine/player';
import { quickSimGame } from '../engine/simulation';
import {
  applyGameStatsFromLog,
  applyPostGameCondition,
  computeBoxScore,
} from '../engine/postGame';
import { calcRevenue } from '../engine/finance';
import { applyPopularityDelta } from '../engine/fanSentiment';
import {
  generateCpuOffer,
  generateCpuCpuTrade,
  classifyTeam,
  evaluateFrontOfficePlan,
} from '../engine/trade';
import { selectAllStars, runAllStarGame } from '../engine/allstar';
import { getMyMatchup, getCpuMatchups } from '../engine/scheduleGen';
import { processCpuFaBids } from '../engine/contract';
import {
  SEASON_GAMES,
  NEWS_TEMPLATES_WIN,
  NEWS_TEMPLATES_LOSE,
  INTERVIEW_QUESTIONS_WIN,
  INTERVIEW_QUESTIONS_LOSE,
  INTERVIEW_OPTIONS_WIN,
  INTERVIEW_OPTIONS_LOSE,
  INJURY_AUTO_DEMOTE_DAYS,
  REGISTRATION_COOLDOWN_DAYS,
  TRADE_DEADLINE_MONTH,
  TRADE_DEADLINE_PROB_EARLY,
  TRADE_DEADLINE_PROB_PEAK,
  TRADE_DEADLINE_CPU_CPU_PROB,
  INJURY_HISTORY_MAX,
  MAX_ROSTER,
  CPU_AUTO_MANAGE_INTERVAL,
  ROSTER_SWAP_SCORE_THRESHOLD,
  ROSTER_DEVREC_BONUS,
  ROSTER_DEVREC_POTENTIAL_MIN,
  ROSTER_DEVREC_DAYS_MAX,
  FIELDING_POSITIONS,
  OPTIMAL_PITCHER_COUNT,
  MIN_ACTIVE_CATCHERS,
} from '../constants';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';

const MAX_FOREIGN_ACTIVE = 4;
const MAX_BATCH_BOX_SCORE_KEEP = 120;
const DEFAULT_PROGRESS_THROTTLE_MS = 250;
const DEFAULT_PROGRESS_PHASE = 'Simulating games';

export function createSeasonBatchProgressState(throttleMs = DEFAULT_PROGRESS_THROTTLE_MS) {
  return {
    throttleMs: Math.max(0, Number(throttleMs) || 0),
    lastEmitAt: null,
  };
}

export function shouldEmitSeasonBatchProgress(state, now, options = {}) {
  if (!state || typeof state !== 'object') return true;
  if (options.force) {
    state.lastEmitAt = now;
    return true;
  }
  if (state.lastEmitAt == null) {
    state.lastEmitAt = now;
    return true;
  }
  if ((now - state.lastEmitAt) >= state.throttleMs) {
    state.lastEmitAt = now;
    return true;
  }
  return false;
}

class SeasonBatchCancelledError extends Error {
  constructor() {
    super('Season batch simulation cancelled');
    this.name = 'SeasonBatchCancelledError';
  }
}

function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function ensureNotCancelled(isCancelled) {
  if (typeof isCancelled === 'function' && isCancelled()) {
    throw new SeasonBatchCancelledError();
  }
}

function emitProgress({
