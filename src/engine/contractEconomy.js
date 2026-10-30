import { employmentContractId, projectEmploymentPlayer, validateAnnualEmploymentContract, normalizeEmploymentContract } from './seasonContract';
import { createSeasonContract } from './seasonContract';
import { createContractLedger, applyContractLedgerAction, contractEmploymentAt, validateContractLedger } from './contractLedger';
import { applyAnnualTransaction, projectAnnualState } from './annualTransactions';
import { quoteAnnualSpendingPlan } from './annualSpending';
import { draftCapacityContext, isIkuseiPlayer } from './rosterCapacity';
import { economyClockFor, validateEconomyClock } from './economyCalendar';

// A1-1a is a pure, fixture-only boundary. Activation/persistence is A1-1d/4b.
export const ANNUAL_ECONOMY_RELEASE_ENABLED = false;
const fail = message => { throw new Error(message); };
const validId = id => (typeof id === 'string' && id.trim().length > 0) || (Number.isSafeInteger(id) && id >= 0);
const counter = n => Number.isSafeInteger(n) && n >= 0;
const engineArrays = ['transactions', 'rosterRequirements', 'acquisitions', 'faProtectionLists',
  'faPersonnelMoves', 'faCompensationStandings', 'offseasonDepartures'];
const evidenceArrays = ['contracts', 'marketEntries', 'staff', 'clauses'];
const identity = world => ({ saveId: world.saveId, epoch: world.contractEconomy.epoch, baseRevision: world.contractEconomy.revision });
const sameIdentity = (a, b) => a && b && a.saveId === b.saveId && a.epoch === b.epoch && a.baseRevision === b.baseRevision;
const recordedContracts = spending => [...spending.ledger.records.map(r => r.contract),
  ...[...spending.reservations, ...spending.resolvedReservations].flatMap(r =>
    [r.proposal?.contract, ...(r.acceptedProposal ? [r.acceptedProposal.contract] : [])])];

function typedIds(ids) {
  const seen = new Map();
  for (const id of ids) {
    if (!validId(id) || (seen.has(String(id)) && seen.get(String(id)) !== id)) fail('識別IDの欠損・型の衝突を確認してください。');
    seen.set(String(id), id);
  }
}

function inspectContractClaims(spending, proposal) {
  const proposals = [...spending.reservations, ...spending.resolvedReservations].flatMap(r =>
    [r.proposal, ...(r.acceptedProposal ? [r.acceptedProposal] : [])]);
  if (proposal) proposals.push(proposal);
  const claims = [...spending.ledger.records.map(r => ({ id: r.actionId, teamId: r.initialTeamId, contract: r.contract })), ...proposals];
  typedIds(claims.map(p => employmentContractId(p.contract)));
  const seen = new Map();
  for (const p of claims) {
    const key = employmentContractId(p.contract), value = JSON.stringify([p.id, p.teamId, normalizeEmploymentContract(p.contract)]);
    // Accepted proposals appear both in history and ledger. Cancellation must
    // not free their contract identity for a different player or promise.
    if (seen.has(key) && seen.get(key) !== value) fail('契約IDを別の提示・条件へ再利用できません。');
    seen.set(key, value);
  }
}

function inspectBudgetApprovals(authorizations, budgetPolicies) {
  // Validate supplied evidence only; generating/rolling annual budgets is A1-1c.
  // Include extra supplied years, not only the minimum season..season+7 range.
  const approvals = list => {
    const rows = new Map();
    if (!Array.isArray(list)) fail('年度予算のpolicy・許可が未記録です。');
    for (const row of list) {
      if (!validId(row?.teamId) || !Number.isInteger(row?.season) || row.season < 1 || row.season > 9999)
        fail('年度予算の球団・年度を確認してください。');
      if (row?.approvedManYen === undefined || row.approvedManYen === null) fail('年度予算の承認額が未記録です。');
      if (!counter(row.approvedManYen)) fail('年度予算の承認額が不正です。');
      const key = JSON.stringify([row.teamId, row.season]);
      if (rows.has(key)) fail('同一球団・年度の予算policy・許可が重複しています。');
      rows.set(key, row.approvedManYen);
    }
    return rows;
  };
  const authorized = approvals(authorizations), recorded = approvals(budgetPolicies);
  if (authorized.size !== recorded.size || [...authorized.keys()].some(key => !recorded.has(key)))
    fail('同一球団・年度の予算policy・許可が未記録です。');
  for (const [key, amount] of authorized) if (amount !== recorded.get(key))
    fail('同一球団・年度の予算policyと許可の承認額が一致しません。');
}

