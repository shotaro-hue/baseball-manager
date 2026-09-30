// Soft pitch budgets, evaluated between plate appearances. Roles are fixed at entry.
export function reliefPitchBudget(pitcher, role = 'middle') {
  const ranges = { long: [45, 60], middle: [25, 35], seventh: [25, 35], setup: [20, 30], closer: [20, 30] };
  const [low, high] = ranges[role] ?? ranges.middle;
  const stamina = pitcher?.pitching?.stamina ?? 50;
  const condition = pitcher?.condition ?? 70;
  const base = Math.max(low, Math.min(high, (low + high) / 2 + (stamina - 50) * 0.2));
  return Math.round(base * Math.max(0.55, Math.min(1, condition / 80)));
}
