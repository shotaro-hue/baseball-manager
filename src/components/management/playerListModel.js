import { isIkuseiPlayer } from '../../engine/rosterCapacity';
import { renewalEligible } from '../../engine/renewalRules';
import { isPendingContractReply } from '../../engine/contractReplies';

export const GROUP_LABELS = { active: '一軍', farm: '二軍', ikusei: '育成' };
export const CONTRACT_STATES = { actionable: '要対応', waiting: '回答待ち', signed: '当年契約済み', continuing: '継続契約' };
export const DEFAULT_PLAYER_FILTERS = { search: '', group: 'all', position: 'all', sort: 'default' };

export function rosterEntries(team) {
  return [...(team?.players || []).map(player => ({ player, group: isIkuseiPlayer(player) ? 'ikusei' : 'active' })),
    ...(team?.farm || []).map(player => ({ player, group: isIkuseiPlayer(player) ? 'ikusei' : 'farm' }))];
}

// Matches the contract engine's legacy dateLabel fallback; this is UI-only.
export function isCurrentContractMail(mail, teamId, year) {
  const datedYear = mail.dateLabel?.match(/^(\d+)年/);
  const offeredYear = mail.decision?.offeredYear ?? (datedYear ? Number(datedYear[1]) : null);
  return (mail.decision?.teamId == null || mail.decision.teamId === teamId) && (offeredYear == null || offeredYear === year);
}

// One mail pass, one roster pass. The badge and list consume the same states.
export function contractEntries(team, mailbox = [], year) {
  const waiting = new Set(mailbox.filter(m => isPendingContractReply(m) && isCurrentContractMail(m, team?.id, year)).map(m => m.decision?.playerId));
  return rosterEntries(team).map(entry => {
    const p = entry.player;
    const state = p.contractSignedYear === year ? 'signed' : waiting.has(p.id) ? 'waiting' : renewalEligible(p, year) ? 'actionable' : 'continuing';
    return { ...entry, state, status: CONTRACT_STATES[state] };
  });
}

const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja');
export function filterPlayerEntries(entries, { search = '', group = 'all', position = 'all', sort = 'default', state = 'all' } = {}) {
  const query = normalize(search.trim());
  const visible = entries.filter(e => (!query || normalize(e.player.name).includes(query)) && (group === 'all' || e.group === group)
    && (position === 'all' || e.player.pos === position) && (state === 'all' || e.state === state));
  if (sort === 'default') return visible;
  const key = sort.startsWith('salary') ? 'salary' : sort === 'expiry' ? 'contractYearsLeft' : 'age';
  return visible.sort((a, b) => {
    const av = a.player[key], bv = b.player[key];
    const ar = Number.isFinite(av) && av >= 0, br = Number.isFinite(bv) && bv >= 0;
    if (ar !== br) return ar ? -1 : 1;
    return ar ? (av - bv) * (sort === 'salary-desc' ? -1 : 1) : 0;
  });
}
