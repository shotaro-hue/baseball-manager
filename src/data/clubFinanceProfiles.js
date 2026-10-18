// Attendance: NPB official 2025 club averages. All other amounts are GAME
// ESTIMATES, not disclosed club accounts. Money below: 億円; yields: 円/visitor.
// No ballpark non-baseball events, real estate, taxes or cash flow are modeled.
// Sources and boundaries: docs/superpowers/specs/2026-10-18-club-finance-design.md
const rows = [
  // id, attendance, ticket, food, merch, sponsor, broadcast, membership, fixed
  [0, 27944, 3300, 1300, 1200, 25, 9, 5, 75],
  [1, 33245, 3900, 1600, 1600, 32, 10, 7, 95],
  [2, 28356, 3100, 1100, 1000, 20, 7, 4, 70],
  [3, 41722, 3600, 1400, 1600, 40, 12, 9, 130],
  [4, 39761, 4100, 1400, 1700, 50, 18, 10, 150],
  [5, 35012, 3300, 1200, 1300, 27, 10, 6, 100],
  [6, 38281, 3800, 1600, 1500, 45, 12, 8, 135],
  [7, 23713, 3300, 1200, 1000, 23, 8, 4, 65],
  [8, 24395, 3100, 1200, 1000, 22, 8, 4, 65],
  [9, 26018, 3300, 1400, 1100, 25, 8, 4, 70],
  [10, 31442, 4100, 2200, 1700, 35, 9, 6, 120],
  [11, 28571, 3400, 1400, 1200, 30, 8, 5, 80],
];
export const CLUB_FINANCE_PROFILES = Object.fromEntries(rows.map(([id, attendance, ticketYield, foodYield, merchYield,
  sponsor, broadcast, membership, fixed]) => [id, Object.freeze({ attendance, ticketYield, foodYield, merchYield,
  sponsor: sponsor * 10000, broadcast: broadcast * 10000, membership: membership * 10000, fixedCost: fixed * 10000 })]));
export const CLUB_STADIUM_UPGRADE_COSTS = Object.freeze([100000, 250000, 500000]);
export const LEGACY_STADIUM_UPGRADE_COSTS = Object.freeze([5000000, 10000000, 20000000]);
