import { renewalFixture } from './renewalWorld';

export function acquisitionFixture(options) {
  const w = renewalFixture(options);
  w.faPool = [{ ...structuredClone(w.teams[0].players[0]), id: 'free', name: '市場選手', isFA: true,
    marketEntry: { id: 'released-2026-free', kind: 'released', enteredDate: '2026-02-01' } }];
  return w;
}

export function acquisitionClock(w, date, turn = 0) {
  const next = structuredClone(w);
  next.contractEconomy.clock.date = date; next.contractEconomy.clock.offseasonTurn = turn;
  next.schedule = [null, { date: { month: Number(date.slice(5, 7)), day: Number(date.slice(8)) } }];
  return next;
}
