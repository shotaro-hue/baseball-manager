import { postingWinter } from './postingDepartures';
import { postingRequest, postingDecision } from './postingApplications';
import { envelope } from './faDeclarations';
import { reduceEconomyCommand } from '../../contractEconomy';

// Explicit synthetic certificates only. Real roster tests use birth-only facts.
export const qualificationFacts = () => ({ version: 1, playerId: 0, sourcePlayerId: null,
  birthDate: { date: '2000-01-01', sourceIds: ['synthetic-profile'] },
  professionalSeasons: { asOfDate: '2026-12-01', coverage: 'partial', ruleId: 'synthetic-rule-v1',
    seasons: [2020, 2021, 2022, 2023, 2024, 2025].map(season => ({ season,
      confirmedDate: `${season}-12-01`, sourceIds: [`synthetic-season-${season}`] })) } });
export function approvedPostingWorld(world = postingWinter()) {
  for (const command of [postingRequest, postingDecision]) {
    const r = reduceEconomyCommand(world, command(world));
    if (!r.ok) throw new Error(r.error); world = r.world;
  }
  return world;
}
export const qualificationCommand = (w, overrides = {}) => envelope(w, {
  id: 'qualification', type: 'record-posting-qualification', requestId: 'request', facts: qualificationFacts(), ...overrides });
