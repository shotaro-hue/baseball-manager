import { createGeneratedPostingRequests, postingGenerationId } from './generatedPostingRequests';
import { createPostingApplication, postingApplicationViews } from './annualPostingApplications';
import { createGeneratedPostingMarket } from './generatedPostingMarket';
import { cpuPostingInputs, evaluateCpuPosting, evaluateBudgetedCpuPosting } from './cpuPosting';
import { contractEmploymentAt } from './contractLedger';
import { employmentContractId } from './seasonContract';

const stable = v => JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const id = v => typeof v === 'string' && v.trim().length > 0 || Number.isSafeInteger(v) && v >= 0;
const fail = () => { throw Error('年度のポスティング工程・CPU判断・子処理の記録を確認してください。'); };
const day = y => `${String(y).padStart(4, '0')}-12-01`;
export const postingPhaseId = season => JSON.stringify(['annual-posting-phase', season]);
export const isAnnualPostingPhaseCommand = c => c?.type === 'advance-posting-phase';
export function normalizeAnnualPostingPhase(c) {
  if (!isAnnualPostingPhaseCommand(c) || ![c.id, c.humanTeamId].every(id) || Object.keys(c).length !== 3
    || Object.keys(c).some(k => !['id', 'type', 'humanTeamId'].includes(k))) fail();
  return { id: c.id, type: c.type, humanTeamId: c.humanTeamId };
}
const decisionId = r => JSON.stringify(['cpu-posting-decision', r]);
const marketId = r => JSON.stringify(['cpu-posting-market', r]);
const decisionCommand = d => ({ id: d.decisionId, type: 'decide-posting', requestId: d.requestId, decision: d.decision });
const sorted = rows => [...rows].sort((a, b) => {
  const x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0;
});

// Compose in annual state. The outer common transaction owns validation,
// spending admission and the single world revision; no intermediate adoption.
export function* createAnnualPostingPhaseSteps(state, c, signature, prepareBudgetAdmission) {
  if (state.version !== 2 || state.phase !== 'offseason' || state.date !== day(state.season)
    || state.season >= 9999 || c.id !== postingPhaseId(state.season)
    || !state.teams.some(t => t.id === c.humanTeamId)) fail();
  if ((state.retirementReservations ?? []).some(r => r.season === state.season && !r.finalization))
    throw Error('引退予約を確定してから海外挑戦の希望を確認してください。');
  const g = { version: 1, policyVersion: 'cpu-posting-v2', season: state.season, date: state.date,
    humanTeamId: c.humanTeamId, teamIds: sorted(state.teams.map(t => t.id)), createdGenerationIds: [], decisions: [], marketIds: [] };
  let next = state;
  const run = (command, create) => {
    if (next.transactions.some(t => String(t.id) === String(command.id))) fail();
    try { next = create(next, command, stable(command)); }
    catch (error) { throw Error(`ポスティング処理 ${String(command.id)}: ${error.message}`); }
  };
  for (const teamId of g.teamIds) {
    const command = { id: postingGenerationId(state.season, teamId), type: 'generate-posting-requests', teamId };
    if (!next.transactions.some(t => t.id === command.id)) {
      run(command, createGeneratedPostingRequests); g.createdGenerationIds.push(command.id);
    }
    yield;
  }
  const cpuRequests = () => postingApplicationViews(next).filter(r => r.season === state.season && r.teamId !== c.humanTeamId);
  // Every approval is treated as outgoing for subsequent decisions, regardless
  // of its eventual market outcome. Decide ALL requests before any market run.
  const employmentById = new Map(contractEmploymentAt(state.spending.ledger, `${String(state.season).padStart(4, '0')}-11-30`)
    .map(e => [employmentContractId(e.contract), e]));
  const outgoing = new Set(cpuRequests().filter(r => r.status === 'approved' || r.status === 'signed').map(r => r.playerId));
  const admitBudget = prepareBudgetAdmission(next, cpuRequests().filter(r => r.status === 'approved'));
  for (const requestId of sorted(cpuRequests().filter(r => r.status === 'pending').map(r => r.id))) {
    const request = cpuRequests().find(r => r.id === requestId);
    const strategy = cpuPostingInputs(next, request, outgoing, employmentById);
    const inputs = { ...strategy, budgetAffordable: evaluateCpuPosting(strategy).decision !== 'approve' || admitBudget(request) };
    const evaluation = evaluateBudgetedCpuPosting(inputs);
    const d = { requestId, decisionId: decisionId(requestId), inputs, ...evaluation };
    run(decisionCommand(d), createPostingApplication);
    next = { ...next, transactions: next.transactions.map(t => t.id === d.decisionId
      ? { ...t, cpuPostingDecision: { phaseId: c.id, ...structuredClone(d) } } : t) };
    g.decisions.push(d);
    if (d.decision === 'approve') outgoing.add(request.playerId);
    yield;
  }
  for (const requestId of sorted(cpuRequests().filter(r => r.status === 'approved').map(r => r.id))) {
    const command = { id: marketId(requestId), type: 'run-posting-market', requestId };
    run(command, createGeneratedPostingMarket); g.marketIds.push(command.id);
    yield;
  }
  return { ...next, transactions: [...next.transactions, { id: c.id, signature, annualPostingPhase: g }] };
}

