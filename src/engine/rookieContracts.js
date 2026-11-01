import { reduceEconomyCommand, toAnnualState } from './contractEconomy';
import { createSeasonContract } from './seasonContract';
import { evaluateRosterCapacity, isIkuseiPlayer } from './rosterCapacity';
import { validContractTerms } from './renewalRules';
import { draftContractSalary } from './draftSalary';

const fail = message => { throw new Error(message); };
const key = (...parts) => JSON.stringify(['human-rookie', ...parts]);
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const decode = value => { try { return JSON.parse(value); } catch { return null; } };
const acceptedPlayers = capacity => capacity.ok ? [...capacity.acceptedPicks, ...capacity.acceptedDevelopmentPicks] : [];
function recordedSalary(team, context, player, salary = player.salary) {
  // Joining deliberately ignores stale salary metadata. Human winter funding
  // instead needs one unambiguous recorded salary among assignment-valid copies.
  for (const p of context.draftPool.filter(p => p.id === player.id)) {
    if (!acceptedPlayers(evaluateRosterCapacity(team, { ...context, draftPool: [p] })).length) continue;
    if (p.salary !== player.salary) fail('同じ新人の指名時年俸が一致しません。');
  }
  if (!Number.isSafeInteger(player.salary) || !validContractTerms(player, salary, 1))
    fail('指名時の年俸が未記録または不正です。');
}
function proposalFor(id, teamId, player, season) {
  return { id: key('proposal', id), type: 'sign', teamId,
    effectiveDate: `${String(season + 1).padStart(4, '0')}-02-01`, contract: createSeasonContract({
      contractId: key('contract', id), playerId: player.id, signedSeason: season,
      agreementPhase: 'offseason', purpose: 'acquisition', termYears: 1,
      annualSalaryManYen: player.salary, guaranteed: true,
      registrationType: isIkuseiPlayer(player) ? 'development' : 'controlled' }) };
}

// No parallel decision store: native receipts and the draft plan are the evidence.
export function validateRookieContracts(world) {
  const e = world.contractEconomy;
  if (e?.mode !== 'annual') return true;
  const holds = [...e.engine.spending.reservations, ...e.engine.spending.resolvedReservations];
  const seen = new Set(), declined = new Set();
  for (const receipt of e.engine.transactions) {
    const parts = decode(receipt.id);
    if (!Array.isArray(parts) || parts[0] !== 'human-rookie') continue;
    const [, saveId, epoch, revision, season, teamId, type, playerId] = parts, c = decode(receipt.signature);
    if (parts.length !== 8 || saveId !== world.saveId || epoch !== e.epoch
      || !Number.isInteger(season) || season < 1 || season > world.year
      || !Number.isSafeInteger(revision) || revision < 0 || revision >= e.revision || !c || c.id !== receipt.id
      || stable(c) !== receipt.signature || !['reserve', 'decline'].includes(type)
      || c.type !== `${type}-rookie`) fail('新人契約の操作履歴が一致しません。');
    if (type === 'reserve') {
      const hold = holds.find(h => h.kind === 'rookie' && h.proposal.id === key('proposal', receipt.id));
      if (!hold || stable(c.proposal) !== stable(hold.proposal) || c.proposal.teamId !== teamId
        || c.proposal.contract.playerId !== playerId) fail('新人の契約留保と確定履歴が一致しません。');
      let source = { id: playerId, salary: c.proposal.contract.annualSalaryManYen,
        isIkusei: c.proposal.contract.registrationType === 'development' };
      if (!Number.isSafeInteger(source.salary) || !validContractTerms(source, source.salary, 1)) fail('新人契約の記録年俸を確認してください。');
      if (!hold.resolution) {
        const team = world.teams.find(t => t.id === teamId), context = {
          teams: world.teams, draftPool: world.offseasonPlan?.draftResult?.pool ?? [],
          drafted: world.offseasonPlan?.draftResult?.drafted ?? {},
          confirmedPicks: world.offseasonPlan?.draftViews?.lottery?.confirmedPicks ?? {} };
        source = acceptedPlayers(evaluateRosterCapacity(team, context)).find(p => p.id === playerId);
        if (!source || world.offseasonPlan?.year !== season) fail('新人の契約留保に対応する指名結果がありません。');
        recordedSalary(team, context, source);
      }
      if (stable(c.proposal) !== stable(proposalFor(receipt.id, teamId, source, season))) fail('新人の固定年俸・単年条件と確定履歴が一致しません。');
      seen.add(hold.proposal.id);
    } else {
      if (c.teamId !== teamId || c.playerId !== playerId) fail('新人辞退の選手・球団が一致しません。');
      if (world.offseasonPlan?.draftResult?.pool?.some(p => p.id === playerId)
        && world.offseasonPlan.draftResult.drafted?.[playerId] !== 'refused') fail('辞退済みの新人指名が復活しています。');
      declined.add(JSON.stringify([teamId, playerId]));
    }
  }
  for (const h of holds) {
    const parts = decode(h.proposal.id);
    if (parts?.[0] !== 'human-rookie' || parts[1] !== 'proposal') continue;
    if (!seen.has(h.proposal.id) || (h.resolution === 'cancelled'
      && !declined.has(JSON.stringify([h.proposal.teamId, h.proposal.contract.playerId]))))
      fail('新人の留保・辞退の確定履歴が失われています。');
  }
  return true;
}

