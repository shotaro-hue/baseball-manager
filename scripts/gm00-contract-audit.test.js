import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TEAM_DEFS, COACH_DEFS, COACH_GRADES, MIN_SALARY_SHIHAKA, FOREIGN_DEADLINE_DAY } from '../src/constants';
import { createInitialTeams } from '../src/engine/bootstrapTeams';
import { generateSeasonSchedule } from '../src/engine/scheduleGen';
import { applyClubGameFinance, forecastClubFinance, nextClubBudget } from '../src/engine/clubFinance';
import { contractPayroll } from '../src/engine/contractPayroll';
import { remainingContractAfterSeason, renewalEligible, ownedPlayers } from '../src/engine/renewalRules';
import { resolveContractReplies } from '../src/engine/contractReplies';
import { evalOffer, cpuRenewContracts, processCpuFaBids } from '../src/engine/contract';
import { applyDraftAcquisitions } from '../src/engine/draftRules';
import { applyTradeTransaction } from '../src/engine/tradeTransaction';
import { developPlayers } from '../src/engine/player';
import { addMarketSigning, validateMarketContract } from '../src/components/hub/faMarket';
import { createSeasonContract, contractSeasonsRemaining } from '../src/engine/seasonContract';
import { salaryForPeriodManYen, quoteContractPayroll } from '../src/engine/monthlyPayroll';
import { useGameState } from '../src/hooks/useGameState';
import { useOffseason } from '../src/hooks/useOffseason';

