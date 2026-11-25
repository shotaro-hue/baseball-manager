import { expect, it } from 'vitest';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { renewalFixture } from '../src/engine/__tests__/fixtures/renewalWorld';
it('save inspection must not freeze caller-owned compatible ledger metadata',()=>{
 const world=renewalFixture(),ledger=world.contractEconomy.engine.spending.ledger;
 ledger.importMetadata={source:'old-archive',nested:{note:'preserve'}};
 expect(validateEconomySave(world)).toBe('annual');
 expect(Object.isFrozen(ledger.importMetadata)).toBe(false);
 expect(Object.isFrozen(ledger.importMetadata.nested)).toBe(false);
 ledger.importMetadata.nested.note='still editable';
 expect(validateEconomySave(world)).toBe('annual');
});
