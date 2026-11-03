import { FIELDING_POSITIONS } from '../constants';
import { canAddToActiveRoster, proficiencyAt, validateTeamRoster } from './rosterAutomation';
import { selectFarmTeam, validateFarmTeams } from './farmSelection';

const reject = reason => ({ ok: false, reasons: [reason] });
const healthy = p => Number(p.injuryDaysLeft || 0) === 0 && !p.isRetired && !p._retireNow;
const catcher = p => !p.isPitcher && proficiencyAt(p, '捕手') > 0;

// A witness of simultaneous playability, not an optimal roster or a state
// update. Callers must still enforce dates, ownership, contracts and budgets.
// Keep the active side minimal so filling 31 slots cannot starve the farm.
export function assessPostTransactionPlayability(team, { round } = {}) {
  if (!Number.isInteger(round) || round < 1 || round > 143) return reject('invalid-round');
  try { validateFarmTeams([team]); } catch { return reject('invalid-roster'); }
  const all = [...team.players, ...team.farm];
  if (all.some(p => p.registrationCooldownDays != null
    && (!Number.isFinite(Number(p.registrationCooldownDays)) || Number(p.registrationCooldownDays) < 0))) {
    return reject('invalid-roster');
  }
  const currentActive = new Set(team.players.map(p => p.id));
  const available = all.filter(healthy);
  const eligible = available.filter(p => canAddToActiveRoster(
    currentActive.has(p.id) ? { ...p, registrationCooldownDays: 0 } : p, []));
  const batters = available.filter(p => !p.isPitcher);
  const pitchers = available.filter(p => p.isPitcher);
  if (batters.length < 18) return reject('insufficient-batters');
  if (pitchers.length < 2) return reject('insufficient-pitchers');
  const activePitcher = eligible.find(p => p.isPitcher);
  if (!activePitcher) return reject('no-eligible-active-pitcher');

  // Reserve a real farm catcher before choosing the active one. The rest of
  // the active batters can use existing emergency fielding assignments.
  // Domestic-first selection is sufficient: at most three foreign batters
  // fit the current four-player/mixed-role foreign registration rule.
  const activeBatters = eligible.filter(p => !p.isPitcher)
    .sort((a, b) => Number(Boolean(a.isForeign)) - Number(Boolean(b.isForeign)));
  for (const farmCatcher of batters.filter(catcher)) {
    for (const activeCatcher of activeBatters.filter(p => p.id !== farmCatcher.id && catcher(p))) {
      const lineup = [activeCatcher];
      let foreignBatters = Number(Boolean(activeCatcher.isForeign));
      for (const p of activeBatters) {
        if (lineup.length === 9) break;
        if (p.id === farmCatcher.id || p.id === activeCatcher.id || (p.isForeign && foreignBatters >= 3)) continue;
        lineup.push(p); foreignBatters += Number(Boolean(p.isForeign));
      }
      if (lineup.length !== 9) continue;
      const activeIds = new Set([...lineup.map(p => p.id), activePitcher.id]);
      const positions = ['捕手', ...FIELDING_POSITIONS.filter(p => p !== '捕手'), 'DH'];
      const fielding = Object.fromEntries(lineup.map((p, i) => [p.id, positions[i]]));
      const candidate = structuredClone({ ...team,
        players: [...lineup, activePitcher], farm: all.filter(p => !activeIds.has(p.id)),
        lineupNoDh: lineup.slice(0, 8).map(p => p.id), lineupDh: lineup.map(p => p.id),
        fieldingNoDh: Object.fromEntries(lineup.slice(0, 8).map(p => [p.id, fielding[p.id]])), fieldingDh: fielding,
        rosterFallbackAssignments: Object.fromEntries(lineup.filter(p => proficiencyAt(p, fielding[p.id]) <= 0)
          .map(p => [p.id, fielding[p.id]])), rotation: [activePitcher.id],
      });
      if (!validateTeamRoster(candidate).valid) continue;
      // Retired players never provide evidence of availability, even if an
      // old roster still contains them. Preserve them in the returned snapshot.
      const farm = selectFarmTeam({ ...candidate, farm: candidate.farm.filter(healthy) }, { round });
      if (farm.status === 'ready') return { ok: true, reasons: [], team: candidate };
    }
  }
  return reject('no-simultaneous-allocation');
}
