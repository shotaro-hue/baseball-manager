// Amounts are in 万円. The NPB cut boundary is separate from salary guarantees.
// Offseason runs before next year's decrement. Left=1 expires this winter.
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
