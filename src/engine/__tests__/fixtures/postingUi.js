import { createInitialTeams } from '../../bootstrapTeams';
import { isIkuseiPlayer } from '../../rosterCapacity';
import { reduceEconomyCommand } from '../../contractEconomy';
import { postingWinter } from './postingDepartures';
import { postingRequest } from './postingApplications';

export function postingUiWorld({ realRoster = false } = {}) {
  const start = postingWinter(realRoster ? { teams: [createInitialTeams()[0]] } : undefined);
  const p = start.teams[0].players.find(p => !isIkuseiPlayer(p));
  const result = reduceEconomyCommand(start, postingRequest(start, { playerId: p.id, contractId: p.contractId }));
  if (!result.ok) throw Error(result.error);
  return { ...result.world, mailbox: [{ id: 'old-mail', type: 'posting_request', title: '移籍申請（旧通知）',
    playerId: p.id, read: true, body: '海外への挑戦を希望しています。', from: p.name, dateLabel: '2026年' }] };
}
