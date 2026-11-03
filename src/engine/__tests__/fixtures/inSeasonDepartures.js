import { createAnnualNewGameWorld, fromAnnualState, toAnnualState } from '../../contractEconomy';
import { economyPolicy } from './economyWorld';

export function playableClub(id = 0) {
  const players = Array.from({ length: 21 }, (_, i) => ({ id: id === 0 ? i : 'club-' + id + '-' + i,
    name: 'Player ' + i, age: 25, isPitcher: i >= 19,
    pos: i >= 19 ? '投手' : [1, 10].includes(i) ? '捕手' : '一塁手',
    salary: 1000, contractYearsLeft: 1, injuryDaysLeft: 0, registrationCooldownDays: 0, stats: {},
    batting: { contact: 50, eye: 50, power: 50, stamina: 50 },
    pitching: { velocity: 50, control: 50, breaking: 50, stamina: 50 } }));
  return { id, name: 'Club ' + id, budget: 0, players: [...players.slice(0, 9), players[19]],
    farm: [...players.slice(9, 19), players[20]], lineup: [0, 1], fieldingDh: { 0: '一塁手', 1: '捕手' } };
}
export function atDate(world, date, gameDay = world.gameDay) {
  const [year, month, day] = date.split('-').map(Number);
  const schedule = [...(world.schedule ?? [])]; schedule[gameDay] = { gameNo: gameDay, date: { month, day } };
  return { ...world, year, gameDay, schedule, contractEconomy: { ...world.contractEconomy,
    clock: { season: year, phase: 'season', date, offseasonTurn: 0 } } };
}
export function inSeasonWorld({ years = 3, teams = [playableClub(), playableClub(1)], date = '2026-07-16', saveId = 'inseason-release' } = {}) {
  const source = structuredClone(teams);
  source[0].players[0].contractYearsLeft = years;
  const world = createAnnualNewGameWorld({ teams: source, faPool: [], myId: source[0].id, season: 2026,
    saveId, policy: economyPolicy(source, 2026, 1000000),
    randomRoot: { algorithmVersion: 1, seed: 'inseason-release' } });
  const current = atDate(world, date, 100);
  return fromAnnualState(current, toAnnualState(current));
}
export function releaseCommand(world, playerId = world.teams[0].players[0].id, overrides = {}) {
  const player = [...world.teams[0].players, ...world.teams[0].farm].find(p => p.id === playerId);
  return { saveId: world.saveId, epoch: world.contractEconomy.epoch, baseRevision: world.contractEconomy.revision,
    transaction: { id: 'release-' + playerId, type: 'enter-market', reason: 'release',
      teamId: world.teams[0].id, playerId, contractId: player?.contractId, ...overrides } };
}
