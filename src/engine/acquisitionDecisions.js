import { calcPlayerDemand, evaluateRenewalOffer } from './contract';
import { contractEconomyMode, reduceEconomyCommand, toAnnualState } from './contractEconomy';
import { createSeasonContract } from './seasonContract';
import { isIkuseiPlayer } from './rosterCapacity';
import { validateMarketPlayer } from './annualAcquisitions';
import { replyTiming, isDecisionDue } from './decisionClock';

const kind = 'human-acquisition';
const fail = message => { throw new Error(message); };
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const key = (...parts) => JSON.stringify([kind, ...parts]);
const decisionId = r => key(r.saveId, r.epoch, r.baseRevision, r.action.playerId);
const fixed = ({ status, resolvedClock, resolutionRequest, resolutionTransactionId, failureReason, ...d }) => d;
const evidence = d => ({ proposalId: d.proposalId, status: d.status, resolvedClock: d.resolvedClock,
  ...(d.resolutionRequest ? { resolutionRequest: d.resolutionRequest } : {}),
  ...(d.failureReason ? { failureReason: d.failureReason } : {}) });
const resolutions = { accepted: 'accepted', rejected: 'rejected', cancelled: 'cancelled', replaced: 'cancelled', expired: 'cancelled', invalidated: 'cancelled' };
const expired = (d, clock) => d.season !== clock.season || (d.offeredClock.phase === 'offseason'
  ? clock.phase !== 'offseason' || clock.offseasonTurn > d.deadlineTurn
  : clock.date > `${d.season}-07-31` || clock.phase === 'offseason');
const due = (d, clock) => expired(d, clock) || isDecisionDue(d, clock);

export function acquisitionRequest(world, action) {
  return { saveId: world.saveId, epoch: world.contractEconomy?.epoch,
    baseRevision: world.contractEconomy?.revision, action: structuredClone(action) };
}
function inspectRequest(r) {
  const fields = { offer: ['playerId', 'salary', 'years', 'replaceProposalId'], cancel: ['proposalId'], 'resolve-due': [] }, a = r?.action;
  if (!r || Object.keys(r).some(k => !['saveId', 'epoch', 'baseRevision', 'action'].includes(k))
    || !Number.isSafeInteger(r.baseRevision) || r.baseRevision < 0 || !a || !Object.hasOwn(fields, a.type)
    || Object.keys(a).some(k => k !== 'type' && !fields[a.type].includes(k))) fail('市場交渉の操作・入力項目を確認してください。');
  if (a.type === 'offer' && (!Number.isSafeInteger(a.salary) || a.salary <= 0
    || !Number.isInteger(a.years) || a.years < 1 || a.years > 3)) fail('年俸は整数の万円、契約年数は1〜3年で提示してください。');
}
export function dueAcquisitionDecisions(world) {
  const e = world.contractEconomy;
  return (e?.decisions ?? []).filter(d => d.kind === kind && d.teamId === world.myId
    && d.status === 'pending' && due(d, e.clock));
}

function withDecision(world, d) {
  const e = world.contractEconomy, pending = d.status === 'pending';
  const labels = { pending: '回答待ち', accepted: '受諾', rejected: '辞退', cancelled: '取消', replaced: '差替済み', expired: '期限切れ', invalidated: '条件変更により失効' };
  const id = key('mail', d.proposalId), a = d.request.action;
  const mail = { id, type: 'economy_acquisition_reply', read: false, resolved: !pending,
    economyProposalId: d.proposalId, title: `【市場交渉】${d.playerName}`, from: `${d.playerName} / 代理人`,
    dateLabel: `${d.season}年`, body: `${labels[d.status]}：年俸${a.salary}万円・${a.years}年。`
      + (d.status === 'accepted' && d.offeredClock.phase === 'offseason' ? '翌春の加入待ちです。必要な補償は別途精算します。' : '')
      + (d.failureReason ?? '') };
  const receiptId = pending ? key('offer', d.proposalId) : d.resolutionTransactionId;
  return { ...world, mailbox: [...world.mailbox.filter(m => m.id !== id), mail], contractEconomy: { ...e,
    decisions: e.decisions.some(n => n.kind === kind && n.proposalId === d.proposalId)
      ? e.decisions.map(n => n.kind === kind && n.proposalId === d.proposalId ? d : n) : [...e.decisions, d],
    engine: { ...e.engine, transactions: e.engine.transactions.map(t => t.id !== receiptId ? t : { ...t,
      ...(pending ? { acquisitionDecision: fixed(d) } : { acquisitionResolution: evidence(d) }) }) } } };
}
const native = (world, transaction) => reduceEconomyCommand(world, { saveId: world.saveId,
  epoch: world.contractEconomy.epoch, baseRevision: world.contractEconomy.revision, transaction });
const resultWorld = r => { if (!r.ok) fail(r.error); return r.world; };

