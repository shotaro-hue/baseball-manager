import { isPendingContractReply } from './contractReplies';
import { projectLegacyCarryForward } from './seasonContract';
import { validateContractLedger } from './contractLedger';
export { projectLegacyCarryForward } from './seasonContract';

const validId = id => (typeof id === 'string' && id.trim()) || (Number.isSafeInteger(id) && id >= 0);
const fields = ['salary', 'contractYearsLeft', 'contractYears', 'contractSignedYear', '育成', 'isIkusei', 'ikuseiYears', 'contractIncentives'];

/** A1-1b contract-only preview. This is neither an annual world nor a save write.
 * The caller must prove the unstarted offseason boundary; activation is A1-1d.
 * Existing plans are conservatively deferred until a later unstarted offseason.
 */
export function prepareEconomyMigration(world, boundary) {
  const issues = [], reject = (field, code, extra = {}) => issues.push({ field, code, ...extra });
  if (!world || !validId(world.saveId) || !Number.isInteger(world.year) || world.year < 1 || world.year > 9992) {
    return { ok: false, issues: [{ field: 'world', code: 'invalid' }] };
  }
  if (world.contractEconomy !== undefined && (world.contractEconomy?.schemaVersion !== 1 || world.contractEconomy.mode !== 'legacy' || world.contractEconomy.engine !== undefined))
    reject('contractEconomy', 'not-legacy');
  if (boundary?.season !== world.year || boundary.stage !== 'unstarted-offseason' || boundary.legacyOffseasonStarted !== false
    || !['season', 'postseason'].includes(world.phase) || world.offseasonPlan !== null)
    reject('boundary', 'deferred', { earliestOffseason: world.year + 1 });
  if (!Array.isArray(world.mailbox) || world.mailbox.some(mail => !mail || typeof mail !== 'object' || isPendingContractReply(mail)))
    reject('mailbox', 'deferred', { earliestOffseason: world.year + 1 });
  if (!Array.isArray(world.teams) || world.teams.length !== 12 || !Array.isArray(world.faPool)) reject('rosters', 'invalid');
  if (issues.length) return { ok: false, issues };
  const migrationId = JSON.stringify(['legacy-opening', 1, world.saveId, world.year]);
  const teams = new Set(), players = new Set(), records = [], budgets = [];
  const checkId = (id, seen, field) => {
    if (!validId(id) || seen.has(String(id))) { reject(field, 'duplicate-or-invalid'); return false; }
    seen.add(String(id)); return true;
  };
  for (const team of world.teams) {
    if (!checkId(team?.id, teams, 'teamId') || !Array.isArray(team.players) || !Array.isArray(team.farm)) { reject('team', 'invalid'); continue; }
    budgets.push({ teamId: team.id, ...(Object.hasOwn(team, 'budget') ? { budget: structuredClone(team.budget) } : {}) });
    for (const player of [...team.players, ...team.farm]) {
      if (!checkId(player?.id, players, 'playerId')) continue;
      try {
        const projection = projectLegacyCarryForward(player, world.year);
        const openingId = JSON.stringify(['opening', migrationId, player.id]);
        const contract = { kind: 'legacy-opening', openingId, playerId: player.id, teamId: team.id,
          observedSeason: world.year, observedDate: `${String(world.year).padStart(4, '0')}-11-30`,
          observedAnnualSalaryManYen: player.salary, observedYearsLeft: player.contractYearsLeft, ...projection,
          guaranteeStatus: 'unknown', sourceFields: structuredClone(Object.fromEntries(fields.filter(k => Object.hasOwn(player, k)).map(k => [k, player[k]]))), migrationId };
        records.push({ contract, actionId: openingId, initialTeamId: team.id, effectiveDate: contract.observedDate, changes: [] });
      } catch (error) { reject(error.field ?? 'contract', error.code ?? 'invalid', { playerId: player.id, teamId: team.id }); }
    }
  }
  for (const player of world.faPool) checkId(player?.id, players, 'playerId');
  if (issues.length) return { ok: false, issues };
  const ledger = { version: 2, closedThroughSeason: world.year, records };
  try { validateContractLedger(ledger); }
  catch { return { ok: false, issues: [{ field: 'ledger', code: 'invalid' }] }; }
  return { ok: true, issues: [], candidate: { version: 1, scope: 'contracts-only', migrationId, observedSeason: world.year,
    ledger, legacyEvidence: { budgets, marketEntries: structuredClone(world.faPool) } } };
}