// Observe existing behavior, without turning a known mismatch into a permanent
// expectation. Output is opt-in; ordinary CI never rewrites evidence files.
let view, gs, os;
afterEach(() => {
  if (view) act(() => view.unmount());
  view = null; vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function seedRandom(seed) {
  let state = seed;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
const bareTeam = (id, extra = {}) => ({ ...TEAM_DEFS[id], budget: 100000, players: [], farm: [],
  history: [], coaches: [], scoutResults: [], wins: 70, losses: 70, lineup: [], rotation: [], ...extra });
const fixed = extra => createSeasonContract({ contractId: 'gm00', playerId: 0, signedSeason: 2026,
  agreementPhase: 'season', purpose: 'acquisition', termYears: 3, annualSalaryManYen: 10000, guaranteed: true, ...extra });
const tenure = (teamId, startDate, endDate) => ({ teamId, startDate, endDate });

it('GM-00: observes real transaction paths and quotes the staged monthly/season contract', async () => {
  const seed = 20261026, random = vi.spyOn(Math, 'random').mockImplementation(seedRandom(seed));
  const storage = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) });
  const teams = createInitialTeams(), schedule = generateSeasonSchedule(2026, teams);
  const source = teams[0].players.find(p => !p.isPitcher && p.age < 30);
  expect(source).toBeDefined();
  const p = { ...source, id: 0, salary: 10000, contractYearsLeft: 1, contractSignedYear: 2025 };
  const buyer = bareTeam(0), seller = bareTeam(1, { players: [p] });
  const baseInput = JSON.stringify([buyer, seller, p]);

  const signed = addMarketSigning(buyer, p, 10000, 3, 2026);
  const signedPlayer = ownedPlayers(signed).find(player => player.id === 0);
  const simpleQuote = quoteContractPayroll(fixed(), '2026-07-01', [tenure(0, '2026-07-01', '2028-12-01')]);
  expect(simpleQuote.seasons.map(s => s.amountManYen)).toEqual([5000, 10000, 10000]);
  const observations = {
    manualFa: { oldBudgetDeltaManYen: buyer.budget - signed.budget, salary: signedPlayer.salary,
      oldYearsAfter2026: remainingContractAfterSeason(signedPlayer, 2026),
      oldRenewalEligible2026: renewalEligible(signedPlayer, 2026), newQuote: simpleQuote },
  };
  const pool = [{ ...p, id: 'cpu-candidate', isFA: true, isWaiverReleased: true }];
  const cpu = processCpuFaBids([buyer, bareTeam(1)], 0, pool, [buyer, bareTeam(1)], 2026);
  const cpuSigned = ownedPlayers(cpu.updatedTeams[1]).find(x => x.id === pool[0].id);
  observations.cpuFa = { signed: Boolean(cpuSigned), budgetDeltaManYen: 100000 - cpu.updatedTeams[1].budget,
    salaryManYen: cpuSigned?.salary ?? null, years: cpuSigned?.contractYearsLeft ?? null };

  const incentives = { performanceBonusRate: 20, titleBonus: 1000, optOut: true };
  const mail = { id: 'accepted', type: 'contract_decision', deliverOnDay: 1,
    decision: { playerId: 0, salary: 12000, years: 3, accepted: true, incentives, offeredYear: 2026 } };
  const renewed = resolveContractReplies(seller, [mail], 1, 2026);
  expect(renewed.replies[0].resolution).toBe('signed');
  const offerTeam = { ...seller, city: p.hometown }, offer = { salary: 12000, years: 3 };
  observations.manualRenewal = { budgetDeltaManYen: seller.budget - renewed.team.budget,
    oldAppliedSalaryManYen: renewed.team.players[0].salary,
    clauseScore: evalOffer(p, { ...offer, incentives }, offerTeam, [offerTeam]).total,
    fixedScore: evalOffer(p, offer, offerTeam, [offerTeam]).total,
    savedClauses: renewed.team.players[0].contractIncentives };
  const cpuRenewal = cpuRenewContracts(teams, 0, teams, { year: 2026 });
  observations.cpuRenewal = cpuRenewal.updatedTeams.filter(t => t.id !== 0).map(t => ({ teamId: t.id,
    budgetDeltaManYen: teams.find(old => old.id === t.id).budget - t.budget }));

  const rookie = { ...p, id: 'rookie', salary: 500 };
  const draft = applyDraftAcquisitions([buyer], [rookie], { rookie: 0 }, 2026);
  expect(draft.ok).toBe(true);
  expect(applyDraftAcquisitions(draft.teams, [rookie], { rookie: 0 }, 2026).teams).toEqual(draft.teams);
  observations.rookie = { budgetDeltaManYen: buyer.budget - draft.teams[0].budget,
    salaryManYen: draft.teams[0].farm[0].salary, replayDuplicates: 0 };

  const trade = applyTradeTransaction([buyer, seller], { fromId: 0, toId: 1, outgoing: [], incoming: [p], cash: 500 });
  expect(trade.ok).toBe(true);
  expect(ownedPlayers(trade.teams[0]).some(player => player.id === 0)).toBe(true);
  observations.trade = { budgetDeltasManYen: trade.teams.map((t, i) => t.budget - [buyer, seller][i].budget),
    newAllocation: quoteContractPayroll(fixed(), '2026-02-01', [
      tenure(1, '2026-02-01', '2026-07-16'), tenure(0, '2026-07-16', '2028-12-01')]) };
  const lateRound = schedule.findIndex(round => round?.date?.month === 8);
  expect(lateRound).toBeGreaterThan(0);
  const validate = (player, gameDay) => validateMarketContract({ team: buyer, pool: [player], player,
    salary: 10000, years: 1, gameDay });
  observations.registration = { augustRound: lateRound, augustDate: schedule[lateRound].date,
    domesticError: validate(p, lateRound), foreignError: validate({ ...p, isForeign: true }, lateRound),
    legacyForeignRoundLimit: FOREIGN_DEADLINE_DAY,
    requiresCalendarValidator: 'GM-01: effective date <= July 31; CS/August 31 qualification is a separate check' };
  expect(JSON.stringify([buyer, seller, p])).toBe(baseInput);

  function Harness() { gs = useGameState(); os = useOffseason(gs); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => { gs.setMyId(0); gs.setYear(2026); gs.setGameDay(1); gs.setTeams([buyer]); });
  observations.coach = [];
  for (const grade of COACH_GRADES) {
    act(() => gs.setTeams([bareTeam(0, { budget: 1000000 })]));
    act(() => gs.hireCoach(COACH_DEFS[0], grade));
    expect(gs.myTeam.coaches).toHaveLength(1);
    observations.coach.push({ grade: grade.g, chargedManYen: 1000000 - gs.myTeam.budget,
      hired: gs.myTeam.coaches.length, storedSalaryManYen: gs.myTeam.coaches[0]?.salary ?? null });
  }
  act(() => gs.setTeams([bareTeam(0, { budget: 1000000 })]));
  act(() => gs.hireCoach(COACH_DEFS[0], COACH_GRADES[0]));
  act(() => gs.hireCoach(COACH_DEFS[0], COACH_GRADES[1]));
  const stacked = structuredClone(gs.myTeam.coaches);
  observations.coachSameRoleCount = stacked.length;
  const growth = coaches => {
    random.mockImplementation(seedRandom(seed));
    return developPlayers([{ ...source, age: 20 }], coaches).players[0].batting;
  };
  observations.coachGrowth = { none: growth([]), single: growth(stacked.slice(0, 1)), stacked: growth(stacked) };

  const { contractSignedYear: oldSignedYear, ...scoutSource } = p;
  const scout = { ...scoutSource, id: 'scout' };
  act(() => gs.setTeams([bareTeam(0, { scoutResults: [scout] })]));
  act(() => expect(gs.signPlayer(0)).toBe(true));
  observations.scoutContract = { budgetDeltaManYen: buyer.budget - gs.myTeam.budget,
    salaryManYen: gs.myTeam.farm[0]?.salary ?? null,
    years: gs.myTeam.farm[0]?.contractYearsLeft ?? null,
    signedSeason: gs.myTeam.farm[0]?.contractSignedYear ?? null };
  const development = { ...p, id: 'development', 育成: true, isIkusei: true, salary: 240 };
  act(() => gs.setTeams([bareTeam(0, { farm: [development] })]));
  act(() => gs.convertIkusei(development.id));
  expect(gs.myTeam.farm[0].育成).toBe(false);
  observations.promotion = { budgetDeltaManYen: buyer.budget - gs.myTeam.budget,
    salaryManYen: gs.myTeam.farm[0]?.salary ?? null,
    newSplitCostManYen: salaryForPeriodManYen(240, 2026, '2026-02-01', '2026-07-16')
      + salaryForPeriodManYen(420, 2026, '2026-07-16', '2026-12-01') };
  act(() => gs.setTeams([bareTeam(0, { players: [p] })]));
  act(() => os.handleStartRetireGame(p));
  observations.retirementGame = { budgetDeltaManYen: gs.myTeam.budget - buyer.budget };

  // Post the 143 real finance receipts at fixed team conditions to avoid the
  // budget floor masking a missing annual charge. No baseball games are run.
  const annualTeams = teams.map(team => {
    let next = team;
    for (let gameDay = 1; gameDay <= 143; gameDay++) next = applyClubGameFinance(next,
      { year: 2026, gameDay, isHomeTeam: schedule[gameDay].matchups.some(m => m.homeId === team.id) });
    return next;
  });
  const clauseTeam = { ...annualTeams[0], coaches: stacked,
    players: teams[0].players.map(x => x.id === source.id ? { ...x, contractYearsLeft: 3,
      contractSignedYear: 2026, contractIncentives: incentives } : x) };
  act(() => { gs.setTeams([clauseTeam, ...annualTeams.slice(1)]); gs.setSchedule(schedule);
    gs.setGameDay(144); gs.setScreen('spring_training'); });
  await act(async () => expect(await os.handleNextYear()).toBe(true));
  const afterYear = gs.teams.find(t => t.id === 0), carried = ownedPlayers(afterYear).find(x => x.id === source.id);
  observations.annualTransition = { year: gs.year, coachCount: afterYear.coaches.length,
    budgetManYen: afterYear.budget, legacyBudgetFormulaManYen: nextClubBudget(clauseTeam, afterYear, 0),
    prePayrollSurplusManYen: clauseTeam.clubFinance.operatingSurplus,
    budgetFloorActive: afterYear.budget === TEAM_DEFS[0].budget * .5,
    carriedContract: { years: carried?.contractYearsLeft ?? null, incentives: carried?.contractIncentives ?? null },
    scope: '143 fixed-condition finance receipts and one real hook year transition; no baseball/playoff/prize/bonus-trigger simulation' };

  const dates = ['2026-02-01', '2026-04-01', '2026-06-01', '2026-07-01', '2026-07-16', '2026-07-31', '2026-11-30'];
  const costs = dates.map(date => ({ effectiveDate: date, annualSalaryManYen: 10000,
    currentSeasonManYen: salaryForPeriodManYen(10000, 2026, date, '2026-12-01') }));
  const seasons = [['season', 1], ['season', 3], ['offseason', 1], ['offseason', 7]].map(([agreementPhase, termYears]) => {
    const c = fixed({ agreementPhase, termYears });
    return { agreementPhase, termYears, startSeason: c.startSeason, endSeason: c.endSeason,
      currentYears: contractSeasonsRemaining(c, 2026), nextYears: contractSeasonsRemaining(c, 2027) };
  });
  const candidates = teams.map(t => {
    const total = contractPayroll(t).total, forecast = forecastClubFinance(t, schedule);
    expect(total.missing + total.invalid).toBe(0);
    expect(forecast.completeSchedule).toBe(true);
    const staffing = 5 * 3000, rookieAllowance = 8 * MIN_SALARY_SHIHAKA;
    return { teamId: t.id, name: t.name, payrollManYen: total.amount,
      rosterCount: total.count, prePayrollSurplusManYen: forecast.operatingSurplus,
      fixedOperatingCostManYen: forecast.costs.fixed.min,
      staticMinimumManYen: total.amount + staffing + rookieAllowance,
      assumptions: { optionalStaffManYen: staffing, rookieAllowanceManYen: rookieAllowance },
      rates: [.5, .65, .8].map(rate => {
        const fromRevenue = Math.round(forecast.operatingSurplus.min * rate);
        return { rate, revenueAllocationManYen: fromRevenue,
          minimumSupportManYen: Math.max(0, total.amount + staffing + rookieAllowance - fromRevenue) };
      }) };
  });
  expect(candidates).toHaveLength(12);
  const paths = ['src/engine/seasonContract.js', 'src/engine/monthlyPayroll.js', 'src/engine/renewalRules.js',
    'src/components/hub/faMarket.js', 'src/engine/contract.js', 'src/engine/contractReplies.js',
    'src/engine/draftRules.js', 'src/engine/tradeTransaction.js', 'src/hooks/useGameState.js',
    'src/hooks/useOffseason.js', 'src/engine/clubFinance.js', 'src/engine/player.js',
    'src/engine/bootstrapTeams.js', 'src/engine/realplayer.js', 'src/data/npb2025.js',
    'src/constants.js', 'src/data/clubFinanceProfiles.js', 'package-lock.json', 'scripts/gm00-contract-audit.test.js'];
  const sourceHashes = Object.fromEntries(paths.map(path => [path,
    createHash('sha256').update(readFileSync(resolve(path))).digest('hex')]));
  const report = { baseMain: 'b8c5e053076fc46a34acecccf913008dd111fdec', seed, moneyUnit: '万円',
    stage: 'GM-00 + unused GM-01A foundation; not activated', sourceHashes, observations, costs, seasons, candidates,
    limitations: ['No production hooks use the new contract/payroll helpers yet.',
      'Existing-path observations are descriptive, not assertions that preserve known bugs.',
      'No new spending-envelope coefficient selected. Static support requirements are not a calibrated budget.',
      'Coach annual rates 800/1200/1800/3000 are still design candidates; growth and affordability not calibrated.',
      'No eligibility snapshots, guarantee-release ledger, reserve replacement, save migration or atomic payroll transfer yet.',
      '143 fixed-condition finance receipts and one annual hook boundary cannot prove incentives never trigger in every path.',
      'Smoothing 1/3 years and 10/15% caps require the connected GM-01 behavior and are not selected here.',
      'No browser UI, iPhone, new-system save/reload or long-term balance acceptance in this run.'] };
  if (process.env.GM00_OUTPUT) {
    const output = resolve(process.env.GM00_OUTPUT); mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  }
}, 30000);
