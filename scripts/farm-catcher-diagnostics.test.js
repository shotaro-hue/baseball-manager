import { afterEach, expect, it, vi } from 'vitest';
import { catcherSnapshot, createCatcherProbe, installCatcherProbe } from './farm-catcher-diagnostics';
import { createInitialTeams } from '../src/engine/bootstrapTeams';
import { generateSeasonSchedule } from '../src/engine/scheduleGen';
import { createFarmCompetition } from '../src/engine/farmRecords';
import { simulateSeasonBatch } from '../src/workers/seasonBatchCore';
import { applyEmergencyRosterMaintenance, proficiencyAt } from '../src/engine/rosterAutomation';
import { executeCpuTrade } from '../src/engine/cpuTradeExecution';

const catcher = (id, extra = {}) => ({ id, name: id, pos: '捕手', isPitcher: false, ...extra });
const team = (farm = []) => ({ id: 0, players: [catcher('a'), catcher('b')], farm });
afterEach(() => vi.restoreAllMocks());

it('counts healthy secondary, developmental and cooldown catchers as farm coverage', () => {
  const t = team([
    catcher('secondary', { pos: '外野', positions: { 捕手: 30 }, 育成: true, registrationCooldownDays: 10 }),
    catcher('injured', { injuryDaysLeft: 4 }),
    catcher('pitcher', { isPitcher: true }),
  ]);
  const before = structuredClone(t), s = catcherSnapshot(t);
  expect(s).toMatchObject({ owned: 4, healthy: 3, activePrimary: 2, farmHealthy: 1, injured: 1 });
  expect(s.catchers.map(p => p.id)).toEqual(['a', 'b', 'secondary', 'injured']);
  expect(t).toEqual(before);
});

it('distinguishes owned shortage from injuries and does not turn club-days into cards', () => {
  const probe = createCatcherProbe(1);
  const a = team(), b = { ...team([catcher('injured', { injuryDaysLeft: 9 })]), id: 1 };
  const competition = { cards: [{ round: 1, homeId: 0, awayId: 1, status: 'unplayed', reasons: [
    { teamId: 0, code: 'insufficient-catcher' }, { teamId: 1, code: 'insufficient-catcher' },
  ] }] };
  probe.pregame({ year: 2026 }, [a, b], 1, competition);
  const report = probe.report();
  expect(report.shortages.map(r => r.constraint)).toEqual(['owned-under-three', 'injury-under-three']);
  expect(report.seasons[0]).toMatchObject({ year: 2026, unplayedCards: 1, shortageClubDays: 2 });
});

it('records surplus healthy catchers separately rather than blaming injuries', () => {
  const probe = createCatcherProbe(2);
  const t = createInitialTeams()[0];
  const catchers = t.farm.filter(p => !p.isPitcher && p.pos === '捕手');
  t.players.push(...catchers);
  t.farm = t.farm.filter(p => !catchers.includes(p));
  const before = structuredClone(t);
  vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('diagnosis consumed game RNG'); });
  probe.pregame({ year: 2026 }, [t], 1, { cards: [{ round: 1, homeId: t.id, awayId: 1,
    status: 'unplayed', reasons: [{ teamId: t.id, code: 'insufficient-catcher' }] }] });
  expect(probe.report().shortages[0]).toMatchObject({ constraint: 'healthy-three-plus', forcedRepair: true });
  expect(t).toEqual(before);
});

it('observes the real batch without changing state or consuming game RNG', () => {
  let n = 20261015;
  const original = Math.random;
  Math.random = () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
  try {
    const teams = createInitialTeams(), year = 2026, saveId = 'catcher-parity';
    // Fix the shortage itself rather than depending on a random injury to
    // exhaust the newly deeper initial catcher group within these 80 days.
    const keep = new Set(teams[1].players.filter(p => p.pos === '捕手').slice(0, 2).map(p => p.id));
    for (const p of [...teams[1].players, ...teams[1].farm]) {
      if (!p.isPitcher && proficiencyAt(p, '捕手') > 0 && !keep.has(p.id)) {
        p.injuryDaysLeft = 999;
        p.injury = '診断用固定負傷';
      }
    }
    const snapshot = { teams, year, saveId, myId: 0, gameDay: 1, faPool: [], faYears: {},
      schedule: generateSeasonSchedule(year, teams), allStarDone: true,
      farmCompetition: createFarmCompetition({ teams, year, saveId }), farmCompetitionVersion: 1 };
    const before = structuredClone(snapshot), start = n;
    // Replay both simulations with the same externally supplied archive identity.
    // Per-run UUIDs are operational metadata, independent of game RNG/state.
    const archiveRunId = 'catcher-parity-run';
    const plain = simulateSeasonBatch({ snapshot, count: 80, autoManageMyTeam: true, archiveRunId }), plainRng = n;
    n = start;
    const probe = createCatcherProbe(20261015);
    installCatcherProbe(vi, probe);
    probe.phase('season-start', snapshot);
    const observed = simulateSeasonBatch({ snapshot, count: 80, autoManageMyTeam: true, archiveRunId });
    // Timestamps are presentation metadata, not game state.
    const canonical = value => JSON.parse(JSON.stringify(value, (key, v) => key === 'timestamp' ? 0 : v));
    expect(canonical(observed)).toEqual(canonical(plain));
    expect(n).toBe(plainRng);
    expect(snapshot).toEqual(before);
    expect(probe.report().seasons[0].rounds).toBe(80);
    expect(probe.report().shortages.length).toBeGreaterThan(0);
  } finally { Math.random = original; }
}, 60000);

it('attributes a real postgame injury replacement to emergency maintenance', () => {
  const teams = createInitialTeams(), t = teams[0], probe = createCatcherProbe(3);
  probe.phase('season-start', { year: 2026, teams });
  probe.pregame({ year: 2026 }, teams, 1, { cards: [] });
  installCatcherProbe(vi, probe);
  const injured = t.players.find(p => p.pos === '捕手');
  injured.injuryDaysLeft = 30;
  const result = applyEmergencyRosterMaintenance(t, { automationMode: 'full' });
  expect(result.farm.some(p => p.id === injured.id)).toBe(true);
  expect(probe.report().events).toEqual(expect.arrayContaining([expect.objectContaining({
    year: 2026, round: 1, stage: 'postgame-emergency', teamId: t.id,
    changes: expect.arrayContaining([expect.objectContaining({ id: injured.id,
      from: expect.objectContaining({ location: 'players' }), to: expect.objectContaining({ location: 'farm' }) })]),
  })]));
});

it('records committed trade ownership and excludes trial or rejected roster plans', () => {
  const teams = createInitialTeams(), buyer = teams[0], seller = teams[1], probe = createCatcherProbe(4);
  probe.phase('season-start', { year: 2026, teams });
  installCatcherProbe(vi, probe);
  const buyerGets = seller.farm.find(p => p.pos === '捕手'), sellerGets = buyer.farm.find(p => p.isPitcher);
  const offer = { buyerId: buyer.id, sellerId: seller.id, buyerGets, sellerGets };
  expect(executeCpuTrade(teams, offer, 80)).toBe(true);
  const events = probe.report().events;
  expect(events.length).toBeGreaterThan(0);
  expect(events.every(e => e.stage === 'completed-trade')).toBe(true);
  expect(events.find(e => e.teamId === seller.id).changes).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: buyerGets.id, to: null }),
  ]));
  const count = events.length;
  expect(executeCpuTrade(teams, offer, 80)).toBe(false);
  expect(probe.report().events).toHaveLength(count);
});
