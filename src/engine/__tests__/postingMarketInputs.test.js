import { expect, it } from 'vitest';
import { postingMarketInputs } from '../postingMarketInputs';
import { qualifiedPostingWorld, marketResult } from './fixtures/postingMarketResults';
import { postingWinter } from './fixtures/postingDepartures';
import { toAnnualState, reduceEconomyCommand, fromAnnualState } from '../contractEconomy';
import { freezeEconomy } from './fixtures/economyWorld';
import { postingUiWorld } from './fixtures/postingUi';
import { envelope } from './fixtures/faDeclarations';
import { createPostingQualificationProducer } from '../../data/postingQualificationFacts';
import { prepareEconomyMigration } from '../economyMigration';
import { playableClub } from './fixtures/inSeasonDepartures';

const state = () => toAnnualState(qualifiedPostingWorld());
it('uses the qualified birthday age and source ledger, keeping future retained commitments explicit', () => {
  const s = state(), before = structuredClone(s); s.teams[0].players[0].age = 99; s.teams[0].players[0].salary = 1;
  const f = postingMarketInputs(freezeEconomy(s), 'request');
  expect(f).toMatchObject({ version: 1, playerId: 0, sourcePlayerId: null, season: 2026, date: '2026-12-01',
    ageYears: 26, role: 'batter', npb: { annualSalaryManYen: 1000, endSeason: 2028, guaranteeStatus: 'guaranteed',
      retainedCostsBySeason: [{ season: 2027, amountManYen: 1000 }, { season: 2028, amountManYen: 1000 }] } });
  expect(s.spending).toEqual(before.spending);
  expect(postingMarketInputs(JSON.parse(JSON.stringify(s)), 'request')).toEqual(f);
});
it('does not substitute zero or a new trait for an unrecorded overseas preference', () => {
  const s = state(), p = s.teams[0].players[0]; p.personality = { money: 0 };
  expect(postingMarketInputs(s, 'request').personality).toMatchObject({ overseas: { recorded: false, value: null }, money: { recorded: true, value: 0 } });
  p.personality.overseas = 0;
  expect(postingMarketInputs(s, 'request').personality.overseas).toEqual({ recorded: true, value: 0 });
  p.batting.power = 0; expect(postingMarketInputs(s, 'request').abilities.power).toBe(0);
  delete p.pos; expect(postingMarketInputs(s, 'request').position).toBeNull();
});
it('distinguishes a measured season with no appearances from missing performance', () => {
  const s = state(), p = s.teams[0].players[0];
  p.stats = {}; expect(postingMarketInputs(s, 'request').performance[0].assessment).toBeNull();
  p.stats = { PA: 0 }; expect(postingMarketInputs(s, 'request').performance[0].assessment).toMatchObject({ workload: 0, value: 0 });
});
it('retains the two prior seasons as evidence without reading future or duplicate current-season career rows', () => {
  const s = state(), p = s.teams[0].players[0]; p.stats = { PA: 0 };
  p.recentCareerLog = [2023, 2024, 2025, 2026, 2027].map(year => ({ year, stats: { PA: 0 } }));
  const f = postingMarketInputs(s, 'request');
  expect(f.performance.map(r => r.season)).toEqual([2026, 2025, 2024]);
  expect(f.performance[0].source).toBe('current-season');
});
it.each(['power', 'contact', 'eye'])('rejects missing required batting ability %s instead of inventing a rating', key => {
  const s = state(); delete s.teams[0].players[0].batting[key];
  expect(() => postingMarketInputs(s, 'request')).toThrow();
});
it('rejects a resolved request or a qualification belonging to another application', () => {
  const w = qualifiedPostingWorld(), r = reduceEconomyCommand(w, marketResult(w, 'no-offer'));
  expect(() => postingMarketInputs(toAnnualState(r.world), 'request')).toThrow();
  const s = state(); s.postingQualifications[0].requestId = 'other';
  expect(() => postingMarketInputs(s, 'request')).toThrow();
});
it('extracts real master identity and measured career inputs without changing the roster', () => {
  let w = postingUiWorld({ realRoster: true }); const before = structuredClone(w.teams), p = w.teams[0].players.find(p => p.id === w.contractEconomy.engine.postingApplications[0].playerId);
  for (const c of [
    { id: 'decision', type: 'decide-posting', requestId: 'request', decision: 'approve' },
    { id: 'qualification', type: 'record-posting-qualification', requestId: 'request', facts: createPostingQualificationProducer()(p, 2026) },
  ]) { const r = reduceEconomyCommand(w, envelope(w, c)); expect(r.ok, r.error).toBe(true); w = r.world; }
  const f = postingMarketInputs(toAnnualState(w), 'request');
  expect(f.sourcePlayerId).toBe(p.realPlayerId); expect(f.sourcePlayerId).toMatch(/^npb:/);
  expect(f.personality.overseas.recorded).toBe(false); expect(f.performance.some(r => r.source === 'saved-career')).toBe(true);
  expect(w.teams).toEqual(before);
});
it('keeps a migrated guarantee unknown while retaining its observed future obligations', () => {
  const teams = [playableClub(), playableClub(1), ...Array.from({ length: 10 }, (_, i) => ({ id: i + 2, players: [], farm: [] }))];
  let w = postingWinter({ teams }); const observed = structuredClone(w.teams);
  for (const t of observed) for (const p of [...t.players, ...t.farm]) { p.contractSignedYear = 2024; p.contractYearsLeft = p.id === 0 ? 4 : 2; p.contractYears = p.contractYearsLeft; }
  const m = prepareEconomyMigration({ ...w, phase: 'season', teams: observed, year: 2025, contractEconomy: undefined },
    { season: 2025, stage: 'unstarted-offseason', legacyOffseasonStarted: false });
  expect(m.ok).toBe(true); w.contractEconomy.engine.spending.ledger = m.candidate.ledger;
  delete w.contractEconomy.engine.faExerciseOrigins; delete w.contractEconomy.faExerciseBirth;
  w = qualifiedPostingWorld(fromAnnualState(w, toAnnualState(w)));
  const f = postingMarketInputs(toAnnualState(w), 'request');
  expect(f.npb.guaranteeStatus).toBe('unknown'); expect(f.npb.retainedCostsBySeason).toEqual([{ season: 2027, amountManYen: 1000 }, { season: 2028, amountManYen: 1000 }]);
});
