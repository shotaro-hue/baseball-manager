// Derived display data only. Contract salary and team budgets use 万円.
const CATEGORIES = [
  ['active', '一軍支配下'], ['farm', '二軍支配下'], ['development', '育成'],
];
export function contractSalaryStatus(salary) {
  return salary == null ? 'missing'
    : Number.isFinite(salary) && salary >= 0 ? 'recorded' : 'invalid';
}
export function contractPayroll(team) {
  const groups = CATEGORIES.map(([category, label]) => ({ category, label, amount: 0, count: 0, missing: 0, invalid: 0 }));
  const byCategory = new Map(groups.map(g => [g.category, g]));
  const seenIds = new Set(), seenObjects = new Set(), entries = [];
  for (const [roster, category] of [[team?.players ?? [], 'active'], [team?.farm ?? [], 'farm']]) {
    for (const player of roster) {
      if (seenObjects.has(player) || (player.id != null && seenIds.has(player.id))) continue;
      seenObjects.add(player); if (player.id != null) seenIds.add(player.id);
      const group = byCategory.get(player.育成 ? 'development' : category);
      const salaryStatus = contractSalaryStatus(player.salary);
      group.count++;
      if (salaryStatus === 'recorded') group.amount += player.salary;
      else group[salaryStatus]++;
      entries.push({ player, category: group.category, label: group.label, salaryStatus });
    }
  }
  const total = groups.reduce((sum, g) => ({ amount: sum.amount + g.amount, count: sum.count + g.count,
    missing: sum.missing + g.missing, invalid: sum.invalid + g.invalid }), { amount: 0, count: 0, missing: 0, invalid: 0 });
  // A new array is sorted. Stable ties retain current roster order; unknown
  // salaries follow recorded values (including zero), never rank as zero.
  const leaders = [...entries].sort((a, b) => {
    if (a.salaryStatus !== 'recorded') return b.salaryStatus === 'recorded' ? 1 : 0;
    if (b.salaryStatus !== 'recorded') return -1;
    return b.player.salary - a.player.salary;
  }).slice(0, 6);
  return { groups, total, entries, leaders };
}
