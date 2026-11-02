import { createAnnualNewGameWorld, fromAnnualState, toAnnualState } from '../../contractEconomy';
import { economyPolicy } from './economyWorld';

export function tradeFixture({ date = '2026-07-16', count = 1, approved = 100000, salary = 10000, years = 1 } = {}) {
  const player = (id, name, pay, years = 1) => ({ id, name, salary: pay, contractYearsLeft: years,
    age: 26, pos: '一塁手', batting: { contact: 70, power: 70, speed: 70, eye: 70, clutch: 70, breakingBall: 70 },
    stats: {}, potential: 70, condition: 70 });
  const teams = [0, 1].map(id => ({ id, name: id ? '相手球団' : '自球団', budget: 999, league: 'セ',
    players: [player(id ? 'b' : 0, id ? '獲得選手' : '放出選手', id ? 1000 : salary, id ? 3 : years)],
    farm: id ? [] : Array.from({ length: count - 1 }, (_, i) => player(`extra-${i}`, `控え${i}`, 420)),
    lineup: [id ? 'b' : 0], lineupDh: [id ? 'b' : 0], lineupNoDh: [id ? 'b' : 0], rotation: [], coaches: [] }));
  const w = createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: 'trade-save', season: 2026,
    policy: economyPolicy(teams, 2026, approved), randomRoot: { algorithmVersion: 1, seed: 'trade-seed' } });
  w.contractEconomy.clock = { season: 2026, phase: 'season', date, offseasonTurn: 0 };
  w.schedule = [null, { date: { month: Number(date.slice(5, 7)), day: Number(date.slice(8)) } }];
  return fromAnnualState(w, toAnnualState(w));
}
