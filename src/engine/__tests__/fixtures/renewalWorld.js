import { economyFixture } from './economyWorld';
import { fromAnnualState, toAnnualState } from '../../contractEconomy';

export function renewalFixture({ phase = 'season', date = '2026-07-16', turn = 0 } = {}) {
  const w = economyFixture();
  for (const t of w.teams) {
    Object.assign(t, { name: `球団${t.id}`, wins: 40, losses: 20, league: 'C', city: '東京' });
    for (const p of t.players) Object.assign(p, { age: 27, trust: 90, hometown: '東京',
      personality: { money: 80, winning: 0, playing: 0, hometown: 0, loyalty: 0, stability: 20, future: 0 } });
  }
  w.teams[0].players[0].salary = 10000;
  w.contractEconomy.engine.spending.ledger.records[0].contract.annualSalaryManYen = 10000;
  w.contractEconomy.clock = { season: 2026, phase, date, offseasonTurn: turn };
  w.schedule = [null, { date: { month: Number(date.slice(5, 7)), day: Number(date.slice(8)) } }];
  if (phase === 'offseason') {
    w.contractEconomy.engine.spending.budgetSeason = 2027;
    for (const key of ['authorizations', 'rosterRequirements']) {
      const rows = key === 'authorizations' ? w.contractEconomy.engine.spending[key] : w.contractEconomy.engine[key];
      rows.push(...rows.filter(r => r.season === 2033).map(r => ({ ...r, season: 2034 })));
    }
    w.contractEconomy.budgetPolicies.push(...w.contractEconomy.budgetPolicies.filter(r => r.season === 2033).map(r => ({ ...r, season: 2034 })));
  }
  return fromAnnualState(w, toAnnualState(w));
}
