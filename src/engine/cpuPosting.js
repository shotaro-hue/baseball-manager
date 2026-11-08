import { tradeValue, getFrontOfficePlanPublic } from './trade';
import { roleOf, sameRole } from './rosterPlanning';
import { evaluateOrganizationNeeds } from './organizationNeeds';
import { isIkuseiPlayer } from './rosterCapacity';

export const cpuPostingReasonText = {
  'role-depth': '必要な役割人数を維持', 'controlled-core': '複数年の主力を維持',
  'replacement-covered': '同役割の代替戦力あり', 'expiring-veteran': '満了するベテランの挑戦を承認',
  'rebuild-veteran': '再建方針でベテランの挑戦を承認', 'retain-strength': '代替戦力より高い戦力を維持',
  'future-budget': '残存保証と欠員補充を含む将来年度の予算を確保できないため拒否',
};

// Policy v1 is a conservative game assumption, not a measured real-world rate.
// No overseas offer, price, player response, or future market draw is consulted.
export function evaluateCpuPosting(f) {
  const fields = ['teamId', 'playerId', 'sourceContractId', 'season', 'ageYears', 'endSeason', 'mode',
    'role', 'minimumDepth', 'remainingDepth', 'value', 'replacementValue', 'core'];
  if (!f || Object.keys(f).length !== fields.length || Object.keys(f).some(k => !fields.includes(k))
    || !['contend', 'retool', 'rebuild', 'neutral'].includes(f.mode) || typeof f.core !== 'boolean'
    || typeof f.role !== 'string' || !f.role.length || !['season', 'ageYears', 'endSeason', 'minimumDepth', 'remainingDepth', 'value', 'replacementValue']
      .every(k => Number.isSafeInteger(f[k]) && f[k] >= 0) || f.minimumDepth < 1 || f.endSeason < f.season) throw Error('CPUのポスティング判断資料を確認してください。');
  const reason = f.remainingDepth < f.minimumDepth ? 'role-depth'
    : f.core && f.endSeason > f.season && !(f.mode === 'rebuild' && f.ageYears >= 30) ? 'controlled-core'
    : f.replacementValue >= f.value ? 'replacement-covered'
    : f.ageYears >= 30 && f.endSeason === f.season ? 'expiring-veteran'
    : f.ageYears >= 30 && f.mode === 'rebuild' ? 'rebuild-veteran' : 'retain-strength';
  return { decision: ['replacement-covered', 'expiring-veteran', 'rebuild-veteran'].includes(reason) ? 'approve' : 'reject', reason };
}

// New decisions carry the common admission result, not a predicted market fee
// or draw. Keep v1 above frozen for already published receipts.
export function evaluateBudgetedCpuPosting(f) {
  if (typeof f?.budgetAffordable !== 'boolean') throw Error('CPUのポスティング予算審査を確認してください。');
  const { budgetAffordable, ...strategy } = f, evaluation = evaluateCpuPosting(strategy);
  return evaluation.decision === 'approve' && !budgetAffordable
    ? { decision: 'reject', reason: 'future-budget' } : evaluation;
}

export function cpuPostingInputs(state, request, outgoing, employmentById) {
  const source = state.teams.find(t => t.id === request.teamId);
  const available = p => !isIkuseiPlayer(p) && !p.isRetired && !p._retireNow && !outgoing.has(p.id)
    && !(state.retirementReservations ?? []).some(r => r.playerId === p.id && r.season === state.season);
  const team = { ...source, players: source.players.filter(available), farm: source.farm.filter(available) };
  const player = [...team.players, ...team.farm].find(p => p.id === request.playerId);
  const employment = employmentById.get(request.sourceContractId);
  const organization = evaluateOrganizationNeeds(team);
  if (!player || !employment || !organization.ok) throw Error('CPUの所属・元契約・役割を確認してください。');
  const peers = [...team.players, ...team.farm].filter(p => p.id !== player.id && sameRole(p, player));
  const role = roleOf(player), requirement = Object.values(organization.roles).find(r => r.label === role);
  return { teamId: request.teamId, playerId: request.playerId, sourceContractId: request.sourceContractId,
    season: state.season, ageYears: player.age, endSeason: employment.contract.endSeason,
    mode: getFrontOfficePlanPublic(source).mode, role, minimumDepth: requirement?.organizationMinimum ?? 1,
    remainingDepth: peers.length, value: tradeValue(player), replacementValue: Math.max(0, ...peers.map(tradeValue)),
    core: Boolean(player.core || tradeValue(player) >= 70) };
}