function inspectEnvelope(world) {
  const e = world.contractEconomy;
  if (!validId(world.saveId) || !validId(e.epoch) || !counter(e.revision)
    || e.randomRoot?.algorithmVersion !== 1 || typeof e.randomRoot.seed !== 'string' || !e.randomRoot.seed.trim()
    || !Array.isArray(world.teams) || !Array.isArray(world.faPool) || !Array.isArray(world.mailbox) || !Array.isArray(world.news)
    || !Object.hasOwn(world, 'offseasonPlan') || (world.offseasonPlan !== null && (typeof world.offseasonPlan !== 'object' || Array.isArray(world.offseasonPlan)))
    || !world.faYears || typeof world.faYears !== 'object' || Array.isArray(world.faYears)
    || !e.engine || e.engine.version !== 2 || engineArrays.some(k => !Array.isArray(e.engine[k]))
    || ['teams', 'faPool', 'draftContext', 'season', 'phase', 'date', 'economyIdentity'].some(k => Object.hasOwn(e.engine, k))
    || ['budgetPolicies', 'staffContracts', 'incomeReceipts', 'decisions'].some(k => !Array.isArray(e[k]))
    || e.cycle?.season !== world.year || !['playing', 'postseason', 'offseason-open', 'planning', 'ready-for-spring', 'new-season'].includes(e.cycle.stage)
    || !Array.isArray(e.cycle.transitionReceipts) || e.migration?.version !== 1
    || !['pending', 'applied', 'deferred'].includes(e.migration.status) || !Array.isArray(e.migration.issues)
    || !e.legacyEvidence || evidenceArrays.some(k => !Array.isArray(e.legacyEvidence[k]))) fail('新契約worldの必須データ・versionを確認してください。');
  validateEconomyClock(world);
  const spending = e.engine.spending;
  if (!spending || !Array.isArray(spending.ledger?.records) || !Array.isArray(spending.reservations)
    || !Array.isArray(spending.resolvedReservations)) fail('契約台帳・正式留保が未記録です。');
  inspectBudgetApprovals(spending.authorizations, e.budgetPolicies);
  // All NEW native terms are guaranteed; v1 fixtures remain independent.
  const contracts = recordedContracts(spending);
  contracts.forEach(validateAnnualEmploymentContract);
  typedIds(e.engine.transactions.map(r => r?.id));
  inspectContractClaims(spending);
  typedIds([...spending.reservations, ...spending.resolvedReservations].map(r => r.proposal?.id));
  if (e.engine.offseasonDepartures.length) fail('冬の退団は後続工程で接続されます。');
}

export function contractEconomyMode(world) {
  const e = world?.contractEconomy;
  if (e === undefined) return 'legacy';
  if (!e || e.schemaVersion !== 1 || !['legacy', 'annual'].includes(e.mode)) fail('未知の契約制度・schemaです。');
  if (e.mode === 'annual') inspectEnvelope(world);
  else if (e.engine !== undefined) fail('旧制度へ新契約台帳を部分的に混在できません。');
  return e.mode;
}

export function toAnnualState(world) {
  if (contractEconomyMode(world) !== 'annual') fail('新契約制度のworldが必要です。');
  const e = world.contractEconomy;
  return projectAnnualState({ ...e.engine, ...e.clock, teams: world.teams, faPool: world.faPool,
    economyIdentity: identity(world), draftContext: draftCapacityContext(world.offseasonPlan, world.year, world.teams) });
}

