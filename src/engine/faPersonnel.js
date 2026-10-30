import { contractEmploymentAt, applyContractLedgerAction } from './contractLedger';
import { contractSeasonsRemaining } from './seasonContract';
import { settleFaPersonnelCompensation } from './annualSpending';
import { faProtectionView } from './faProtection';
import { requiresFaCompensation } from './faCompensation';
import { ownedPlayers, isIkuseiPlayer } from './renewalRules';
import { removeDepartingPlayers } from './tradeTransaction';
import { parseContractDate } from './contractCalendar';

// Opt-in common transaction foundation; no live roster/save adapter.
const fail = () => { throw new Error('人的補償の指名・優先順位・契約移管・入団履歴を確認してください。'); };
const validId = x => (typeof x === 'string' && x.trim().length > 0) || (Number.isSafeInteger(x) && x >= 0);
const stable = x => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const copy = x => JSON.parse(JSON.stringify(x));
const keys = (x, expected) => x && Object.keys(x).length === expected.length && Object.keys(x).every(k => expected.includes(k));
const ordered = xs => [...xs].sort((a, b) => stable(a) < stable(b) ? -1 : stable(a) > stable(b) ? 1 : 0);
const originalMove = ({ joinedDate: _joinedDate, ...move }) => move;
const proposalFor = (s, id) => {
  const r = s.spending.resolvedReservations.find(r => r.kind === 'offer' && r.resolution === 'accepted' && r.proposal.id === id);
  if (!r || !requiresFaCompensation(r.proposal) || r.proposal.contract.agreementPhase !== 'offseason') fail();
  return r;
};

// A departed, already signed player is not a new unowned draft pick. Retained
// older pools must not reactivate that assignment while the player awaits join.
export function faPersonnelCapacityContext(state) {
  const moved = new Set((state.faPersonnelMoves ?? []).map(m => m.player.id));
  return { ...state.draftContext, draftPool: state.draftContext.draftPool.filter(p => !moved.has(p?.id)) };
}

export function normalizeFaPersonnelSelections(input) {
  if (!Array.isArray(input) || input.length === 0 || input.some(c => !keys(c, ['proposalId', 'teamId', 'playerId'])
    || ![c.proposalId, c.teamId, c.playerId].every(validId))
    || new Set(input.map(c => String(c.proposalId))).size !== input.length) fail();
  return ordered(input.map(c => ({ proposalId: c.proposalId, teamId: c.teamId, playerId: c.playerId })));
}

function priorityFor(state, season, ids) {
  if (!Array.isArray(state.faCompensationStandings)) fail();
  const matches = state.faCompensationStandings.filter(r => r?.season === season);
  if (matches.length !== 1 || !keys(matches[0], ['season', 'teams']) || !Array.isArray(matches[0].teams)) fail();
  const rows = matches[0].teams;
  if (rows.some(r => !keys(r, ['teamId', 'league', 'wins', 'losses']) || !validId(r.teamId)
    || !['セ', 'パ'].includes(r.league) || ![r.wins, r.losses].every(n => Number.isSafeInteger(n) && n >= 0)
    || BigInt(r.wins) + BigInt(r.losses) === 0n)
    || new Set(rows.map(r => String(r.teamId))).size !== rows.length) fail();
  if (ids.some(id => !rows.some(r => r.teamId === id))) fail();
  return { season, teams: ordered(rows.filter(r => ids.includes(r.teamId)).map(copy)) };
}

function decide(selections, fromTeamId, priority) {
  const groups = new Map();
  for (const c of selections) groups.set(c.playerId, [...(groups.get(c.playerId) ?? []), c]);
  const winners = [];
  for (const choices of groups.values()) {
    if (choices.length === 1) { winners.push(choices[0].proposalId); continue; }
    if (!priority || new Set(choices.map(c => c.teamId)).size !== choices.length) fail();
    const league = priority.teams.find(r => r.teamId === fromTeamId)?.league;
    const rows = choices.map(c => ({ c, row: priority.teams.find(r => r.teamId === c.teamId) }));
    if (!league || rows.some(r => !r.row)) fail();
    const sameLeague = rows.filter(r => r.row.league === league), eligible = sameLeague.length ? sameLeague : rows;
    const compare = (a, b) => {
      const d = BigInt(a.row.wins) * (BigInt(b.row.wins) + BigInt(b.row.losses))
        - BigInt(b.row.wins) * (BigInt(a.row.wins) + BigInt(a.row.losses));
      return d < 0n ? -1 : d > 0n ? 1 : 0;
    };
    eligible.sort(compare);
    if (eligible.length > 1 && compare(eligible[0], eligible[1]) === 0) fail();
    winners.push(eligible[0].c.proposalId);
  }
  return { winnerProposalIds: ordered(winners), lostProposalIds: ordered(selections.filter(c => !winners.includes(c.proposalId)).map(c => c.proposalId)) };
}

