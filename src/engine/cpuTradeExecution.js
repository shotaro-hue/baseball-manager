import { applyTradeTransaction } from './tradeTransaction';
import { applyManagementPolicy, ROSTER_AUTOMATION_MODES, validateTeamRoster } from './rosterAutomation';

// CPU trades must update both ownership and executable rosters together.
// Preserve the caller's team objects, which may already hold today's results.
export function executeCpuTrade(teams, trade, gameDay) {
  if (!trade || trade.buyerId === trade.sellerId) return false;
  const buyer = teams.find(t => t.id === trade.buyerId);
  const seller = teams.find(t => t.id === trade.sellerId);
  if (!buyer || !seller) return false;
  const result = applyTradeTransaction(teams, { fromId: trade.buyerId, toId: trade.sellerId,
    outgoing: [trade.sellerGets], incoming: [trade.buyerGets], cash: 0 });
  if (!result.ok) return false;
  const nextTeams = result.teams;
  const nextBuyer = nextTeams.find(t => t.id === buyer.id);
  const nextSeller = nextTeams.find(t => t.id === seller.id);
  const prepare = t => applyManagementPolicy(t, { teams: nextTeams, gameDay,
    force: true, automationMode: ROSTER_AUTOMATION_MODES.FULL, includeRosterChanges: true });
  const readyBuyer = prepare(nextBuyer);
  const readySeller = prepare(nextSeller);
  if (!validateTeamRoster(readyBuyer).valid || !validateTeamRoster(readySeller).valid) return false;
  Object.assign(buyer, readyBuyer);
  Object.assign(seller, readySeller);
  return true;
}
