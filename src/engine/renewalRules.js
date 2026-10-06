// Amounts are in 万円. The NPB cut boundary is separate from salary guarantees.
export function salaryCutRule(player, offerSalary) {
  if (!Number.isFinite(player.salary) || player.salary < 0) return { recorded: false, exceeds: false };
  const rate = player.salary > 10000 ? .4 : .25;
  const boundary = player.salary * (rate === .4 ? 60 : 75) / 100;
  return { recorded: true, rate, boundary, exceeds: Number.isFinite(offerSalary) && offerSalary < boundary };
}