function groupFor(state, selections) {
  const p = proposalFor(state, selections[0].proposalId).proposal;
  for (const c of selections) {
    const other = proposalFor(state, c.proposalId).proposal;
    if (other.teamId !== p.teamId || other.contract.startSeason !== p.contract.startSeason
      || c.teamId !== other.marketEntry.originTeamId || !state.teams.some(t => t.id === c.teamId)) fail();
  }
  return p;
}

export function createFaPersonnelSettlement(state, command, signature) {
  const selections = normalizeFaPersonnelSelections(command.selections), p = groupFor(state, selections);
  if (!((state.phase === 'offseason' && state.season === p.contract.signedSeason)
    || (state.phase === 'preseason' && state.season === p.contract.startSeason))) fail();
  const unresolved = (state.spending.faCompensations ?? []).filter(r => r.resolution === 'pending').filter(r => {
    const other = proposalFor(state, r.proposalId).proposal;
    return other.teamId === p.teamId && other.contract.startSeason === p.contract.startSeason;
  });
  if (unresolved.length !== selections.length || unresolved.some(r => !selections.some(c => c.proposalId === r.proposalId))) fail();
  for (const c of selections) {
    const view = faProtectionView(state, { proposalId: c.proposalId });
    if (!view.submitted || !view.candidatePlayerIds.includes(c.playerId)) fail();
  }
  const collision = new Set(selections.map(c => c.playerId)).size !== selections.length;
  const priority = collision ? priorityFor(state, p.contract.signedSeason, [p.teamId, ...selections.map(c => c.teamId)]) : null;
  const personnel = decide(selections, p.teamId, priority);
  const effectiveDate = state.phase === 'offseason' ? `${String(p.contract.startSeason).padStart(4, '0')}-02-01` : state.date;
  const from = state.teams.find(t => t.id === p.teamId), moves = [];
  let spending = state.spending;
  for (const c of selections.filter(c => personnel.winnerProposalIds.includes(c.proposalId))) {
    const player = ownedPlayers(from).find(x => x.id === c.playerId);
    if (!player || state.spending.reservations.some(h => h.kind === 'renewal' && h.proposal.contract.playerId === c.playerId)) fail();
    const dates = ordered([...new Set([effectiveDate, ...spending.ledger.records.filter(r => r.contract.playerId === c.playerId
      && r.effectiveDate > effectiveDate).map(r => r.effectiveDate)])]);
    const transfers = [];
    for (const date of dates) {
      const e = contractEmploymentAt(spending.ledger, date).find(e => e.contract.playerId === c.playerId);
      if (!e || e.teamId !== p.teamId || e.registrationType === 'development' || isIkuseiPlayer(player)) fail();
      if (transfers.some(a => a.contractId === e.contract.contractId)) continue;
      transfers.push({ id: JSON.stringify(['fa-personnel', command.id, c.proposalId, e.contract.contractId]), type: 'transfer',
        contractId: e.contract.contractId, teamId: p.teamId, toTeamId: c.teamId, effectiveDate: date });
    }
    spending = settleFaPersonnelCompensation(spending, { proposalId: c.proposalId, teamId: c.teamId,
      chosenDate: state.date, playerId: c.playerId, transactionId: command.id });
    let ledger = spending.ledger;
    for (const action of transfers) ledger = applyContractLedgerAction(ledger, action);
    spending = { ...spending, ledger };
    moves.push({ proposalId: c.proposalId, transactionId: command.id, fromTeamId: p.teamId, teamId: c.teamId,
      player: copy(player), chosenDate: state.date, effectiveDate, transfers });
  }
  const departed = new Set(moves.map(m => m.player.id));
  const payload = { chosenDate: state.date, selections: copy(selections), priority, ...personnel, moves: copy(moves) };
  return { personnel, state: { ...state, spending, teams: state.teams.map(t => t.id === p.teamId ? removeDepartingPlayers(t, departed) : t),
    faPersonnelMoves: [...(state.faPersonnelMoves ?? []), ...moves],
    transactions: [...state.transactions, { id: command.id, signature, faPersonnel: payload }] } };
}

