import { budgetForecastWorld } from './budgetForecast';
import { closedPostseasonWorld } from './openOffseason';
import { openOffseasonRequest, reduceOpenOffseasonRequest } from '../../annualOpenOffseason';
import { reduceEconomyCommand } from '../../contractEconomy';
import { wrap } from './annualRetirements';
import { yearEndRetirementsId } from '../../annualYearEndRetirements';
import { growthCommand } from './yearEndGrowth';

const result = r => { if (!r.ok) throw Error(r.error); return r.world; };
export function renewalClosingWorld() {
  const teams = budgetForecastWorld().teams.map(t => ({ ...t, players: t.players.map(p => ({ ...p,
    age: 25, potential: 90, contractYearsLeft: 1, stats: { PA: 0 },
    personality: { money: 80, winning: 0, playing: 0, hometown: 0, loyalty: 0, stability: 20, future: 0 },
    batting: { contact: 60, power: 60, eye: 60, speed: 60, arm: 60, defense: 60, stealSkill: 60, baseRunning: 60, clutch: 60 },
  })) }));
  return closedPostseasonWorld(teams);
}
export const openRenewalWinter = (w = renewalClosingWorld()) => result(reduceOpenOffseasonRequest(w, openOffseasonRequest(w)));
export const reviewRenewalWinter = (w = openRenewalWinter()) => result(reduceEconomyCommand(w, wrap(w, {
  id: yearEndRetirementsId(w.year), type: 'prepare-year-end-retirements', humanTeamId: w.myId, decisions: [],
})));
export const growRenewalWinter = (w = reviewRenewalWinter()) => result(reduceEconomyCommand(w, growthCommand(w)));