export function validateAcquisitionDecisions(world) {
  const e = world.contractEconomy;
  if (e?.mode !== 'annual') return true;
  const seen = new Set();
  for (const d of e.decisions) {
    if (d?.kind === 'human-renewal') continue;
    if (d?.kind !== kind) fail('未対応の市場回答予定です。');
    inspectRequest(d.request);
    const r = d.request, a = r.action;
    const hold = [...e.engine.spending.reservations, ...e.engine.spending.resolvedReservations]
      .find(h => h.kind === 'offer' && h.proposal.id === d.proposalId), p = hold?.proposal;
    if (d.version !== 1 || a.type !== 'offer' || r.saveId !== world.saveId || r.epoch !== e.epoch
      || r.baseRevision >= e.revision || d.proposalId !== decisionId(r) || seen.has(d.proposalId)
      || !p || !p.marketEntry || d.playerId !== a.playerId || d.playerId !== p.contract.playerId
      || d.teamId !== p.teamId || d.season !== p.contract.signedSeason || d.playerName === undefined
      || a.salary !== p.contract.annualSalaryManYen || a.years !== p.contract.termYears || p.contract.guaranteed !== true
      || !d.evaluation?.valid || typeof d.evaluation.accepted !== 'boolean' || d.willAccept !== d.evaluation.accepted
      || !Number.isInteger(d.score) || d.score < 0 || d.score > 100 || d.score !== d.evaluation.score
      || !Number.isFinite(d.demand?.demandSalary) || d.demand.demandSalary <= 0
      || !Number.isFinite(d.demand?.minAcceptSalary) || d.demand.minAcceptSalary <= 0
      || d.offeredClock?.season !== d.season || d.offeredClock.date !== p.offeredDate
      || d.offeredClock.phase !== p.contract.agreementPhase
      || !Number.isSafeInteger(d.offeredClock.offseasonTurn) || d.offeredClock.offseasonTurn < 0
      || stable(replyTiming(d.offeredClock, d.score)) !== stable({ dueDate: d.dueDate, dueTurn: d.dueTurn, deadlineTurn: d.deadlineTurn })
      || (d.status === 'pending' ? hold.resolution !== undefined
        : !Object.hasOwn(resolutions, d.status) || hold.resolution !== resolutions[d.status])) fail('市場の回答予定と留保・契約条件が一致しません。');
    const original = e.engine.transactions.find(t => t.id === key('offer', d.proposalId));
    const command = original && JSON.parse(original.signature);
    if (command?.type !== 'offer-fa' || command.proposal?.id !== d.proposalId
      || stable(original.acquisitionDecision) !== stable(fixed(d))) fail('市場の正式提示記録が見つかりません。');
    if (d.status !== 'pending') {
      const receipt = e.engine.transactions.find(t => t.id === d.resolutionTransactionId);
      const resolved = receipt && JSON.parse(receipt.signature);
      const type = d.status === 'accepted' ? 'accept-fa' : d.status === 'rejected' ? 'reject-fa' : 'cancel-fa';
      if (!d.resolvedClock || resolved?.type !== type || resolved.proposalId !== d.proposalId
        || stable(receipt.acquisitionResolution) !== stable(evidence(d))
        || (['accepted', 'rejected'].includes(d.status) && (!due(d, d.resolvedClock) || expired(d, d.resolvedClock)))
        || (d.status === 'expired' && !expired(d, d.resolvedClock))) fail('市場回答と取引履歴が一致しません。');
    }
    seen.add(d.proposalId);
  }
  for (const t of e.engine.transactions) {
    let id; try { id = JSON.parse(t.id); } catch { continue; }
    if (Array.isArray(id) && id[0] === kind && id[1] === 'offer' && !seen.has(id[2])) fail('市場の回答予定が失われています。');
  }
  return true;
}
export function preservesAcquisitionDecisions(before, after) {
  return before.decisions.filter(d => d?.kind === kind).every(d => {
    const n = after.decisions.find(n => n.kind === kind && n.proposalId === d.proposalId);
    return n && stable(fixed(d)) === stable(fixed(n)) && (d.status === 'pending' || stable(d) === stable(n));
  });
}

