export const G = {
  SET_TEAMS:    'SET_TEAMS',
  UPD_TEAM:     'UPD_TEAM',
  SET_GAME_DAY: 'SET_GAME_DAY',
  SET_YEAR:     'SET_YEAR',
  SET_MY_ID:    'SET_MY_ID',
};

/**
 * @param {{ teams: any[], gameDay: number, year: number, myId: string|null }} state
 * @param {{ type: string, [key: string]: any }} action
 */
export function gameStateReducer(state, action) {
  switch (action.type) {
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
    default:
      return state;
  }
}
