import { describe, expect, it, vi, afterEach } from 'vitest';
import { advancePlayoff, createSeries, encodePlayoff, initPlayoff, nextPlayoffFixture, recordSeriesGame } from '../playoff';
import { rankLeague } from '../standings';
import { endHalfInning, initGameState, processAtBat, postseasonAtBatEndsGame, quickSimGame } from '../simulation';
import { simulateNextPlayoffGame } from '../playoffGame';
import { buildTeam } from '../playerCore';
import { optimizeTeamForGameStart, prepareTeamForGame } from '../rosterAutomation';
import { TEAM_DEFS } from '../../constants';

afterEach(() => vi.restoreAllMocks());
const club = (id, wins = 80, losses = 60, league = 'セ') => ({ id, name: `球団${id}`, short: `球${id}`, wins, losses, draws: 3, league });
const result = (my, opp) => ({ score: { my, opp }, log: [] });
const play = (series, outcomes) => outcomes.reduce((s, [a, b]) => recordSeriesGame(s, result(a, b), nextPlayoffFixture(s)), series);
const six = () => [club(0, 90, 50), club(1, 80, 60), club(2, 70, 70), club(6, 90, 50, 'パ'), club(7, 80, 60, 'パ'), club(8, 70, 70, 'パ')];

describe('NPB CS decisions', () => {
  it('preserves draws and clinches the first stage after a win and a draw', () => {
    const s = play(createSeries(club(0), club(1), 'first'), [[2, 1], [0, 0]]);
    expect(s).toMatchObject({ wins: [1, 0], done: true, winner: 0 });
    expect(s.games[1]).toMatchObject({ drew: true, winner: null });
    expect(recordSeriesGame(s, result(0, 9))).toBe(s);
  });
  it.each([
    [[[0, 0], [0, 0], [0, 0]], 0, [0, 0]],
    [[[0, 1], [1, 0], [0, 0]], 0, [1, 1]],
    [[[0, 1], [0, 0], [0, 0]], 1, [0, 1]],
    [[[0, 1], [0, 1]], 1, [0, 2]],
  ])('resolves bounded series with draws: %j', (games, winner, wins) => {
    expect(play(createSeries(club(0), club(1), 'first'), games)).toMatchObject({ done: true, winner, wins });
  });
  it('does not prematurely advance the upper club after two draws', () => {
    expect(play(createSeries(club(0), club(1), 'first'), [[0, 0], [0, 0]]).done).toBe(false);
  });
  it.each([
    [club(1, 81, 59), 4, 6, 1], // 9 games
    [club(1, 80, 60), 5, 7, 2], // 10 games
    [club(1, 79, 61), 5, 7, 2],
    [club(1, 70, 70), 5, 7, 2], // ten-game rule still applies
  ])('uses the 2026 gap boundary against the actual first-stage winner', (challenger, need, maxGames, advantage) => {
    expect(createSeries(club(0, 90, 50), challenger, 'final')).toMatchObject({ need, maxGames, adv: [advantage, 0] });
  });
  it('uses the below-.500 boundary separately and retains pre-2026 rules', () => {
    expect(createSeries(club(0, 71, 69), club(1, 70, 70), 'final').adv).toEqual([1, 0]);
    expect(createSeries(club(0, 71, 69), club(1, 69, 71), 'final').adv).toEqual([2, 0]);
    expect(createSeries(club(0, 90, 50), club(1, 60, 80), 'final', 2025)).toMatchObject({ adv: [1, 0], need: 4, maxGames: 6 });
  });
  it('counts the advantage when draws decide the normal and special finals', () => {
    const normal = play(createSeries(club(0, 80, 60), club(1, 75, 65), 'final'), [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(normal).toMatchObject({ done: true, winner: 0, wins: [1, 0] });
    const special = play(createSeries(club(0, 90, 50), club(1, 75, 65), 'final'), [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(special).toMatchObject({ done: true, winner: 0, wins: [2, 0] });
  });
});

describe('venues, inning limits and transitions', () => {
  it.each([2025, 2026])('uses the correct Japan Series home sequence in %i', year => {
    const s = createSeries(club(0), club(6, 80, 60, 'パ'), 'japan', year);
    const opening = year % 2 ? 6 : 0, other = opening === 0 ? 6 : 0;
    const homes = Array.from({ length: 11 }, (_, i) => nextPlayoffFixture({ ...s, games: Array(i).fill({}) }, year).homeId);
    expect(homes).toEqual([opening, opening, other, other, other, opening, opening, opening, other, other, other]);
  });
  it('allows Japan Series additional games without a ranking fallback', () => {
    const s = play(createSeries(club(0), club(6, 80, 60, 'パ'), 'japan'), Array(7).fill([0, 0]));
    expect(s.done).toBe(false);
    expect(nextPlayoffFixture(s)).toMatchObject({ number: 8, homeId: 0, maxInnings: null, homeClinchOnDraw: false });
    expect(() => recordSeriesGame(s, result(1, 1))).toThrow('引分');
    expect(play(s, Array(4).fill([1, 0]))).toMatchObject({ done: true, winner: 0, wins: [4, 0] });
  });
  it('selects DH from the host, including announced 2027 adoption', () => {
    const s = createSeries(club(0), club(6, 80, 60, 'パ'), 'japan');
    expect(nextPlayoffFixture(s, 2026).useDh).toBe(false);
    expect(nextPlayoffFixture({ ...s, games: [{}, {}] }, 2026)).toMatchObject({ isMyHome: false, homeId: 6, useDh: true });
    expect(nextPlayoffFixture(createSeries(club(0), club(1), 'first'), 2027).useDh).toBe(true);
  });
  it('uses 12 innings normally and continues beyond 12 with a serializable unlimited option', () => {
    const gs = { inning: 12, isTop: false, score: { my: 1, opp: 1 }, isMyHome: true,
      inningSummary: [], myInningRuns: 0, opInningRuns: 0, outs: 3 };
    expect(endHalfInning(gs).gameOver).toBe(true);
    const continued = endHalfInning(JSON.parse(JSON.stringify({ ...gs, maxInnings: null })));
    expect(continued.inning).toBe(13); expect(continued.gameOver).not.toBe(true);
    expect(endHalfInning({ ...gs, maxInnings: null, score: { my: 2, opp: 1 } }).gameOver).toBe(true);
  });
  it('ends clinching draws after the top 12th, or when the home club ties in the bottom 12th', () => {
    const gs = { inning: 12, isTop: true, score: { my: 1, opp: 1 }, isMyHome: true, postseason: true,
      homeClinchOnDraw: true, maxInnings: 12, inningSummary: [], myInningRuns: 0, opInningRuns: 0 };
    expect(endHalfInning(gs).gameOver).toBe(true);
    expect(postseasonAtBatEndsGame({ ...gs, isTop: false })).toBe(true);
    expect(postseasonAtBatEndsGame({ ...gs, inning: 11, isTop: false })).toBe(false);
    expect(postseasonAtBatEndsGame({ ...gs, homeClinchOnDraw: false, isTop: false })).toBe(false);
    expect(postseasonAtBatEndsGame({ ...gs, isTop: false, isMyHome: false, score: { my: 1, opp: 2 } })).toBe(true);
  });
  it('does not reset completed or partially played stages after JSON save/resume', () => {
    let p = initPlayoff(six());
    p.cs1_se = play(p.cs1_se, [[1, 0], [1, 0]]);
    p.cs1_pa = play(p.cs1_pa, [[1, 0], [1, 0]]);
    p = advancePlayoff(p);
    p.cs2_se = play(p.cs2_se, [[0, 1], [1, 0]]);
    const saved = JSON.parse(JSON.stringify(encodePlayoff(p)));
    const continued = advancePlayoff(saved);
    expect(continued.cs2_se).toEqual(saved.cs2_se);
    expect(continued.cs2_pa).toBeNull();
    expect(continued.phase).toBe('cs2_se');
  });
  it('reports an invalid roster instead of hanging', () => {
    const t = { id: 0, players: [], lineup: [], rotation: [], rotIdx: 0 };
    expect(() => quickSimGame(t, { ...t, id: 1 })).toThrow('打順');
  });
  it('propagates the clinching-draw rule through a real quick simulation without a bottom 12th', () => {
    const teams = [TEAM_DEFS[0], TEAM_DEFS[6]].map(d => prepareTeamForGame(optimizeTeamForGameStart(buildTeam(d)), false));
    teams.forEach(t => t.players.forEach(p => {
      p.condition = 100;
      if (p.isPitcher) p.pitching = { ...p.pitching, control: 99, velocity: 99, breaking: 99, stamina: 99 };
      else p.batting = { ...p.batting, eye: 1, contact: 1 };
    }));
    vi.spyOn(Math, 'random').mockReturnValue(.1);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = quickSimGame(teams[0], teams[1], { postseason: true, maxInnings: 12, homeClinchOnDraw: true });
    expect(r.score).toEqual({ my: 0, opp: 0 });
    expect(r.inningSummary.at(-1)).toMatchObject({ inning: 12, isTop: true });
    expect(r.inningSummary).toHaveLength(23);
  });
  it('ends a real tying plate appearance in the bottom 12th and a winning one in the bottom ninth', () => {
    const teams = [TEAM_DEFS[0], TEAM_DEFS[6]].map(d => prepareTeamForGame(optimizeTeamForGameStart(buildTeam(d)), false));
    const gs = { ...initGameState(teams[0], teams[1], { postseason: true, homeClinchOnDraw: true }),
      inning: 12, isTop: false, score: { my: 0, opp: 1 }, bases: teams[0].lineup.slice(0, 3), outs: 0 };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const tied = processAtBat(gs, 'walk');
    expect(tied).toMatchObject({ gameOver: true, score: { my: 1, opp: 1 } });
    expect(tied.log).toHaveLength(1);
    const won = processAtBat({ ...gs, inning: 9, homeClinchOnDraw: false, score: { my: 1, opp: 1 } }, 'walk');
    expect(won).toMatchObject({ gameOver: true, score: { my: 2, opp: 1 } });
  });
});

describe('regular-season ranking', () => {
  it('ranks by exact win rate ahead of number of wins or run differential', () => {
    const teams = [club(1, 80, 63), club(0, 79, 60), club(2, 1, 2)];
    expect(rankLeague(teams, 'セ').teams.map(t => t.id)).toEqual([0, 1, 2]);
  });
  it('uses most wins only in Central, without inventing missing head-to-head data', () => {
    const teams = [club(1, 70, 70), club(0, 71, 71)];
    const previousStandings = { central: [{ id: 1 }, { id: 0 }], pacific: [{ id: 1 }, { id: 0 }] };
    expect(rankLeague(teams, 'セ', { previousStandings }).teams[0].id).toBe(0);
    const pa = rankLeague(teams.map(t => ({ ...t, league: 'パ' })), 'パ', { previousStandings });
    expect(pa.teams[0].id).toBe(1);
    expect(pa.warnings.join()).toContain('成績が不足');
  });
  it('uses aggregate head-to-head for three tied clubs, then previous ranks when those tie', () => {
    const teams = [club(0, 1, 1), club(1, 1, 1), club(2, 1, 1)].map(t => ({ ...t, draws: 0 }));
    const gameResultsMap = Object.fromEntries(teams.map(t => [t.id, {
      1: { oppId: (t.id + 1) % 3, myScore: 1, oppScore: 0 },
      2: { oppId: (t.id + 2) % 3, myScore: 0, oppScore: 1 },
    }]));
    const r = rankLeague(teams, 'セ', { gameResultsMap, previousStandings: { central: [{ id: 2 }, { id: 0 }, { id: 1 }] } });
    expect(r.teams.map(t => t.id)).toEqual([2, 0, 1]); expect(r.warnings).toEqual([]);
  });
  it('uses recorded head-to-head ahead of the previous ranking', () => {
    const teams = [club(0, 3, 3, 'パ'), club(1, 3, 3, 'パ'), club(6, 0, 0, 'セ')].map(t => ({ ...t, draws: 0 }));
    const rows = (oppId, win) => ({ oppId, myScore: win ? 1 : 0, oppScore: win ? 0 : 1 });
    const gameResultsMap = {
      0: [rows(1, true), rows(6, true), rows(6, true), rows(6, false), rows(6, false), rows(6, false)],
      1: [rows(0, false), rows(6, false), rows(6, false), rows(6, true), rows(6, true), rows(6, true)],
    };
    expect(rankLeague(teams, 'パ', { gameResultsMap, previousStandings: { pacific: [{ id: 1 }, { id: 0 }] } }).teams[0].id).toBe(0);
  });
});

it('updates only playoff stats and gives neither pitcher a win on a draw', () => {
  const teams = [TEAM_DEFS[0], TEAM_DEFS[6]].map(d => optimizeTeamForGameStart(buildTeam(d)));
  const initial = teams.map(t => ({ ...t, wins: 80, losses: 60, draws: 3 }));
  const s = createSeries(initial[0], initial[1], 'japan');
  const pitchers = initial.map(t => t.players.find(p => p.id === t.rotation[t.rotIdx % t.rotation.length]));
  const log = pitchers.flatMap((p, i) => Array.from({ length: 18 }, () => ({ pitcherId: p.id,
    batId: initial[1 - i].lineup[0], scorer: i === 1, isTop: i === 0, result: 'k', rbi: 0, pitches: 4 })));
  const simulate = vi.fn(() => ({ ...result(0, 0), log }));
  const p = { ...initPlayoff(six()), cs1_se: { done: true }, cs1_pa: { done: true },
    cs2_se: { done: true }, cs2_pa: { done: true }, jpSeries: s, phase: 'jpSeries' };
  const next = simulateNextPlayoffGame(p, initial, 2026, simulate);
  expect(next.playoff.jpSeries.wins).toEqual([0, 0]);
  next.teams.forEach((t, i) => {
    expect(t.wins).toBe(80); expect(t.losses).toBe(60); expect(t.draws).toBe(3);
    expect(t.players.find(p => p.id === pitchers[i].id).playoffStats).toMatchObject({ W: 0, L: 0, Kp: 18 });
    expect(t.players.find(p => p.id === pitchers[i].id).stats).toEqual(initial[i].players.find(p => p.id === pitchers[i].id).stats);
  });
});

it('repairs injured CPU assignments at postseason entry without adding regular-season games', () => {
  const teams = [TEAM_DEFS[0],TEAM_DEFS[6]].map(d => optimizeTeamForGameStart(buildTeam(d)));
  const injuredId=teams[1].lineupNoDh[0];
  teams[1].players=teams[1].players.map(p=>p.id===injuredId?{...p,injury:'test',injuryDaysLeft:3}:p);
  teams.forEach(t=>Object.assign(t,{wins:80,losses:60,draws:3}));
  const series=createSeries(teams[0],teams[1],'japan');
  const p={...initPlayoff(six()),cs1_se:{done:true},cs1_pa:{done:true},cs2_se:{done:true},cs2_pa:{done:true},jpSeries:series,phase:'jpSeries'};
  const before=structuredClone(teams);
  const next=simulateNextPlayoffGame(p,teams,2026,()=>({...result(1,0),log:[]}),{myId:teams[0].id});
  expect(next.playoff.jpSeries.games).toHaveLength(1);
  expect(next.teams[1].lineupNoDh).not.toContain(injuredId);
  for(const t of next.teams) expect(t).toMatchObject({wins:80,losses:60,draws:3});
  expect(teams).toEqual(before);
});
