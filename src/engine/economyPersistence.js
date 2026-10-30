import { contractEconomyMode, toAnnualState } from './contractEconomy';
import { hasSelectedTeam } from './teamId';
import { contractEmploymentAt, isContractLedgerExtension } from './contractLedger';
import { employmentPlayerFields } from './seasonContract';
import { quoteAnnualSpendingPlan } from './annualSpending';

// Storage validation only. Commit acknowledgements/barrier live in saveload;
// activation and application hydration remain separate A1-1d stages.
export function validateEconomySave(world) {
  const mode = contractEconomyMode(world);
  if (mode === 'annual') {
    // The legacy writer may normalize/mint save IDs. Annual identities must
    // survive serialization exactly (including their receipt references).
    if (typeof world.saveId !== 'string' || !world.saveId.trim()
      || world.saveId !== world.saveId.trim() || world.saveId.length > 120
      || !hasSelectedTeam(world.teams, world.myId)) throw new Error('economy_save_identity_invalid');
    const state = toAnnualState(world); // Validate roster, ledger, reservations and all years together.
    const date = state.phase === 'offseason' ? `${String(state.season).padStart(4, '0')}-11-30` : state.date;
    const employment = new Map(contractEmploymentAt(state.spending.ledger, date).map(e => [e.contract.playerId, e]));
    const budgets = new Map(quoteAnnualSpendingPlan(state.spending)
      .filter(row => row.season === state.spending.budgetSeason).map(row => [row.teamId, row.remainingManYen]));
    for (const team of world.teams) {
      if (!budgets.has(team.id) || team.budget !== budgets.get(team.id)) throw new Error('economy_budget_projection_invalid');
      for (const player of [...team.players, ...team.farm]) {
        const current = employment.get(player.id), development = current.registrationType === 'development';
        const fields = { ...employmentPlayerFields(current, state.season), 育成: development, isIkusei: development };
        for (const key of ['salary', 'contractId', 'contractYearsLeft', 'contractYears', 'contractSignedYear', '育成', 'isIkusei']) {
          if (Object.hasOwn(player, key) !== Object.hasOwn(fields, key) || player[key] !== fields[key])
            throw new Error('economy_player_projection_invalid');
        }
      }
    }
  }
  return mode;
}

const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export function economySaveMetadata(world) {
  const e = world?.contractEconomy;
  if (e === undefined) return undefined;
  return { schemaVersion: e?.schemaVersion, mode: e?.mode, epoch: e?.epoch,
    revision: e?.revision, terms: canonical(e) };
}

function preservesEconomyHistory(before, after) {
  if (canonical(before.randomRoot) !== canonical(after.randomRoot)) return false;
  const oldLedger = before.engine.spending.ledger, newLedger = after.engine.spending.ledger;
  // Reuse ledger semantics (including closed years); additionally retain the
  // exact persisted evidence and record order, which the semantic check ignores.
  if (!isContractLedgerExtension(oldLedger, newLedger)
    || !oldLedger.records.every((record, i) => canonical(record) === canonical({ ...newLedger.records[i],
      changes: newLedger.records[i].changes.slice(0, record.changes.length) }))) return false;
  const receipts = before.engine.transactions, nextReceipts = after.engine.transactions;
  return nextReceipts.length >= receipts.length
    && receipts.every((receipt, i) => canonical(receipt) === canonical(nextReceipts[i]));
}

export function economyOverwriteIssue(previous, next, metadata = economySaveMetadata(previous)) {
  if (!previous || previous.saveId !== next.saveId) return null;
  const before = metadata, after = economySaveMetadata(next);
  if ((!before || before.mode === 'legacy') && after?.mode === 'annual') return 'economy_activation_required';
  if (!before) return null;
  if (before.schemaVersion !== 1 || !['annual', 'legacy'].includes(before.mode)) return 'economy_payload_invalid';
  if (before.mode !== 'annual') return null;
  if (after?.mode !== 'annual') return 'economy_payload_missing';
  if (before.epoch !== after.epoch) return 'economy_epoch_conflict';
  if (after.revision < before.revision || (after.revision === before.revision && after.terms !== before.terms))
    return 'economy_revision_conflict';
  // terms is an independent serialized observation, including after load or
  // backup recovery. Canonicalize both sides: legacy opening signatures retain
  // their source object's key order. Never use the caller-owned previous world.
  if (after.revision > before.revision
    && !preservesEconomyHistory(JSON.parse(before.terms), JSON.parse(after.terms))) return 'economy_history_conflict';
  return null;
}

// A recognizable annual root can recover only within its own epoch. Opaque
// cold-start corruption needs the durable activation anchor in A1-1d-2.
export function economyRecoveryGuard(world, e = world?.contractEconomy) {
  if (e === undefined) return null;
  if (!e || e.schemaVersion !== 1 || !['annual', 'legacy'].includes(e.mode)
    || (e.mode === 'legacy' && e.engine !== undefined)) return { blocked: true };
  if (e.mode === 'legacy') return null;
  const validId = id => (typeof id === 'string' && id.trim().length > 0) || (Number.isSafeInteger(id) && id >= 0);
  return validId(world.saveId) && validId(e.epoch)
    ? { saveId: world.saveId, epoch: e.epoch } : { blocked: true };
}

export function matchesEconomyRecoveryGuard(world, guard) {
  return !guard || (!guard.blocked && world.saveId === guard.saveId
    && world.contractEconomy?.schemaVersion === 1 && world.contractEconomy.mode === 'annual'
    && world.contractEconomy.epoch === guard.epoch);
}
