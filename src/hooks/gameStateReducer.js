export const G = {
  APPLY_PROGRESS: 'APPLY_PROGRESS',
  SET_FARM_COMPETITION: 'SET_FARM_COMPETITION',
  SET_TEAMS:    'SET_TEAMS',
  UPD_TEAM:     'UPD_TEAM',
  SET_GAME_DAY: 'SET_GAME_DAY',
  SET_YEAR:     'SET_YEAR',
  SET_MY_ID:    'SET_MY_ID',
  SET_SAVE_ID:  'SET_SAVE_ID',
};

/**
 * @param {{ teams: any[], gameDay: number, year: number, myId: string|null }} state
 * @param {{ type: string, [key: string]: any }} action
 */
export function gameStateReducer(state, action) {
  switch (action.type) {
    case G.APPLY_PROGRESS:
      return {...state,...Object.fromEntries(['teams','gameDay','year','myId','saveId','farmCompetition'].filter(k=>k in action.candidate).map(k=>[k,action.candidate[k]]))};
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
      return { ...state, saveId: action.saveId };
    default:
      return state;
  }
}
