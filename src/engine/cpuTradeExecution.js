import { applyManagementPolicy, ROSTER_AUTOMATION_MODES, validateTeamRoster } from './rosterAutomation';

// CPU trades must update both ownership and executable rosters together.
// Preserve the caller's team objects, which may already hold today's results.
export function executeCpuTrade(teams, trade, gameDay) {
  if (!trade || trade.buyerId === trade.sellerId) return false;
  const buyer = teams.find(t => t.id === trade.buyerId);
  const seller = teams.find(t => t.id === trade.sellerId);
  if (!buyer || !seller) return false;
  const owned = t => [...(t.players || []), ...(t.farm || [])];
  const buyerGets = owned(seller).find(p => p.id === trade.buyerGets?.id);
  const sellerGets = owned(buyer).find(p => p.id === trade.sellerGets?.id);
  if (!buyerGets || !sellerGets || buyerGets.id === sellerGets.id) return false;
  const exchange = (t, out, incoming) => ({ ...t,
    players: [...t.players.filter(p => p.id !== out.id), incoming],
    farm: (t.farm || []).filter(p => p.id !== out.id) });
  const nextBuyer = exchange(buyer, sellerGets, buyerGets);
  const nextSeller = exchange(seller, buyerGets, sellerGets);
  const nextTeams = teams.map(t => t.id === buyer.id ? nextBuyer : t.id === seller.id ? nextSeller : t);
  const prepare = t => applyManagementPolicy(t, { teams: nextTeams, gameDay,
    force: true, automationMode: ROSTER_AUTOMATION_MODES.FULL, includeRosterChanges: true });
  const readyBuyer = prepare(nextBuyer);
  const readySeller = prepare(nextSeller);
  if (!validateTeamRoster(readyBuyer).valid || !validateTeamRoster(readySeller).valid) return false;
  Object.assign(buyer, readyBuyer);
  Object.assign(seller, readySeller);
  return true;
}
