import { FA_CASH_COMPENSATION_PERCENT, MIN_SALARY_SHIHAKA } from '../constants';
import { parseContractDate } from './contractCalendar';

const fail = () => { throw new Error('FA補償の根拠・選択・精算履歴を確認してください。'); };
const validId = x => (typeof x === 'string' && x.trim().length > 0) || (Number.isSafeInteger(x) && x >= 0);
export function normalizeFaCompensationBasis(input) {
  if (!input || Object.keys(input).length !== 2
    || Object.keys(input).some(k => !['previousAnnualSalaryManYen', 'exercise'].includes(k))
    || !Number.isSafeInteger(input.previousAnnualSalaryManYen) || input.previousAnnualSalaryManYen < MIN_SALARY_SHIHAKA
    || !['first', 'repeat'].includes(input.exercise)) fail();
  return { previousAnnualSalaryManYen: input.previousAnnualSalaryManYen, exercise: input.exercise };
}

export const requiresFaCompensation = p => ['domestic-fa', 'overseas-fa'].includes(p?.marketEntry?.kind)
  && ['A', 'B'].includes(p.marketEntry.compensationRank) && p.marketEntry.originTeamId !== p.teamId;
export function faCashCompensationManYen(p) {
  if (!requiresFaCompensation(p)) return 0;
  const basis = normalizeFaCompensationBasis(p.marketEntry.compensationBasis);
  const percent = FA_CASH_COMPENSATION_PERCENT[basis.exercise][p.marketEntry.compensationRank];
  // Integer 万円 policy: reserve/pay the same upward-rounded amount, once.
  return Number((BigInt(basis.previousAnnualSalaryManYen) * BigInt(percent) + 99n) / 100n);
}

export function faCashCompensationCosts(p) {
  const amount = faCashCompensationManYen(p);
  return amount === 0 ? [] : [['payer', p.teamId, amount], ['payee', p.marketEntry.originTeamId, -amount]].map(([side, teamId, amountManYen]) => ({
    id: JSON.stringify(['fa-compensation', p.id, side]), teamId, season: p.contract.startSeason,
    kind: 'fa-compensation', amountManYen, proposalId: p.id,
  }));
}

// Accepted metadata remains authoritative after spring joins, trades and salary
// changes. No current player or roster data is needed to audit a past settlement.
export function prepareFaCompensations(plan, resolutions) {
  if (plan.faCompensations !== undefined && !Array.isArray(plan.faCompensations)) fail();
  const accepted = new Map(resolutions.filter(r => r.kind === 'offer' && r.resolution === 'accepted'
    && requiresFaCompensation(r.proposal))
    .map(r => [r.proposal.id, r]));
  const ids = new Set(), records = [], obligations = [], costs = [];
  for (const input of plan.faCompensations ?? []) {
    if (!input || !validId(input.proposalId) || ids.has(input.proposalId)
      || !['pending', 'cash-only'].includes(input.resolution)) fail();
    ids.add(input.proposalId);
    const resolved = accepted.get(input.proposalId), p = resolved?.proposal;
    if (!p || p.contract.agreementPhase !== 'offseason') fail();
    const pending = input.resolution === 'pending', fields = pending ? ['proposalId', 'resolution'] : ['proposalId', 'resolution', 'teamId', 'chosenDate'];
    if (Object.keys(input).length !== fields.length || Object.keys(input).some(k => !fields.includes(k))) fail();
    let record = { proposalId: p.id, resolution: input.resolution };
    if (pending) {
      if (p.contract.startSeason < plan.budgetSeason) fail();
    } else {
      const date = parseContractDate(input.chosenDate);
      if (input.teamId !== p.marketEntry.originTeamId || input.chosenDate < resolved.answeredDate
        || date.year < p.contract.signedSeason || date.year > p.contract.startSeason) fail();
      record = { ...record, teamId: input.teamId, chosenDate: input.chosenDate };
      costs.push(...faCashCompensationCosts(p));
    }
    records.push(record); obligations.push({ record, proposal: p, amountManYen: faCashCompensationManYen(p) });
  }
  if ([...accepted.keys()].some(id => !ids.has(id))) fail();
  return { records, obligations, costs };
}
