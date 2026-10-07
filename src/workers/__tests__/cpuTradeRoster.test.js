import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEAM_DEFS } from '../../constants';
import { buildTeam } from '../../engine/playerCore';
import * as player from '../../engine/player';
import * as simulation from '../../engine/simulation';
import * as trade from '../../engine/trade';
import * as utils from '../../utils';
import { executeCpuTrade } from '../../engine/cpuTradeExecution';
import { optimizeTeamForGameStart, validateTeamRoster } from '../../engine/rosterAutomation';
import { simulateSeasonBatch } from '../seasonBatchCore';

afterEach(() => vi.restoreAllMocks());
function fixture() {
  let seed = 321;
  vi.spyOn(Math, 'random').mockImplementation(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  const teams = TEAM_DEFS.slice(0, 4).map(d => optimizeTeamForGameStart(buildTeam(d)));
  const buyer = teams[1], seller = teams[2];
  const sellerGets = buyer.players.find(p => p.id === buyer.lineupNoDh[0]);
  const buyerGets = seller.players.find(p => !p.isPitcher && p.pos === sellerGets.pos);
  return { teams, buyer, seller, result: { buyerId: buyer.id, sellerId: seller.id,
    buyerName: buyer.name, sellerName: seller.name, buyerGets, sellerGets } };
}
function assertValidOwnership(teams) {
  const owned = teams.flatMap(t => [...t.players, ...t.farm].map(p => p.id));
  expect(new Set(owned).size).toBe(owned.length);
  teams.forEach(t => expect(validateTeamRoster(t).valid).toBe(true));
}

describe('CPU trade roster consistency', () => {
  it('repairs both DH lineups and rotations after exchanging a starter', () => {
    const { teams, buyer, seller, result } = fixture();
    const before = teams.flatMap(t => [...t.players, ...t.farm].map(p => p.id)).sort();
    expect(executeCpuTrade(teams, result, 80)).toBe(true);
    expect([...buyer.players, ...buyer.farm].some(p => p.id === result.sellerGets.id)).toBe(false);
    expect([...seller.players, ...seller.farm].some(p => p.id === result.buyerGets.id)).toBe(false);
    expect(buyer.lineupNoDh).not.toContain(result.sellerGets.id);
    expect(buyer.lineupDh).not.toContain(result.sellerGets.id);
    assertValidOwnership(teams);
    expect(teams.flatMap(t => [...t.players, ...t.farm].map(p => p.id)).sort()).toEqual(before);
  });
  it('removes a farm player from the old club without duplicate ownership or active overflow', () => {
    const { teams, seller, result } = fixture();
    result.buyerGets = seller.farm.find(p => !p.isPitcher);
    expect(executeCpuTrade(teams, result, 80)).toBe(true);
    expect(seller.farm.some(p => p.id === result.buyerGets.id)).toBe(false);
    assertValidOwnership(teams);
  });
  it('removes traded starting pitchers from the old rotation', () => {
    const { teams, buyer, seller, result } = fixture();
    result.sellerGets = buyer.players.find(p => p.id === buyer.rotation[0]);
    result.buyerGets = seller.players.find(p => p.id === seller.rotation[0]);
    expect(executeCpuTrade(teams, result, 80)).toBe(true);
    expect(buyer.rotation).not.toContain(result.sellerGets.id);
    expect(seller.rotation).not.toContain(result.buyerGets.id);
    assertValidOwnership(teams);
  });
  it('rejects a stale or repeated trade without changing either club', () => {
    const { teams, result } = fixture();
    expect(executeCpuTrade(teams, result, 80)).toBe(true);
    const before = JSON.stringify(teams);
    expect(executeCpuTrade(teams, result, 80)).toBe(false);
    expect(JSON.stringify(teams)).toBe(before);
  });
  it('finishes the user matchup before trading its opponent and can continue the next day', () => {
    const { teams, buyer, result } = fixture();
    const played = [];
    vi.spyOn(simulation, 'quickSimGame').mockImplementation((home, away) => {
      played.push([home.players.map(p => p.id), away.players.map(p => p.id)]);
      return { score: { my: 1, opp: 0 }, won: true, log: [], inningSummary: [] };
    });
    vi.spyOn(player, 'checkForInjuries').mockReturnValue([]);
    vi.spyOn(utils, 'rngf').mockReturnValue(0);
    vi.spyOn(trade, 'generateCpuOffer').mockReturnValue(null);
    vi.spyOn(trade, 'generateCpuCpuTrade').mockReturnValueOnce(result).mockReturnValue(null);
    const day = { date: { month: 7, day: 1 }, matchups: [{ homeId: 0, awayId: 1 }, { homeId: 2, awayId: 3 }] };
    const output = simulateSeasonBatch({ count: 2, autoManageMyTeam: true, snapshot: {
      teams, schedule: [null, day, { ...day, date: { month: 7, day: 2 } }], faPool: [],
      myId: 0, gameDay: 1, year: 2027, allStarDone: true,
      seasonHistory: { transfers: [] }, news: [], mailbox: [] } });
    expect(played).toHaveLength(4);
    expect(played[1][1]).toContain(result.sellerGets.id);
    expect(played[3][1]).not.toContain(result.sellerGets.id);
    expect(output.nextState.teams.find(t => t.id === buyer.id).lineupNoDh).not.toContain(result.sellerGets.id);
    expect(output.nextState.gameDay).toBe(3);
    assertValidOwnership(output.nextState.teams);
  });
});
