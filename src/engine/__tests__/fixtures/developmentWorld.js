import { createAnnualNewGameWorld, fromAnnualState, toAnnualState } from '../../contractEconomy';
import { economyPolicy } from './economyWorld';

export function developmentFixture({ salary = 240, count = 1, date = '2026-07-16', playerId = 0 } = {}) {
  const teams = [0, 1].map(id => ({ id, name: `球団${id}`, budget: 999, lineup: [], rotation: [], coaches: [], league: 'セ',
    players: [{ id: `active-${id}`, name: '支配下選手', pos: '一塁手', salary: 1000, contractYearsLeft: 1 }],
    farm: id ? [] : [{ id: playerId, name: '育成選手', age: 20, pos: '遊撃手', salary,
      isIkusei: true, 育成: true, ikuseiYears: 1, contractYearsLeft: 3 },
      ...Array.from({ length: count - 1 }, (_, i) => ({ id: `extra-${i}`, name: `控え${i}`, pos: '一塁手', salary: 420, contractYearsLeft: 1 }))] }));
  for (const team of teams) for (const player of [...team.players, ...team.farm])
    Object.assign(player, { batting: { contact: 50, power: 50, speed: 50, eye: 50, clutch: 50, breakingBall: 50 },
      stats: {}, potential: 60, condition: 70, age: player.age ?? 25 });
  const w = createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: 'development-save', season: 2026,
    policy: economyPolicy(teams), randomRoot: { algorithmVersion: 1, seed: 'development-seed' } });
  w.contractEconomy.clock = { season: 2026, phase: 'season', date, offseasonTurn: 0 };
  w.schedule = [null, { date: { month: Number(date.slice(5, 7)), day: Number(date.slice(8)) } }];
  return fromAnnualState(w, toAnnualState(w));
}