export function reduceAcquisitionRequest(world, request) {
  try {
    if (contractEconomyMode(world) !== 'annual') fail('新契約制度の市場交渉が必要です。');
    inspectRequest(request); validateAcquisitionDecisions(world); toAnnualState(world);
    const e = world.contractEconomy, a = request.action;
    if (request.saveId !== world.saveId || request.epoch !== e.epoch || request.baseRevision > e.revision)
      fail('市場交渉のセーブ・世代が変更されています。');
    const own = e.decisions.filter(d => d.kind === kind && d.teamId === world.myId);
    if (a.type === 'offer') {
      const replay = own.find(d => d.proposalId === decisionId(request));
      if (replay) {
        if (stable(replay.request) !== stable(request)) fail('同じ市場提示IDの条件が変わっています。');
        return { ok: true, world, replayed: true };
      }
    } else if (a.type === 'cancel') {
      if (own.some(d => d.proposalId === a.proposalId && stable(d.resolutionRequest) === stable(request)))
        return { ok: true, world, replayed: true };
    } else if (!dueAcquisitionDecisions(world).length) return { ok: true, world, replayed: true };
    if (request.baseRevision !== e.revision) fail('市場交渉のrevisionが古くなっています。再確認してください。');
    const clock = e.clock;
    let next = world;
    if (a.type === 'offer') {
      if (!['preseason', 'season', 'offseason'].includes(clock.phase) || (clock.phase === 'offseason' && clock.offseasonTurn > 30))
        fail('新しい市場交渉を提示できる期間ではありません。');
      const player = world.faPool.find(p => p.id === a.playerId), team = world.teams.find(t => t.id === world.myId);
      const existing = own.find(d => d.playerId === a.playerId && d.status === 'pending');
      if (!player || !team || existing?.proposalId !== a.replaceProposalId) fail('市場選手・差替対象を確認してください。');
      if (existing && due(existing, clock)) fail('回答期日に到達しています。先に回答を確定してください。');
      const entry = validateMarketPlayer(player);
      if (['A', 'B'].includes(entry.compensationRank) && !entry.compensationBasis) fail('FA補償の根拠が未記録のため提示できません。');
      // Historical performance belongs to the source club, never the bidder.
      const assessed = { ...player, ...(player.marketLastStats ? { stats: player.marketLastStats } : {}) };
      const demand = calcPlayerDemand(assessed, { year: world.year, teams: world.teams,
        team: world.teams.find(t => t.id === entry.originTeamId),
        awards: world.seasonHistory?.awards?.find(x => x.year === world.year),
        championship: world.seasonHistory?.championships?.find(x => x.year === world.year) });
      const evaluation = evaluateRenewalOffer(assessed, { salary: a.salary, years: a.years }, team, world.teams, demand);
      const score = evaluation.score;
      if (!Number.isFinite(player.salary) || player.salary <= 0 || !evaluation.valid || !Number.isInteger(score) || score < 0 || score > 100
        || !(demand.demandSalary > 0) || !Number.isFinite(demand.demandSalary)
        || !(demand.minAcceptSalary > 0) || !Number.isFinite(demand.minAcceptSalary)) fail('選手の年俸評価に必要な情報を確認してください。');
      const proposalId = decisionId(request);
      const proposal = { id: proposalId, type: 'sign', teamId: world.myId, offeredDate: clock.date, marketEntry: entry,
        effectiveDate: clock.phase === 'offseason' ? `${world.year + 1}-02-01` : clock.date,
        contract: createSeasonContract({ contractId: key('contract', proposalId), playerId: player.id,
          signedSeason: world.year, agreementPhase: clock.phase, purpose: 'acquisition', termYears: a.years,
          annualSalaryManYen: a.salary, guaranteed: true, registrationType: isIkuseiPlayer(player) ? 'development' : 'controlled' }) };
      if (existing) {
        const id = key('replace', proposalId);
        next = withDecision(resultWorld(native(next, { id, type: 'cancel-fa', proposalId: existing.proposalId })),
          { ...existing, status: 'replaced', resolvedClock: { ...clock }, resolutionTransactionId: id });
      }
      next = withDecision(resultWorld(native(next, { id: key('offer', proposalId), type: 'offer-fa', proposal })),
        { version: 1, kind, proposalId, playerId: player.id, playerName: player.name ?? '選手', teamId: world.myId,
          season: world.year, request: structuredClone(request), demand, evaluation, score, willAccept: evaluation.accepted,
          offeredClock: { ...clock }, ...replyTiming(clock, score), status: 'pending' });
    } else if (a.type === 'cancel') {
      const d = own.find(d => d.proposalId === a.proposalId && d.status === 'pending');
      if (!d || due(d, clock)) fail('回答期日に到達した提示・確定済み提示は取り消せません。');
      const id = key('cancel', d.proposalId, request.baseRevision);
      next = withDecision(resultWorld(native(next, { id, type: 'cancel-fa', proposalId: d.proposalId })),
        { ...d, status: 'cancelled', resolvedClock: { ...clock }, resolutionRequest: structuredClone(request), resolutionTransactionId: id });
    } else {
      for (const d of dueAcquisitionDecisions(world)) {
        const id = key('reply', d.proposalId), isExpired = expired(d, clock);
        let status = isExpired ? 'expired' : d.willAccept ? 'accepted' : 'rejected';
        let failureReason = isExpired ? '登録期限または回答期限を過ぎています。' : undefined;
        let result = native(next, { id, type: isExpired ? 'cancel-fa' : d.willAccept ? 'accept-fa' : 'reject-fa', proposalId: d.proposalId });
        if (!result.ok) {
          if (!d.willAccept || isExpired) fail(result.error);
          status = 'invalidated'; failureReason = result.error;
          result = native(next, { id, type: 'cancel-fa', proposalId: d.proposalId });
        }
        next = withDecision(resultWorld(result), { ...d, status, resolvedClock: { ...clock }, resolutionTransactionId: id,
          ...(failureReason ? { failureReason } : {}) });
      }
    }
    // One human action is one published revision, including both replacement
    // transactions or a batch of replies. Intermediate worlds are never saved.
    next = { ...next, contractEconomy: { ...next.contractEconomy, revision: e.revision + 1 } };
    validateAcquisitionDecisions(next); toAnnualState(next);
    return { ok: true, world: next, replayed: false };
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}
