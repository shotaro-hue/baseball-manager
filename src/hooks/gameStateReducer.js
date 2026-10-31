import { clamp } from '../utils';
import { contractEconomyMode, toAnnualState } from '../engine/contractEconomy';
import { validateEconomyClock } from '../engine/economyCalendar';

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

const domainFields = ['teams', 'gameDay', 'year', 'myId', 'saveId', 'farmCompetition', 'farmCompetitionVersion', 'battedBallReceipt',
  'faPool', 'faYears', 'offseasonPlan', 'mailbox', 'news', 'schedule', 'contractEconomy'];
const legacyWrites = new Set([G.APPLY_PROGRESS, G.SET_TEAMS, G.UPD_TEAM, G.SET_GAME_DAY, G.SET_YEAR,
  G.SET_MY_ID, G.SET_SAVE_ID, G.SET_FA_POOL, G.SET_FA_YEARS, G.SET_OFFSEASON_PLAN, G.SET_SCHEDULE,
  G.SET_FARM_COMPETITION, G.ANSWER_INTERVIEW]);
const fieldActions = { [G.SET_FA_POOL]: 'faPool', [G.SET_FA_YEARS]: 'faYears',
  [G.SET_OFFSEASON_PLAN]: 'offseasonPlan', [G.SET_MAILBOX]: 'mailbox', [G.SET_SCHEDULE]: 'schedule' };
// `season` is deliberately absent: legacy uses it for injuries AND contracts,
// posting, FA and releases. Ambiguous/new event types belong to the world action.
// Interviews also carry a decision with team effects, not just display content.
const independentNotifications = {
  news: new Set(['game', 'allstar', 'record']),
  mailbox: new Set(['championship', 'hof', 'morale_warning']),
};

function updateAnnualNotifications(state, field, value) {
  try {
    // A legacy functional updater must not mutate the live world before the
    // guard can reject it. Notifications are persisted plain data.
    const previous = state[field];
    const next = typeof value === 'function' ? value(structuredClone(previous)) : structuredClone(value);
    if (!Array.isArray(next) || next.some(item => !item || typeof item !== 'object'
      || !((typeof item.id === 'string' && item.id.trim()) || (Number.isSafeInteger(item.id) && item.id >= 0)))
      || new Set(next.map(item => String(item.id))).size !== next.length) return state;
    const protectedContent = items => items.filter(item => !independentNotifications[field].has(item.type)).map(item => {
      if (field !== 'mailbox') return item;
      // Reading is presentation-only; resolving/answering/changing a contract
      // must still arrive with its ledger and roster in APPLY_ECONOMY_WORLD.
      const { read, ...content } = item;
      return content;
    });
    if (field === 'mailbox' && next.some(item => Object.hasOwn(item, 'read') && typeof item.read !== 'boolean')) return state;
    if (JSON.stringify(protectedContent(previous)) !== JSON.stringify(protectedContent(next))) return state;
    if (JSON.stringify(previous) === JSON.stringify(next)) return state;
    const revision = state.contractEconomy.revision + 1;
    if (!Number.isSafeInteger(revision)) return state;
    // Fence an already prepared economic candidate so it cannot overwrite a
    // newer ordinary notice/read flag with its stale notification snapshot.
    return { ...state, [field]: next, contractEconomy: { ...state.contractEconomy, revision } };
  } catch { return state; }
}

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
  if (action.type === G.SET_MAILBOX || action.type === G.SET_NEWS) {
    try {
      if (contractEconomyMode(state) === 'annual') return action.type === G.SET_MAILBOX
        ? updateAnnualNotifications(state, 'mailbox', action.value) : updateAnnualNotifications(state, 'news', action.news);
    } catch { return state; }
  }
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
        validateEconomyClock(world, state);
        const next = { ...state };
        // Absence is meaningful to save validators (e.g. an unmigrated farm).
        // Do not manufacture present-but-undefined payloads on adoption.
        for (const key of domainFields) {
          if (Object.hasOwn(world, key)) next[key] = world[key];
          else delete next[key];
        }
        return next;
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
      // Legacy hydration only. Annual farm results, roster effects and clock
      // must arrive together in APPLY_ECONOMY_WORLD with one new revision.
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