function projectDraftPlan(world, state) {
  const before = draftCapacityContext(world.offseasonPlan, world.year, world.teams), after = state.draftContext;
  if (before.draftPool === after.draftPool && before.drafted === after.drafted && before.confirmedPicks === after.confirmedPicks) return world.offseasonPlan;
  // No draft object is persisted under engine. Existing result/view ownership wins.
  if (!world.offseasonPlan || world.offseasonPlan.year !== world.year) {
    if (after.draftPool.length || Object.keys(after.drafted).length || Object.keys(after.confirmedPicks).length) fail('新人結果の正本となるオフ計画がありません。');
    return world.offseasonPlan;
  }
  const p = world.offseasonPlan;
  return { ...p,
    ...(p.draftResult ? { draftResult: { ...p.draftResult, pool: after.draftPool, drafted: after.drafted } }
      : { draftPool: after.draftPool }),
    draftViews: { ...p.draftViews, draft: { ...p.draftViews?.draft, drafted: after.drafted },
      lottery: { ...p.draftViews?.lottery, confirmedPicks: after.confirmedPicks } } };
}

export function fromAnnualState(world, input) {
  if (contractEconomyMode(world) !== 'annual' || !sameIdentity(input.economyIdentity, identity(world))
    || input.season !== world.year || input.phase !== world.contractEconomy.clock.phase || input.date !== world.contractEconomy.clock.date)
    fail('取引結果のworld・年度・revisionが一致しません。');
  const state = projectAnnualState(input), rows = quoteAnnualSpendingPlan(state.spending);
  const rosterDate = state.phase === 'offseason' ? `${String(state.season).padStart(4, '0')}-11-30` : state.date;
  const employed = new Map(contractEmploymentAt(state.spending.ledger, rosterDate).map(e => [e.contract.playerId, e]));
  const projectPlayer = p => {
    const employment = employed.get(p.id);
    if (!employment) fail('現在の名簿に対応する雇用がありません。');
    const development = employment.registrationType === 'development';
    return { ...projectEmploymentPlayer(p, employment, state.season),
      育成: development, isIkusei: development };
  };
  const teams = state.teams.map(t => {
    const row = rows.find(r => r.teamId === t.id && r.season === state.spending.budgetSeason);
    if (!row) fail('現在の予算年度の追加余力が未記録です。');
    return { ...t, players: t.players.map(projectPlayer), farm: t.farm.map(projectPlayer), budget: row.remainingManYen };
  });
  const engine = Object.fromEntries(['version', 'spending', ...engineArrays].map(k => [k, state[k]]));
  const next = { ...world, teams, faPool: state.faPool, offseasonPlan: projectDraftPlan(world, state),
    contractEconomy: { ...world.contractEconomy, engine } };
  toAnnualState(next);
  return next;
}

function runCommand(world, command) {
  const state = toAnnualState(world), current = identity(world);
  if (!command || Object.keys(command).some(k => !['saveId', 'epoch', 'baseRevision', 'transaction'].includes(k))
    || command.saveId !== current.saveId || command.epoch !== current.epoch || !counter(command.baseRevision)
    || command.baseRevision > current.baseRevision || !command.transaction) fail('取引のsaveId・epoch・revisionが古いか未記録です。');
  const c = command.transaction;
  typedIds([...state.transactions.map(r => r.id), c.id]);
  if (c.proposal) {
    if (c.proposal.contract?.guaranteed !== true) fail('新しい契約の保証を外すことはできません。');
    typedIds([...state.spending.reservations, ...state.spending.resolvedReservations].map(r => r.proposal.id).concat(c.proposal.id));
    inspectContractClaims(state.spending, c.proposal);
  }
  const result = applyAnnualTransaction(state, c);
  if (!result.ok) fail(result.error);
  if (command.baseRevision !== current.baseRevision && !result.replayed) fail('取引のrevisionが古くなっています。');
  if (!result.replayed && !counter(current.baseRevision + 1)) fail('契約revisionが安全な範囲を超えています。');
  return result;
}

export function quoteEconomyCommand(world, command) {
  try {
    const result = runCommand(world, command);
    return { ok: true, rows: result.rows, replayed: result.replayed,
      effects: { transactionId: command.transaction.id, nextRevision: world.contractEconomy.revision + Number(!result.replayed) } };
  } catch (error) { return { ok: false, error: error.message }; }
}