// Inputs are historical decision evidence. Do not re-run roster strategy using
// today's ratings, ownership or policy after a save/reload/year change.
export function inspectAnnualPostingPhases(state) {
  const receipts = new Map(state.transactions.map(t => [t.id, t])), decisions = new Set();
  const requests = new Map((state.postingApplications ?? []).filter(r => r.kind === 'request').map(r => [r.id, r]));
  for (const t of state.transactions) {
    let command; try { command = JSON.parse(t.signature); } catch { /* old opaque receipt */ }
    if (!isAnnualPostingPhaseCommand(command) && t.annualPostingPhase === undefined) continue;
    const c = normalizeAnnualPostingPhase(command), g = t.annualPostingPhase;
    if (!g || Object.keys(g).length !== 9 || g.version !== 1 || !['cpu-posting-v1', 'cpu-posting-v2'].includes(g.policyVersion)
      || !Number.isInteger(g.season) || g.season < 1 || g.season > state.season || g.date !== day(g.season) || g.date > state.date
      || g.humanTeamId !== c.humanTeamId || c.id !== t.id || c.id !== postingPhaseId(g.season) || t.signature !== stable(c)
      || !Array.isArray(g.teamIds) || stable(g.teamIds) !== stable(sorted(state.teams.map(t => t.id))) || !g.teamIds.includes(c.humanTeamId)
      || !Array.isArray(g.createdGenerationIds) || new Set(g.createdGenerationIds).size !== g.createdGenerationIds.length
      || !Array.isArray(g.decisions) || !Array.isArray(g.marketIds) || new Set(g.marketIds).size !== g.marketIds.length) fail();
    const generations = g.teamIds.map(teamId => postingGenerationId(g.season, teamId));
    if (generations.some(id => !receipts.get(id)?.generatedPostingRequests)
      || g.createdGenerationIds.some(id => !generations.includes(id))) fail();
    const employment = new Map(contractEmploymentAt(state.spending.ledger, `${String(g.season).padStart(4, '0')}-11-30`)
      .map(e => [employmentContractId(e.contract), e]));
    for (const d of g.decisions) {
      const r = requests.get(d?.requestId), f = d?.inputs, child = receipts.get(d?.decisionId);
      if (!d || Object.keys(d).length !== 5 || !r || r.teamId === c.humanTeamId || r.season !== g.season
        || !f || f.teamId !== r.teamId || f.playerId !== r.playerId || f.sourceContractId !== r.sourceContractId || f.season !== g.season
        || f.endSeason !== employment.get(r.sourceContractId)?.contract.endSeason
        || decisions.has(d.decisionId) || d.decisionId !== decisionId(r.id)
        || stable((g.policyVersion === 'cpu-posting-v1' ? evaluateCpuPosting : evaluateBudgetedCpuPosting)(f)) !== stable({ decision: d.decision, reason: d.reason })
        || child?.signature !== stable(decisionCommand(d))
        || stable(child.cpuPostingDecision) !== stable({ phaseId: c.id, ...d })) fail();
      decisions.add(d.decisionId);
    }
    for (const market of g.marketIds) {
      const child = receipts.get(market), r = requests.get(child?.generatedPostingMarket?.requestId);
      if (!r || r.teamId === c.humanTeamId || r.season !== g.season || market !== marketId(r.id)
        || child.signature !== stable({ id: market, type: 'run-posting-market', requestId: r.id })) fail();
    }
    // The phase cannot claim completion while a CPU case is silently missing.
    if (postingApplicationViews(state).some(r => r.season === g.season && r.teamId !== c.humanTeamId
      && ['pending', 'approved'].includes(r.status))) fail();
  }
  if (state.transactions.some(t => t.cpuPostingDecision !== undefined && !decisions.has(t.id))) fail();
}
