import { it, expect } from 'vitest';
import { faWinter, declaration, envelope } from './fixtures/faDeclarations';
import { overseasDeparture } from './fixtures/overseasDepartures';
import { reduceEconomyCommand } from '../contractEconomy';
import { validateEconomySave } from '../economyPersistence';

const apply = (w, c) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
it('rejects expiry and overseas FA evidence for the same source contract', () => {
  const source = faWinter();
  const released = apply(source, envelope(source, { id: 'expiry-0', type: 'enter-market', teamId: 0, playerId: 0,
    contractId: source.teams[0].players[0].contractId, reason: 'expiry' }));
  const declared = apply(source, declaration(source, 0, { kind: 'overseas-fa' }));
  const exited = apply(declared, overseasDeparture(declared));
  exited.faPool = released.faPool;
  exited.teams[0].history.push(...released.teams[0].history);
  exited.contractEconomy.engine.offseasonDepartures = released.contractEconomy.engine.offseasonDepartures;
  exited.contractEconomy.engine.transactions.push(...released.contractEconomy.engine.transactions);
  exited.contractEconomy.revision++;
  expect(() => validateEconomySave(exited)).toThrow();
});