export function reduceEconomyCommand(world, command) {
  try {
    const result = runCommand(world, command);
    if (result.replayed) return { ok: true, world, replayed: true };
    const next = fromAnnualState(world, result.state);
    return { ok: true, world: { ...next, contractEconomy: { ...next.contractEconomy, revision: world.contractEconomy.revision + 1 } }, replayed: false };
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}

export function createAnnualNewGameWorld({ teams, faPool, myId, saveId, season, policy, randomRoot }) {
  const clock = economyClockFor({ season, phase: 'preseason' });
  if (!Array.isArray(teams) || !teams.length || !teams.some(t => t.id === myId) || !Array.isArray(faPool)
    || !policy || ['authorizations', 'rosterRequirements', 'budgetPolicies'].some(k => !Array.isArray(policy[k])))
    fail('新規ゲームの名簿・明示した年度policyが必要です。');
  for (const t of teams) for (let y = season; y <= season + 7; y++) {
    const match = list => list.filter(r => r?.teamId === t.id && r.season === y);
    if (match(policy.authorizations).length !== 1 || match(policy.rosterRequirements).length !== 1 || match(policy.budgetPolicies).length !== 1)
      fail('新規ゲームの全審査年度にpolicy・許可・人数計画が必要です。');
  }
  inspectBudgetApprovals(policy.authorizations, policy.budgetPolicies);
  const ledger = createContractLedger();
  for (const team of teams) {
    if (!Array.isArray(team.players) || !Array.isArray(team.farm)) fail('初期名簿の一軍・二軍が未記録です。');
    for (const p of [...team.players, ...team.farm]) {
      const contract = createSeasonContract({ contractId: JSON.stringify(['initial-contract', saveId, p.id]), playerId: p.id,
        signedSeason: season, agreementPhase: 'preseason', purpose: 'acquisition', termYears: p.contractYearsLeft,
        annualSalaryManYen: p.salary, guaranteed: true, registrationType: isIkuseiPlayer(p) ? 'development' : 'controlled' });
      // Validate each independent initial sign, then reconcile the complete
      // ledger once; rebuilding the full 780-player ledger per sign is quadratic.
      const signed = applyContractLedgerAction(createContractLedger(), { id: JSON.stringify(['initial-sign', saveId, p.id]), type: 'sign',
        teamId: team.id, effectiveDate: clock.date, contract });
      ledger.records.push(signed.records[0]);
    }
  }
  validateContractLedger(ledger);
  const initialId = JSON.stringify(['new-game', saveId]);
  const world = { teams, faPool: faPool.map(p => {
    if (p.marketEntry !== undefined) fail('新規市場候補に過去の市場履歴を混在できません。');
    return { ...p, isFA: true, marketEntry: { id: JSON.stringify(['initial-market', saveId, p.id]), kind: 'released', enteredDate: clock.date } };
  }), myId, saveId, year: season, gameDay: 1, schedule: null, faYears: {}, offseasonPlan: null, mailbox: [], news: [],
  contractEconomy: { schemaVersion: 1, mode: 'annual', epoch: initialId, revision: 0, randomRoot: { ...randomRoot }, clock,
    cycle: { season, stage: 'new-season', transitionReceipts: [] },
    engine: { version: 2, spending: { version: 1, budgetSeason: season, ledger, authorizations: policy.authorizations,
      reservations: [], resolvedReservations: [], oneOffCosts: [] }, transactions: [], rosterRequirements: policy.rosterRequirements,
      acquisitions: [], faProtectionLists: [], faPersonnelMoves: [], faCompensationStandings: [], offseasonDepartures: [] },
    budgetPolicies: policy.budgetPolicies, staffContracts: [], incomeReceipts: [], decisions: [],
    migration: { version: 1, status: 'applied', migrationId: initialId, fromSaveId: saveId, observedSeason: season, earliestOffseason: season, issues: [] },
    legacyEvidence: { contracts: [], marketEntries: [], staff: [], clauses: [] } } };
  // This pure constructor is intentionally not called by normal new-game hooks.
  const next = fromAnnualState(world, toAnnualState(world));
  return structuredClone(next);
}
