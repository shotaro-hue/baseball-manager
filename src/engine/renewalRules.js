// Amounts are in 万円. The NPB cut boundary is separate from salary guarantees.
// Offseason runs before next year's decrement. Left=1 expires this winter.
export const ownedPlayers = team => [...(team?.players || []), ...(team?.farm || [])];
export const mapOwnedPlayers = (team, fn) => ({ ...team, players: (team.players || []).map(fn), farm: (team.farm || []).map(fn) });
export const ikuseiContractYears = player => Math.max(1, 3 - (player.ikuseiYears || 0));
export function remainingContractAfterSeason(player, year) {
  if (!Number.isFinite(player.contractYearsLeft) || player.contractSignedYear === year) return player.contractYearsLeft;
  return Math.max(0, player.contractYearsLeft - 1);
}
export function renewalEligible(player, year) {
  return Number.isFinite(player.contractYearsLeft) && player.contractYearsLeft <= 1
    && !player.isRetired && !player._retireNow
    && (!Number.isFinite(year) || player.contractSignedYear !== year);
}

export function salaryCutRule(player, offerSalary) {
  if (!Number.isFinite(player.salary) || player.salary < 0) return { recorded: false, exceeds: false };
  const rate = player.salary > 10000 ? .4 : .25;
  const boundary = player.salary * (rate === .4 ? 60 : 75) / 100;
  return { recorded: true, rate, boundary, exceeds: Number.isFinite(offerSalary) && offerSalary < boundary };
}
