import { MIN_SALARY_SHIHAKA } from '../constants';
import { reduceEconomyCommand, toAnnualState } from './contractEconomy';
import { contractEmploymentAt, contractLiabilityRows } from './contractLedger';
import { employmentContractId } from './seasonContract';
import { quoteAnnualSpendingPlan } from './annualSpending';
import { evaluateRosterCapacity, isIkuseiPlayer } from './rosterCapacity';
import { faPersonnelCapacityContext, inspectFaPersonnelMoves } from './faPersonnel';
import { inspectAnnualAcquisitions } from './annualAcquisitions';

const fail = message => { throw new Error(message); };
const validId = id => (typeof id === 'string' && id.trim().length > 0) || (Number.isSafeInteger(id) && id >= 0);

export function developmentRequest(world, playerId) {
  return { saveId: world.saveId, epoch: world.contractEconomy?.epoch,
    baseRevision: world.contractEconomy?.revision, season: world.year, teamId: world.myId, playerId };
}

export function reduceDevelopmentRequest(world, request) {
  try {
    const r = request, e = world.contractEconomy;
    if (!r || Object.keys(r).some(k => !['saveId', 'epoch', 'baseRevision', 'season', 'teamId', 'playerId'].includes(k))
      || !validId(r.playerId) || !validId(r.teamId) || !Number.isSafeInteger(r.baseRevision) || r.baseRevision < 0
      || !Number.isInteger(r.season) || r.season < 1 || r.season > world.year)
      fail('支配下登録の操作・入力項目を確認してください。');
    const state = toAnnualState(world);
    if (r.saveId !== world.saveId || r.epoch !== e.epoch || r.teamId !== world.myId || r.baseRevision > e.revision)
      fail('支配下登録のセーブ・世代・球団が変更されています。');
    const id = JSON.stringify(['human-development', r.saveId, r.epoch, r.baseRevision, r.season, r.teamId, r.playerId]);
    const envelope = transaction => ({ saveId: r.saveId, epoch: r.epoch, baseRevision: r.baseRevision, transaction });
    const receipt = state.transactions.find(t => t.id === id);
    if (receipt) {
      const command = JSON.parse(receipt.signature);
      if (command.id !== id || command.type !== 'convert-to-controlled' || command.teamId !== r.teamId || command.playerId !== r.playerId)
        fail('支配下登録の確定履歴が一致しません。');
      return reduceEconomyCommand(world, envelope(command));
    }
    if (r.baseRevision !== e.revision || r.season !== world.year) fail('支配下登録の状態が変更されています。条件を確認し直してください。');
    if (!['preseason', 'season'].includes(state.phase)) fail('支配下登録は開幕前またはシーズン中に行ってください。');
    const player = world.teams.find(t => t.id === r.teamId)?.farm.find(p => p.id === r.playerId);
    const employment = contractEmploymentAt(state.spending.ledger, state.date)
      .find(p => p.teamId === r.teamId && p.contract.playerId === r.playerId);
    if (!player || !isIkuseiPlayer(player) || employment?.registrationType !== 'development')
      fail('自球団の二軍に所属する育成選手を選んでください。');
    return reduceEconomyCommand(world, envelope({ id, type: 'convert-to-controlled', teamId: r.teamId, playerId: r.playerId,
      contractId: employmentContractId(employment.contract), annualSalaryManYen: Math.max(employment.annualSalaryManYen, MIN_SALARY_SHIHAKA) }));
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}

// Quote through the same reducer as the commit. No parallel payroll arithmetic.
export function previewDevelopmentRegistration(world, playerId) {
  const result = reduceDevelopmentRequest(world, developmentRequest(world, playerId));
  if (!result.ok) return { ok: false, error: result.error };
  const before = toAnnualState(world), after = toAnnualState(result.world);
  const team = world.teams.find(t => t.id === world.myId);
  const player = result.world.teams.find(t => t.id === world.myId).farm.find(p => p.id === playerId);
  const record = after.spending.ledger.records.find(r => employmentContractId(r.contract) === player.contractId);
  const costs = contractLiabilityRows(after.spending.ledger).filter(r => r.contractId === player.contractId && r.teamId === world.myId && r.season >= world.year);
  const capacity = evaluateRosterCapacity(team, { ...faPersonnelCapacityContext(before), teams: world.teams });
  const pendingCount = inspectAnnualAcquisitions(before).filter(h => h.proposal.teamId === world.myId && !isIkuseiPlayer(h.player)).length
    + inspectFaPersonnelMoves(before).filter(m => m.teamId === world.myId).length;
  return { ok: true, salary: player.salary, endSeason: record.contract.endSeason,
    occupiedCount: capacity.controlledCount + capacity.acceptedPickCount + pendingCount,
    costs, rows: quoteAnnualSpendingPlan(after.spending).filter(r => r.teamId === world.myId && r.season <= record.contract.endSeason) };
}
