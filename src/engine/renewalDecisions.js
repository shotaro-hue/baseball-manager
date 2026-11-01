import { ACCEPT_THRESHOLD } from '../constants';
import { calcPlayerDemand, evaluateRenewalOffer } from './contract';
import { contractEconomyMode, reduceEconomyCommand, toAnnualState } from './contractEconomy';
import { contractEmploymentAt } from './contractLedger';
import { createSeasonContract, employmentContractId } from './seasonContract';
import { isIkuseiPlayer } from './rosterCapacity';
import { ownedPlayers } from './renewalRules';
import { parseContractDate } from './contractCalendar';

const kind = 'human-renewal';
const fail = message => { throw new Error(message); };
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const key = (...parts) => JSON.stringify([kind, ...parts]);
const decisionId = request => key(request.saveId, request.epoch, request.baseRevision, request.action.playerId);
const fixedDecision = ({ status, resolvedClock, resolutionRequest, resolutionTransactionId, failureReason, ...fixed }) => fixed;
const resolutionEvidence = d => ({ proposalId: d.proposalId, status: d.status, resolvedClock: d.resolvedClock,
  ...(d.resolutionRequest ? { resolutionRequest: d.resolutionRequest } : {}),
  ...(d.failureReason ? { failureReason: d.failureReason } : {}) });
