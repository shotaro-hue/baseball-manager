import { ACCEPT_THRESHOLD } from '../constants';
import { parseContractDate } from './contractCalendar';

const daysAfter = (date, days) => {
  parseContractDate(date);
  const d = new Date(`${date}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function replyTiming(clock, score, version = 2) {
  // Preserve v1 renewal promises. New offers: strong (75+) = 2,
  // borderline (55+) = 3, weak = 4 days/turns. This is not salary consent.
  const wait = version === 1 ? (score >= ACCEPT_THRESHOLD ? 2 : 4) : score >= 75 ? 2 : score >= 55 ? 3 : 4;
  return { dueDate: clock.phase === 'offseason' ? null : daysAfter(clock.date, wait),
    dueTurn: clock.phase === 'offseason' ? clock.offseasonTurn + wait : null, deadlineTurn: 37 };
}

export function isDecisionDue(d, clock) {
  if (d.season !== clock.season) return true;
  if (clock.phase === 'offseason') {
    if (d.dueTurn !== null) return clock.offseasonTurn >= d.dueTurn;
    // Late-November renewal promises continue over the fixed December clock.
    return d.dueDate <= daysAfter(clock.date, clock.offseasonTurn);
  }
  return d.dueDate !== null && clock.date >= d.dueDate;
}
