import { clamp } from '../utils';
import { contractEconomyMode, toAnnualState } from '../engine/contractEconomy';

export const G = {
  APPLY_PROGRESS: 'APPLY_PROGRESS',
  APPLY_ECONOMY_WORLD: 'APPLY_ECONOMY_WORLD',
  SET_FA_POOL: 'SET_FA_POOL',
  SET_FA_YEARS: 'SET_FA_YEARS',
  SET_OFFSEASON_PLAN: 'SET_OFFSEASON_PLAN',
  SET_MAILBOX: 'SET_MAILBOX',
  SET_SCHEDULE: 'SET_SCHEDULE',
  SET_FARM_COMPETITION: 'SET_FARM_COMPETITION',
  SET_TEAMS:    'SET_TEAMS',
  UPD_TEAM:     'UPD_TEAM',
  SET_GAME_DAY: 'SET_GAME_DAY',
  SET_YEAR:     'SET_YEAR',
  SET_MY_ID:    'SET_MY_ID',
  SET_SAVE_ID:  'SET_SAVE_ID',
  SET_NEWS: 'SET_NEWS',
  ANSWER_INTERVIEW: 'ANSWER_INTERVIEW',
};

const domainFields = ['teams', 'gameDay', 'year', 'myId', 'saveId', 'farmCompetition', 'battedBallReceipt',
  'faPool', 'faYears', 'offseasonPlan', 'mailbox', 'news', 'schedule', 'contractEconomy'];
const legacyWrites = new Set([G.APPLY_PROGRESS, G.SET_TEAMS, G.UPD_TEAM, G.SET_GAME_DAY, G.SET_YEAR,
  G.SET_MY_ID, G.SET_SAVE_ID, G.SET_FA_POOL, G.SET_FA_YEARS, G.SET_OFFSEASON_PLAN, G.SET_SCHEDULE, G.ANSWER_INTERVIEW]);
const fieldActions = { [G.SET_FA_POOL]: 'faPool', [G.SET_FA_YEARS]: 'faYears',
  [G.SET_OFFSEASON_PLAN]: 'offseasonPlan', [G.SET_MAILBOX]: 'mailbox', [G.SET_SCHEDULE]: 'schedule' };
export function canApplyLegacyProgress(state, candidate) {
  try { return contractEconomyMode(state) === 'legacy' && contractEconomyMode(candidate) === 'legacy'; }
  catch { return false; }
}

// Accept only a choice actually offered by the current, unanswered article.
export function interviewChoice(article, option) {
  if (article?.type !== 'interview' || article.answered || !option) return null;
  return article.options?.find(choice => choice && typeof choice.text === 'string'
    && Number.isFinite(choice.popMod) && Number.isFinite(choice.moraleMod)
    && choice.text === option.text && choice.popMod === option.popMod && choice.moraleMod === option.moraleMod) ?? null;
}

/**
 * @param {{ teams: any[], gameDay: number, year: number, myId: string|null }} state
 * @param {{ type: string, [key: string]: any }} action
 */
export function gameStateReducer(state, action) {
  if (legacyWrites.has(action.type) && !canApplyLegacyProgress(state, action.candidate ?? {})) return state;
  if (fieldActions[action.type]) {
    const key = fieldActions[action.type];
    return { ...state, [key]: typeof action.value === 'function' ? action.value(state[key]) : action.value };
  }
  switch (action.type) {
    case G.APPLY_ECONOMY_WORLD: {
      // Persistence will own dispatching this action after publish (A1-1d).
      // A1-1a exposes no public hook that activates/adopts an annual fixture.
      try {
        const { world, expected } = action, e = state.contractEconomy;
        if (contractEconomyMode(state) !== 'annual' || !expected || expected.saveId !== state.saveId
          || expected.epoch !== e.epoch || expected.baseRevision !== e.revision || world.saveId !== state.saveId
          || world.contractEconomy?.epoch !== e.epoch || world.contractEconomy.revision !== e.revision + 1) return state;
        toAnnualState(world);
        return { ...state, ...Object.fromEntries(domainFields.map(k => [k, world[k]])) };
      } catch { return state; }
    }
    case G.SET_NEWS:
      return { ...state, news: typeof action.news === 'function' ? action.news(state.news) : action.news };
    case G.ANSWER_INTERVIEW: {
      if (state.myId == null || state.myId !== action.myId || state.saveId !== action.saveId
        || !state.teams.some(team => team.id === state.myId)) return state;
      const choice = interviewChoice(state.news.find(article => article.id === action.newsId), action.option);
      if (!choice) return state;
      // One pure transition: queued/replayed decisions see answered before effects.
      return {
        ...state,
        teams: state.teams.map(team => team.id === state.myId ? {
          ...team,
          popularity: clamp((team.popularity || 50) + choice.popMod, 0, 100),
          players: team.players.map(player => ({ ...player, morale: clamp((player.morale || 60) + choice.moraleMod, 0, 100) })),
        } : team),
        news: state.news.map(article => article.id === action.newsId ? { ...article, answered: true } : article),
      };
    }
    case G.APPLY_PROGRESS:
      return {...state,
        ...(action.candidate.saveId && action.candidate.saveId !== state.saveId ? { battedBallReceipt: null } : {}),
        ...Object.fromEntries(domainFields.filter(k=>k in action.candidate).map(k=>[k,action.candidate[k]]))};
    case G.SET_FARM_COMPETITION:
      return {...state,farmCompetition:action.competition};
    case G.SET_TEAMS:
      return { ...state, teams: typeof action.teams === 'function' ? action.teams(state.teams) : action.teams };
    case G.UPD_TEAM:
      return { ...state, teams: state.teams.map(t => t.id === action.id ? action.fn(t) : t) };
    case G.SET_GAME_DAY:
      return { ...state, gameDay: typeof action.day === 'function' ? action.day(state.gameDay) : action.day };
    case G.SET_YEAR:
      return { ...state, year: typeof action.year === 'function' ? action.year(state.year) : action.year };
    case G.SET_MY_ID:
      return { ...state, myId: action.myId };
    case G.SET_SAVE_ID:
      return { ...state, saveId: action.saveId, battedBallReceipt: action.saveId === state.saveId ? state.battedBallReceipt : null };
    default:
      return state;
  }
}
