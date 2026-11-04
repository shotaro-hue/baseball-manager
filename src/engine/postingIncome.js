import { createPostingDeparture, normalizePostingDeparture } from './annualPostingDepartures';

const fail = () => { throw new Error('ポスティング成立・譲渡金・翌年度追加枠の根拠を確認してください。'); };
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const money = n => Number.isSafeInteger(n) && n >= 0;
const safe = n => { if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) fail(); return Number(n); };
const policy = Object.freeze({ version: 1, fxYenPerUsd: 150, allocationPercent: 100,
  rounding: 'floor-man-yen', feeRounding: 'half-up-cent' });
export const isPostingCompletionCommand = c => c?.type === 'complete-posting';

export function quotePostingIncome(contract) {
  const field = contract?.kind === 'major' ? 'guaranteedUsdCents' : contract?.kind === 'minor' ? 'signingBonusUsdCents' : null;
  if (!field || Object.keys(contract).length !== 2 || !Object.hasOwn(contract, field)
    || !money(contract[field]) || (contract.kind === 'major' && !contract[field])) fail();
  const total = BigInt(contract[field]), tier = 2_500_000_000n;
  const min = (a, b) => a < b ? a : b, max = (a, b) => a > b ? a : b;
  const weighted = contract.kind === 'minor' ? total * 2500n
    : min(total, tier) * 2000n + min(max(total - tier, 0n), tier) * 1750n + max(total - tier * 2n, 0n) * 1500n;
  const cents = (weighted + 5000n) / 10000n;
  return { feeUsdCents: safe(cents), amountManYen: safe(cents * BigInt(policy.fxYenPerUsd) / 1_000_000n), policy: { ...policy } };
}

export function normalizePostingCompletion(c) {
  if (!isPostingCompletionCommand(c) || Object.keys(c).some(k => !['id', 'type', 'teamId', 'playerId', 'contractId',
    'settlement', 'terminationAgreementId', 'overseasContract'].includes(k))) fail();
  const { overseasContract, ...departure } = c;
  quotePostingIncome(overseasContract);
  const { reason, ...normalized } = normalizePostingDeparture({ ...departure, type: 'end-contract', reason: 'posting' });
  return { ...normalized, type: 'complete-posting', overseasContract: { ...overseasContract } };
}

function departureFor(c) {
  const { overseasContract, ...d } = c;
  return normalizePostingDeparture({ ...d, id: JSON.stringify([c.id, 'posting-departure']), type: 'end-contract', reason: 'posting' });
}
function incomeFor(state, c, d) {
  const quote = quotePostingIncome(c.overseasContract), i = state.economyIdentity;
  return { id: JSON.stringify([c.id, 'posting-income']), version: 1, kind: 'posting', transactionId: c.id,
    postingDepartureId: d.id, season: d.season, teamId: d.teamId, playerId: d.player.id, sourceContractId: d.sourceContractId,
    sourceKey: JSON.stringify([i.saveId, i.epoch, 'posting', d.season, d.teamId, d.player.id, d.sourceContractId]),
    recordedDate: d.notifiedDate, overseasContract: { ...c.overseasContract }, ...quote,
    budgetAllocation: { season: d.season + 1, amountManYen: quote.amountManYen } };
}

// Validate before using any income to authorize spending. Old states have no
// completion receipts; missing new evidence is never interpreted as a zero fee.
export function inspectPostingIncome(state) {
  const list = state.incomeReceipts === undefined ? [] : state.incomeReceipts;
  if (!Array.isArray(list)) fail();
  const ids = new Set(), sources = new Set(), parents = new Set(), departures = new Set();
  const allocations = [];
  for (const r of list) {
    if (!r || r.kind !== 'posting' || r.version !== 1 || state.version !== 2 || !state.economyIdentity
      || ids.has(String(r.id)) || sources.has(r.sourceKey) || parents.has(String(r.transactionId))
      || departures.has(String(r.postingDepartureId))) fail();
    const matches = state.transactions.filter(t => t.id === r.transactionId), receipt = matches[0];
    let c; try { c = normalizePostingCompletion(JSON.parse(receipt?.signature)); } catch { fail(); }
    const ds = (state.postingDepartures ?? []).filter(d => d.id === r.postingDepartureId), d = ds[0];
    if (matches.length !== 1 || ds.length !== 1 || c.id !== r.transactionId || receipt.signature !== stable(c)
      || receipt.postingIncomeId !== r.id || d.id !== departureFor(c).id || d.teamId !== c.teamId
      || d.player.id !== c.playerId || d.sourceContractId !== c.contractId
      || !Number.isInteger(d.season) || d.season < 1 || d.season > state.season || d.season >= 9999
      || stable(r) !== stable(incomeFor(state, c, d))) fail();
    const child = state.transactions.filter(t => t.id === d.id);
    if (child.length !== 1 || child[0].signature !== stable(departureFor(c))) fail();
    ids.add(String(r.id)); sources.add(r.sourceKey); parents.add(String(r.transactionId)); departures.add(String(r.postingDepartureId));
    allocations.push({ teamId: r.teamId, ...r.budgetAllocation });
  }
  for (const t of state.transactions) {
    let c; try { c = JSON.parse(t.signature); } catch { /* opaque pre-existing receipts */ }
    if ((isPostingCompletionCommand(c) || t.postingIncomeId !== undefined) && !parents.has(String(t.id))) fail();
  }
  return allocations;
}

export function postingBudgetSupplement(allocations, teamId, season) {
  return safe(allocations.filter(a => a.teamId === teamId && a.season === season)
    .reduce((sum, a) => sum + BigInt(a.amountManYen), 0n));
}

export function createPostingCompletion(state, c, signature) {
  if (state.version !== 2 || state.phase !== 'offseason' || state.season >= 9999 || !Array.isArray(state.incomeReceipts)) fail();
  const departure = departureFor(c);
  // Add no allowance until the original employment/request/agreement has passed
  // #543's checks. Both records stay inside this unpublished annual candidate.
  const next = createPostingDeparture(state, departure, stable(departure));
  const d = next.postingDepartures.at(-1), income = incomeFor(state, c, d);
  const incomeReceipts = [...state.incomeReceipts, income];
  const transactions = [...next.transactions, { id: c.id, signature, postingIncomeId: income.id }];
  const pending = { ...next, incomeReceipts, transactions };
  inspectPostingIncome(pending);
  let found = false;
  const authorizations = next.spending.authorizations.map(a => {
    if (a.teamId !== c.teamId || a.season !== income.budgetAllocation.season) return a;
    if (found) fail(); found = true;
    return { ...a, approvedManYen: safe(BigInt(a.approvedManYen) + BigInt(income.amountManYen)) };
  });
  if (!found) fail();
  return { ...pending, spending: { ...next.spending, authorizations } };
}
