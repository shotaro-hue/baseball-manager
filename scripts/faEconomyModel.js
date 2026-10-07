// Controlled CPU economy experiment. Keep lifecycle rules shared with the game;
// this does not implement draft, retirement, posting or the user's offseason UI.
import { calcPlayerDemand, getFaProgress } from '../src/engine/contract';
import { assessFaDeclaration } from '../src/engine/faDeclaration';
import { ownedPlayers, renewalEligible, remainingContractAfterSeason } from '../src/engine/renewalRules';
import { emptyStats } from '../src/engine/playerCore';
import { makeCareerEntry, appendCareerEntryToPlayer } from '../src/engine/careerStats';
import { hasRecordedFirstTeamSeason } from '../src/engine/seasonParticipants';
import { isTeamIdSet } from '../src/engine/teamId';
import { TEAM_DEFS } from '../src/constants';

export function nextEconomyYear(teams, year) {
  return teams.map(t => {
    const advance = (p, active) => {
      const transferred = p.faArchivedYear === year && p.contractSignedYear === year
        && isTeamIdSet(p.faOriginTeamId) && p.faOriginTeamId !== t.id;
      const played = hasRecordedFirstTeamSeason(p) || hasRecordedFirstTeamSeason({ stats: p.playoffStats });
      const archived = !transferred && (active || played)
        ? appendCareerEntryToPlayer(p, makeCareerEntry(p.stats, p.playoffStats, year, t.id, t.name)) : p;
      return { ...archived, age: p.age + 1,
        serviceYears: (p.serviceYears || 0) + (p.育成 ? 0 : 1),
        ikuseiYears: p.育成 ? (p.ikuseiYears || 0) + 1 : 0,
        stats: emptyStats(), playoffStats: emptyStats(), injury: null, injuryDaysLeft: 0,
        contractYearsLeft: remainingContractAfterSeason(p, year),
        ...(active ? { condition: Math.max(60, Math.min(100, p.condition + 20)), postingRequested: false,
          growthPhase: p.age + 1 <= 24 ? 'growth' : p.age + 1 <= 29 ? 'peak' : p.age + 1 <= 33 ? 'earlyDecline' : 'decline' } : {}) };
    };
    const players = t.players.filter(p => !p._retireNow).map(p => advance(p, true));
    const farm = (t.farm || []).map(p => advance(p, false));
    const ids = new Set(players.map(p => p.id));
    const base = TEAM_DEFS.find(d => d.id === t.id)?.budget ?? t.budget;
    const payroll = [...players, ...farm].reduce((s, p) => s + (p.salary || 0), 0);
    return { ...t, players, farm, wins: 0, losses: 0, draws: 0, rf: 0, ra: 0, rotIdx: 0,
      winStreak: 0, loseStreak: 0, revenueThisSeason: 0,
      ...Object.fromEntries(['lineup', 'lineupNoDh', 'lineupDh', 'rotation'].map(key => [key, (t[key] || []).filter(id => ids.has(id))])),
      budget: Math.max(Math.round(base * .5), base + Math.round((t.revenueThisSeason || 0) * .6) - payroll) };
  });
}

export function collectEconomyDemands(teams, context) {
  return teams.flatMap(t => ownedPlayers(t).filter(p => renewalEligible(p, context.year)).map(p => {
    const d = calcPlayerDemand(p, { ...context, team: t, teams });
    return { id: p.id, name: p.name, age: p.age, pitcher: !!p.isPitcher, role: p.subtype,
      roster: t.farm?.some(x => x.id === p.id) ? 'farm' : 'active', ikusei: !!p.育成,
      pa: p.stats?.PA, ip: p.stats?.IP, hr: p.stats?.HR,
      ops: Number.isFinite(d.assessment.obp) && Number.isFinite(d.assessment.slg) ? d.assessment.obp + d.assessment.slg : null,
      era: d.assessment.era ?? null, previous: p.salary, demand: d.demandSalary,
      recorded: d.assessment.recorded, qualified: !p.育成 && !!getFaProgress(p).domestic?.eligible,
      decision: assessFaDeclaration(p, t, context.year, d) };
  }));
}

export function createEconomyMarketEntries(players, teams, year) {
  return players.map(p => {
    const origin = teams.find(t => ownedPlayers(t).some(x => x.id === p.id));
    if (!origin) throw new Error(`市場選手の旧所属が見つかりません: ${p.id}`);
    return { ...p, marketLastStats: p.stats, faEnteredYear: year, faOriginTeamId: origin.id,
      faOriginTeamName: origin.name, faOriginRoster: origin.farm?.some(x => x.id === p.id) ? 'farm' : 'active' };
  });
}

export function economyPriceMismatches(entries, rows) {
  return entries.filter(p => p.marketEntryReason === '国内FA宣言').flatMap(p => {
    const demand = rows.find(r => r.id === p.id);
    if (!demand) return [{ id: p.id, name: p.name, asking: p.salary, reason: '査定対象の欠落' }];
    return p.salary === demand.demand ? [] : [{ id: p.id, name: p.name, previous: demand.previous,
      asking: p.salary, sharedDemand: demand.demand, reason: '市場価格と共有要求額の不一致' }];
  });
}
