import { postingCommand } from './postingDepartures';
export function completion(w, extra = {}, teamId = w.teams[0].id, playerId = 0) {
  const c = postingCommand(w, {}, teamId, playerId);
  const { reason, ...transaction } = c.transaction;
  return { ...c, transaction: { ...transaction, type: 'complete-posting',
    overseasContract: { kind: 'major', guaranteedUsdCents: 10_000_000_000 }, ...extra } };
}
