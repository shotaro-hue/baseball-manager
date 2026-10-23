import { clamp } from '../utils';

export const G = {
  APPLY_PROGRESS: 'APPLY_PROGRESS',
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
  switch (action.type) {
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
        ...Object.fromEntries(['teams','gameDay','year','myId','saveId','farmCompetition','battedBallReceipt'].filter(k=>k in action.candidate).map(k=>[k,action.candidate[k]]))};
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