export function rookieRequest(world, action) {
  return { saveId: world.saveId, epoch: world.contractEconomy?.epoch, season: world.year,
    baseRevision: world.contractEconomy?.revision, action: structuredClone(action) };
}

export function reduceRookieRequest(world, request) {
  try {
    const a = request?.action, e = world.contractEconomy;
    if (!request || Object.keys(request).some(k => !['saveId', 'epoch', 'baseRevision', 'season', 'action'].includes(k))
      || !Number.isInteger(request.season) || request.season < 1 || request.season > world.year
      || !a || !['reserve', 'decline'].includes(a.type) || a.playerId == null
      || Object.keys(a).some(k => !['type', 'playerId'].includes(k))
      || !Number.isSafeInteger(request.baseRevision) || request.baseRevision < 0)
      fail('新人契約の操作・入力項目を確認してください。');
    const state = toAnnualState(world); validateRookieContracts(world);
    if (request.saveId !== world.saveId || request.epoch !== e.epoch || request.baseRevision > e.revision)
      fail('新人契約のセーブ・世代が変更されています。');
    const id = key(request.saveId, request.epoch, request.baseRevision, request.season, world.myId, a.type, a.playerId);
    const envelope = transaction => ({ saveId: request.saveId, epoch: request.epoch, baseRevision: request.baseRevision, transaction });
    // The native receipt is the immutable command, including its original terms.
    // Replaying after decline must not reconstruct the reservation from a new draft result.
    const receipt = state.transactions.find(t => t.id === id);
    if (receipt) return reduceEconomyCommand(world, envelope(JSON.parse(receipt.signature)));
    if (request.baseRevision !== e.revision) fail('新人契約のrevisionが古くなっています。');
    if (request.season !== world.year || state.phase !== 'offseason' || world.offseasonPlan?.year !== world.year
      || !world.offseasonPlan.draftResult || world.offseasonPlan.draftApplied)
      fail('冬の指名結果を確認してください。春の加入は年度更新で行います。');
    const team = world.teams.find(t => t.id === world.myId);
    const capacity = evaluateRosterCapacity(team, { ...state.draftContext, teams: world.teams });
    const player = acceptedPlayers(capacity).find(p => p.id === a.playerId);
    if (!player) fail('自球団の受諾済み未加入の新人を選んでください。');
    if (a.type === 'decline') return reduceEconomyCommand(world, envelope({ id, type: 'decline-rookie', teamId: world.myId, playerId: player.id }));
    const context = { ...state.draftContext, teams: world.teams }, salary = draftContractSalary(player);
    // Old unfunded picks may predate the generation floor. Quote exactly the
    // amount shown in confirmation, checking raw duplicates before correction.
    // validateRookieContracts above still checks all existing evidence strictly.
    recordedSalary(team, context, player, salary);
    const proposal = proposalFor(id, world.myId, { ...player, salary }, world.year);
    const candidate = salary === player.salary ? world : { ...world, offseasonPlan: { ...world.offseasonPlan,
      draftResult: { ...world.offseasonPlan.draftResult, pool: context.draftPool.map(p =>
        p.id === player.id && acceptedPlayers(evaluateRosterCapacity(team, { ...context, draftPool: [p] })).length
          ? { ...p, salary } : p) } } };
    const result = reduceEconomyCommand(candidate, envelope({ id, type: 'reserve-rookie', proposal }));
    return result.ok ? result : { ...result, world };
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}