export function inspectFaPersonnelMoves(state) {
  if (state.faPersonnelMoves !== undefined && !Array.isArray(state.faPersonnelMoves)) fail();
  const moves = state.faPersonnelMoves ?? [], pending = [], ids = new Set();
  for (const m of moves) {
    const fields = ['proposalId', 'transactionId', 'fromTeamId', 'teamId', 'player', 'chosenDate', 'effectiveDate', 'transfers'];
    if (Object.hasOwn(m ?? {}, 'joinedDate')) fields.push('joinedDate');
    if (!keys(m, fields) || ![m.proposalId, m.transactionId, m.fromTeamId, m.teamId, m.player?.id].every(validId) || ids.has(m.proposalId)) fail();
    ids.add(m.proposalId);
    const { proposal: p, answeredDate } = proposalFor(state, m.proposalId);
    const compensation = state.spending.faCompensations?.find(r => r.proposalId === m.proposalId);
    parseContractDate(m.chosenDate); parseContractDate(m.effectiveDate);
    if (m.fromTeamId !== p.teamId || m.teamId !== p.marketEntry.originTeamId || m.chosenDate < answeredDate || m.chosenDate > state.date
      || m.effectiveDate < m.chosenDate || parseContractDate(m.effectiveDate).year !== p.contract.startSeason
      || compensation?.resolution !== 'player-and-cash' || compensation.playerId !== m.player.id
      || compensation.teamId !== m.teamId || compensation.chosenDate !== m.chosenDate || compensation.transactionId !== m.transactionId
      || !state.teams.some(t => t.id === m.teamId) || !Array.isArray(m.transfers) || m.transfers.length === 0
      || m.transfers[0].effectiveDate !== m.effectiveDate || new Set(m.transfers.map(a => a.contractId)).size !== m.transfers.length) fail();
    const receipt = state.transactions.find(r => r.id === m.transactionId);
    if (!receipt?.faPersonnel?.moves?.some(x => stable(x) === stable(originalMove(m)))) fail();
    for (const a of m.transfers) {
      const r = state.spending.ledger.records.find(r => r.contract.contractId === a.contractId);
      if (!keys(a, ['id', 'type', 'contractId', 'teamId', 'toTeamId', 'effectiveDate']) || a.type !== 'transfer'
        || a.id !== JSON.stringify(['fa-personnel', m.transactionId, m.proposalId, a.contractId])
        || a.teamId !== m.fromTeamId || a.toTeamId !== m.teamId || a.effectiveDate < m.effectiveDate
        || r?.contract.playerId !== m.player.id || !r.changes.some(x => stable(x) === stable(a))) fail();
    }
    if (Object.hasOwn(m, 'joinedDate')) {
      parseContractDate(m.joinedDate);
      if (m.joinedDate < m.effectiveDate || m.joinedDate > state.date || parseContractDate(m.joinedDate).year !== p.contract.startSeason) fail();
      const joins = state.transactions.filter(r => r.faPersonnelJoin?.proposalId === m.proposalId);
      if (joins.length !== 1 || joins[0].faPersonnelJoin.joinedDate !== m.joinedDate) fail();
    } else {
      if (state.season > p.contract.startSeason || (state.season === p.contract.startSeason && state.phase !== 'preseason')
        || [...state.teams.flatMap(ownedPlayers), ...state.faPool, ...(state.acquisitions ?? []).filter(a => !a.joinedDate).map(a => a.player)]
          .some(x => String(x.id) === String(m.player.id)) || pending.some(x => String(x.player.id) === String(m.player.id))) fail();
      const e = contractEmploymentAt(state.spending.ledger, m.effectiveDate).find(e => e.contract.playerId === m.player.id);
      if (!e || e.teamId !== m.teamId || e.registrationType === 'development') fail();
      pending.push(m);
    }
  }
  for (const compensation of state.spending.faCompensations ?? []) if (compensation.resolution === 'player-and-cash'
    && !moves.some(m => m.proposalId === compensation.proposalId)) fail();
  // Reverse audit: a reserved transfer ID may not survive on its own after a
  // future-contract boundary is omitted from both historical move snapshots.
  for (const record of state.spending.ledger.records) for (const action of record.changes) {
    let parts; try { parts = JSON.parse(action.id); } catch { /* Other ledger ID namespaces. */ }
    if (Array.isArray(parts) && parts[0] === 'fa-personnel') {
      const owners = moves.filter(m => m.player.id === record.contract.playerId
        && m.transfers.some(a => stable(a) === stable(action)));
      if (owners.length !== 1) fail();
    }
  }
  for (const receipt of state.transactions) {
    let command; try { command = JSON.parse(receipt.signature); } catch { /* Legacy opaque receipts. */ }
    if (command?.type === 'settle-fa-personnel' || Object.hasOwn(receipt, 'faPersonnel')) {
      const r = receipt.faPersonnel;
      if (!keys(command, ['id', 'type', 'selections']) || command.type !== 'settle-fa-personnel' || command.id !== receipt.id
        || stable({ ...command, selections: normalizeFaPersonnelSelections(command.selections) }) !== receipt.signature
        || !keys(r, ['chosenDate', 'selections', 'priority', 'winnerProposalIds', 'lostProposalIds', 'moves'])
        || stable(command.selections) !== stable(r.selections)) fail();
      parseContractDate(r.chosenDate); if (r.chosenDate > state.date) fail();
      const p = groupFor(state, r.selections);
      const collision = new Set(r.selections.map(c => c.playerId)).size !== r.selections.length;
      const priority = collision ? priorityFor(state, p.contract.signedSeason, [p.teamId, ...r.selections.map(c => c.teamId)]) : null;
      if (stable(r.priority) !== stable(priority) || stable(decide(r.selections, p.teamId, priority))
        !== stable({ winnerProposalIds: r.winnerProposalIds, lostProposalIds: r.lostProposalIds }) || !Array.isArray(r.moves)
        || r.moves.length !== r.winnerProposalIds.length) fail();
      for (const c of r.selections) {
        const list = state.faProtectionLists?.find(l => l.proposalId === c.proposalId);
        if (!list || list.submittedDate > r.chosenDate || !list.eligiblePlayerIds.includes(c.playerId) || list.protectedPlayerIds.includes(c.playerId)) fail();
        if (r.winnerProposalIds.includes(c.proposalId)) {
          const m = moves.find(m => m.proposalId === c.proposalId && m.transactionId === receipt.id);
          if (!m || m.player.id !== c.playerId || m.chosenDate !== r.chosenDate
            || r.moves.filter(x => stable(x) === stable(originalMove(m))).length !== 1) fail();
        }
      }
    }
    if (command?.type === 'join-fa-personnel' || Object.hasOwn(receipt, 'faPersonnelJoin')) {
      const r = receipt.faPersonnelJoin, m = moves.find(m => m.proposalId === command?.proposalId);
      if (!keys(command, ['id', 'type', 'proposalId']) || command.type !== 'join-fa-personnel' || command.id !== receipt.id
        || stable(command) !== receipt.signature || !keys(r, ['proposalId', 'joinedDate']) || !m
        || r.proposalId !== m.proposalId || r.joinedDate !== m.joinedDate) fail();
    }
  }
  return pending;
}