const states = ['pending', 'accepted', 'rejected', 'cancelled', 'replaced', 'invalidated'];
const terminalResolution = { accepted: 'accepted', rejected: 'rejected', cancelled: 'cancelled', replaced: 'replaced', invalidated: 'cancelled' };
const daysAfter = (date, days) => {
  parseContractDate(date);
  const d = new Date(`${date}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Capture identity and user intent, never a caller-controlled acceptance result.
export function renewalRequest(world, action) {
  return { saveId: world.saveId, epoch: world.contractEconomy?.epoch,
    baseRevision: world.contractEconomy?.revision, action: structuredClone(action) };
}

function inspectRequest(request) {
  const action = request?.action;
  const fields = { offer: ['playerId', 'salary', 'years', 'replaceProposalId', 'incentives'], cancel: ['proposalId'], 'resolve-due': [] };
  if (!request || Object.keys(request).some(k => !['saveId', 'epoch', 'baseRevision', 'action'].includes(k))
    || !Number.isSafeInteger(request.baseRevision) || request.baseRevision < 0
    || !action || !Object.hasOwn(fields, action.type)
    || Object.keys(action).some(k => k !== 'type' && !fields[action.type].includes(k))) fail('更改操作の入力を確認してください。');
  if (action.type === 'offer' && action.incentives !== undefined) {
    const i = action.incentives;
    if (!i || Array.isArray(i) || typeof i !== 'object'
      || Object.keys(i).some(k => !['performanceBonusRate', 'titleBonus', 'optOut'].includes(k))
      || (i.performanceBonusRate !== undefined && i.performanceBonusRate !== 0)
      || (i.titleBonus !== undefined && i.titleBonus !== 0)
      || (i.optOut !== undefined && i.optOut !== false)) fail('新しい更改では出来高・オプトアウト条項を指定できません。');
  }
}

function replyTiming(clock, score, version = 2) {
  // v1 promises retain their original two/four-day schedule. New promises:
  // strong (75+) = 2, borderline (55+) = 3, weak = 4 days/turns.
  // Timing reflects overall appeal, not an override of salary-aware consent.
  const wait = version === 1 ? (score >= ACCEPT_THRESHOLD ? 2 : 4) : score >= 75 ? 2 : score >= 55 ? 3 : 4;
  return { dueDate: clock.phase === 'offseason' ? null : daysAfter(clock.date, wait),
    dueTurn: clock.phase === 'offseason' ? clock.offseasonTurn + wait : null, deadlineTurn: 37 };
}

const due = (d, clock) => {
  if (d.season !== clock.season) return true;
  if (clock.phase === 'offseason') {
    if (d.dueTurn !== null) return clock.offseasonTurn >= d.dueTurn;
    // Offseason has a fixed December 1 civil date. Preserve the waiting
    // interval of a late-November offer using the corresponding turn.
    return d.dueDate <= daysAfter(clock.date, clock.offseasonTurn);
  }
  return d.dueDate !== null && clock.date >= d.dueDate;
};

export function dueRenewalDecisions(world) {
  const e = world.contractEconomy;
  return (e?.decisions ?? []).filter(d => d.kind === kind && d.status === 'pending'
    && d.teamId === world.myId && due(d, e.clock));
}

// Mail is a projection. A missing/trimmed mail never removes a promise.
function withDecision(world, decision) {
  const decisions = world.contractEconomy.decisions;
  const previous = decisions.find(d => d.proposalId === decision.proposalId && d.kind === kind);
  const accepted = decision.status === 'accepted';
  const labels = { pending: '回答待ち', accepted: '受諾', rejected: '辞退', cancelled: '取消', replaced: '再提示により取消', invalidated: '条件変更により失効' };
  const player = world.teams.flatMap(ownedPlayers).find(p => p.id === decision.playerId);
  const a = decision.request.action;
  const id = key('mail', decision.proposalId);
  const pending = decision.status === 'pending';
  const mail = { id, type: pending ? 'economy_renewal_pending' : 'contract_reply', read: false, resolved: !pending,
    resolution: accepted ? 'signed' : decision.status, economyProposalId: decision.proposalId,
    title: `【契約${pending ? '回答予定' : '回答'}】${player?.name ?? '選手'}`, from: `${player?.name ?? '選手'} / 代理人`,
    dateLabel: `${decision.season}年`,
    body: `${labels[decision.status]}：翌${decision.season + 1}年度から年俸${a.salary}万円・${a.years}年。今季の年俸・所属は維持します。`
      + (decision.failureReason ? `\n${decision.failureReason}` : ''),
    decision: { playerId: decision.playerId, teamId: decision.teamId, offeredYear: decision.season,
      salary: a.salary, years: a.years } };
  const receiptId = pending ? key('offer', decision.proposalId) : decision.resolutionTransactionId;
  const transactions = world.contractEconomy.engine.transactions.map(t => t.id !== receiptId ? t : { ...t,
    ...(pending ? { renewalDecision: fixedDecision(decision) } : { renewalResolution: resolutionEvidence(decision) }) });
  return { ...world, contractEconomy: { ...world.contractEconomy,
    engine: { ...world.contractEconomy.engine, transactions }, decisions: previous
    ? decisions.map(d => d === previous ? decision : d) : [...decisions, decision] },
  mailbox: [...world.mailbox.filter(m => m.id !== id), mail] };
}

const native = (world, transaction, baseRevision = world.contractEconomy.revision) =>
  reduceEconomyCommand(world, { saveId: world.saveId, epoch: world.contractEconomy.epoch, baseRevision, transaction });
const resultWorld = result => { if (!result.ok) fail(result.error); return result.world; };

export function validateRenewalDecisions(world) {
  const e = world.contractEconomy;
  if (e?.mode !== 'annual') return true;
  const seen = new Set();
  for (const d of e.decisions) {
    if (d?.kind !== kind) fail('未対応の契約回答予定です。');
    inspectRequest(d.request);
    const request = d.request, a = request.action;
    const hold = [...e.engine.spending.reservations, ...e.engine.spending.resolvedReservations]
      .find(r => r.kind === 'renewal' && r.proposal.id === d.proposalId);
    const p = hold?.proposal;
    if (![1, 2].includes(d.version) || a.type !== 'offer' || request.saveId !== world.saveId || request.epoch !== e.epoch
      || request.baseRevision >= e.revision || d.proposalId !== decisionId(request) || seen.has(d.proposalId)
      || !states.includes(d.status) || !p || d.playerId !== a.playerId || d.playerId !== p.contract.playerId
      || d.teamId !== p.teamId || d.season !== p.contract.signedSeason
      || a.salary !== p.contract.annualSalaryManYen || a.years !== p.contract.termYears
      || p.contract.guaranteed !== true || !Number.isInteger(d.score) || d.score < 0 || d.score > 100
      || (d.version === 1 ? d.willAccept !== (d.score >= ACCEPT_THRESHOLD)
        : !d.evaluation?.valid || typeof d.evaluation.accepted !== 'boolean'
          || d.willAccept !== d.evaluation.accepted || d.score !== d.evaluation.score
          || !Number.isFinite(d.demand?.demandSalary) || d.demand.demandSalary <= 0
          || !Number.isFinite(d.demand?.minAcceptSalary) || d.demand.minAcceptSalary <= 0)
      || d.offeredClock?.season !== d.season || !['season', 'offseason'].includes(d.offeredClock.phase)
      || d.offeredClock.phase !== p.contract.agreementPhase
      || !Number.isSafeInteger(d.offeredClock.offseasonTurn) || d.offeredClock.offseasonTurn < 0
      || stable(replyTiming(d.offeredClock, d.score, d.version)) !== stable({ dueDate: d.dueDate, dueTurn: d.dueTurn, deadlineTurn: d.deadlineTurn })
      || (d.status === 'pending' ? hold.resolution !== undefined : hold.resolution !== terminalResolution[d.status]))
      fail('更改の回答予定と正式留保・回答履歴が一致しません。');
    const original = e.engine.transactions.find(t => t.id === key('offer', d.proposalId));
    const command = original && JSON.parse(original.signature);
    if (!command || command.proposal?.id !== d.proposalId || command.contractId !== d.contractId
      || stable(original.renewalDecision) !== stable(fixedDecision(d))
      || !['offer-renewal', 'replace-renewal'].includes(command.type)) fail('更改の提示記録が見つかりません。');
    if (d.status !== 'pending') {
      const receipt = e.engine.transactions.find(t => t.id === d.resolutionTransactionId);
      const resolved = receipt && JSON.parse(receipt.signature);
      const type = { accepted: 'accept-renewal', rejected: 'reject-renewal', cancelled: 'cancel-renewal',
        replaced: 'replace-renewal', invalidated: 'cancel-renewal' }[d.status];
      if (!resolved || resolved.type !== type || resolved.proposalId !== d.proposalId
        || stable(receipt.renewalResolution) !== stable(resolutionEvidence(d))
        || !d.resolvedClock || ((d.status === 'accepted' || d.status === 'rejected') && !due(d, d.resolvedClock)))
        fail('更改の回答と取引記録が一致しません。');
    }
    seen.add(d.proposalId);
  }
  for (const t of e.engine.transactions) {
    let id; try { id = JSON.parse(t.id); } catch { continue; }
    if (Array.isArray(id) && id[0] === kind && id[1] === 'offer' && !seen.has(id[2]))
      fail('提示済みの更改回答予定が失われています。');
  }
  return true;
}

export function preservesRenewalDecisions(before, after) {
  return before.decisions.filter(d => d?.kind === kind).every(d => {
    const next = after.decisions.find(n => n?.kind === kind && n.proposalId === d.proposalId);
    return next && stable(fixedDecision(d)) === stable(fixedDecision(next))
      && (d.status === 'pending' ? states.includes(next.status) : stable(d) === stable(next));
  });
}

export function reduceRenewalRequest(world, request) {
  try {
    if (contractEconomyMode(world) !== 'annual') fail('新契約制度の更改が必要です。');
    inspectRequest(request); validateRenewalDecisions(world);
    const e = world.contractEconomy, action = request.action;
    if (request.saveId !== world.saveId || request.epoch !== e.epoch || request.baseRevision > e.revision)
      fail('更改のセーブ・世代が変更されています。');
    const own = e.decisions.filter(d => d.kind === kind && d.teamId === world.myId);
    if (action.type === 'offer') {
      const proposalId = decisionId(request);
      const replay = own.find(d => d.proposalId === proposalId);
      if (replay) {
        if (stable(replay.request) !== stable(request)) fail('同じ更改IDの条件が変わっています。');
        return { ok: true, world, replayed: true };
      }
    } else if (action.type === 'cancel') {
      const replay = own.find(d => d.proposalId === action.proposalId && stable(d.resolutionRequest) === stable(request));
      if (replay) return { ok: true, world, replayed: true };
    } else if (!dueRenewalDecisions(world).length) return { ok: true, world, replayed: true };
    if (request.baseRevision !== e.revision) fail('更改のrevisionが古くなっています。再確認してください。');
    let next;
    if (action.type === 'offer') {
      const clock = e.clock;
      if (!['season', 'offseason'].includes(clock.phase) || (clock.phase === 'offseason' && clock.offseasonTurn > 30))
        fail('新しい更改を提示できる期間ではありません。');
      const team = world.teams.find(t => t.id === world.myId), player = team && ownedPlayers(team).find(p => p.id === action.playerId);
      const existing = own.find(d => d.playerId === action.playerId && d.status === 'pending');
      if (!player || (existing?.proposalId !== action.replaceProposalId)) fail('所属・差し替える提示を確認してください。');
      if (existing && due(existing, clock)) fail('回答期日に到達しています。回答を確定してから操作してください。');
      const date = clock.phase === 'offseason' ? `${world.year}-11-30` : clock.date;
      const employment = contractEmploymentAt(e.engine.spending.ledger, date)
        .find(r => r.teamId === world.myId && r.contract.playerId === player.id);
      if (!employment) fail('現在の契約が見つかりません。');
      const demand = calcPlayerDemand(player, { year: world.year, team, teams: world.teams,
        awards: world.seasonHistory?.awards?.find(a => a.year === world.year),
        championship: world.seasonHistory?.championships?.find(c => c.year === world.year) });
      const evaluation = evaluateRenewalOffer(player, { salary: action.salary, years: action.years }, team, world.teams, demand);
      const score = evaluation.score;
      if (!Number.isFinite(player.salary) || player.salary <= 0 || !evaluation.valid
        || !Number.isInteger(score) || score < 0 || score > 100
        || !Number.isFinite(demand.demandSalary) || demand.demandSalary <= 0
        || !Number.isFinite(demand.minAcceptSalary) || demand.minAcceptSalary <= 0)
        fail('契約評価に必要な選手情報・提示条件を確認してください。');
      const proposalId = decisionId(request), contractId = employmentContractId(employment.contract);
      const proposal = { id: proposalId, type: 'sign', teamId: world.myId, effectiveDate: `${world.year + 1}-02-01`,
        contract: createSeasonContract({ contractId: key('contract', proposalId), playerId: player.id, signedSeason: world.year,
          agreementPhase: clock.phase, purpose: 'renewal', termYears: action.years, annualSalaryManYen: action.salary,
          guaranteed: true, registrationType: isIkuseiPlayer(player) ? 'development' : 'controlled' }) };
      next = resultWorld(native(world, { id: key('offer', proposalId), type: existing ? 'replace-renewal' : 'offer-renewal',
        proposal, contractId, ...(existing ? { proposalId: existing.proposalId } : {}) }));
      if (existing) next = withDecision(next, { ...existing, status: 'replaced', resolvedClock: { ...clock },
        resolutionTransactionId: key('offer', proposalId) });
      next = withDecision(next, { version: 2, kind, proposalId, playerId: player.id, teamId: world.myId, season: world.year,
        contractId, request: structuredClone(request), score, willAccept: evaluation.accepted,
        demand, evaluation,
        offeredClock: { ...clock }, ...replyTiming(clock, score), status: 'pending' });
    } else if (action.type === 'cancel') {
      const d = own.find(d => d.proposalId === action.proposalId && d.status === 'pending');
      if (!d) fail('取り消す更改の回答予定が見つかりません。');
      if (due(d, e.clock)) fail('回答期日に到達しています。回答を確定してから操作してください。');
      const transaction = { id: key('cancel', d.proposalId, request.baseRevision), type: 'cancel-renewal', proposalId: d.proposalId };
      next = withDecision(resultWorld(native(world, transaction)), { ...d, status: 'cancelled', resolvedClock: { ...e.clock },
        resolutionRequest: structuredClone(request), resolutionTransactionId: transaction.id });
    } else {
      next = world;
      for (const d of dueRenewalDecisions(world)) {
        const expired = d.season !== world.year || (e.clock.phase === 'offseason' && e.clock.offseasonTurn > d.deadlineTurn);
        const transaction = { id: key('reply', d.proposalId), type: expired ? 'cancel-renewal' : d.willAccept ? 'accept-renewal' : 'reject-renewal',
          proposalId: d.proposalId, ...(!expired && d.willAccept ? { contractId: d.contractId } : {}) };
        let result = native(next, transaction), status = expired ? 'invalidated' : d.willAccept ? 'accepted' : 'rejected';
        let failureReason = expired ? '回答期限を過ぎています。' : undefined;
        if (!result.ok) {
          if (!d.willAccept || expired) fail(result.error);
          failureReason = result.error; status = 'invalidated';
          result = native(next, { id: transaction.id, type: 'cancel-renewal', proposalId: d.proposalId });
        }
        next = withDecision(resultWorld(result), { ...d, status, resolvedClock: { ...e.clock },
          resolutionTransactionId: transaction.id, ...(failureReason ? { failureReason } : {}) });
      }
    }
    validateRenewalDecisions(next); toAnnualState(next);
    return { ok: true, world: next, replayed: false };
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}