export function joinFaPersonnel(state, command, signature) {
  const m = (state.faPersonnelMoves ?? []).find(m => m.proposalId === command.proposalId);
  const p = proposalFor(state, command.proposalId).proposal;
  if (!m || Object.hasOwn(m, 'joinedDate') || state.phase !== 'preseason' || state.season !== p.contract.startSeason || state.date < m.effectiveDate) fail();
  const e = contractEmploymentAt(state.spending.ledger, state.date).find(e => e.contract.playerId === m.player.id && e.teamId === m.teamId);
  if (!e || e.registrationType === 'development') fail();
  const player = { ...m.player, isFA: false, 育成: false, isIkusei: false, ikuseiYears: 0, salary: e.annualSalaryManYen,
    contractId: e.contract.contractId, contractYears: e.contract.termYears,
    contractYearsLeft: contractSeasonsRemaining(e.contract, state.season), contractSignedYear: e.contract.signedSeason };
  return { ...state, teams: state.teams.map(t => t.id === m.teamId ? { ...t, farm: [...t.farm, player] } : t),
    faPersonnelMoves: state.faPersonnelMoves.map(x => x === m ? { ...x, joinedDate: state.date } : x),
    transactions: [...state.transactions, { id: command.id, signature, faPersonnelJoin: { proposalId: m.proposalId, joinedDate: state.date } }] };
}
