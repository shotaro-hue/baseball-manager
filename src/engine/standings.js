// Compare fractions, never rounded display rates. Missing records are not zeroes.
const count = value => Number.isFinite(value) && value >= 0 ? value : 0;
export const teamWinRate = team => count(team.wins) / Math.max(1, count(team.wins) + count(team.losses));
const compareRate = (a, b) => b.wins * Math.max(1, a.wins + a.losses) - a.wins * Math.max(1, b.wins + b.losses);

export function rankLeague(teams, league, { gameResultsMap = {}, previousStandings = null } = {}) {
  const warnings = new Set();
  const clubs = teams.filter(t => t.league === league);
  const records = new Map(clubs.map(team => {
    const rows = Object.values(gameResultsMap[team.id] || {}).filter(r => r.oppId != null
      && teams.some(t => t.id === r.oppId) && Number.isFinite(r.myScore) && Number.isFinite(r.oppScore));
    const wins = rows.filter(r => r.myScore > r.oppScore).length;
    const losses = rows.filter(r => r.myScore < r.oppScore).length;
    const draws = rows.length - wins - losses;
    return [team.id, wins === count(team.wins) && losses === count(team.losses)
      && draws === count(team.draws) ? rows : null];
  }));
  const previous = previousStandings?.[league === 'セ' ? 'central' : 'pacific'] || [];
  const rate = (team, ids) => {
    const rows = records.get(team.id)?.filter(r => ids.has(r.oppId));
    if (!rows) return null;
    return { wins: rows.filter(r => r.myScore > r.oppScore).length,
      losses: rows.filter(r => r.myScore < r.oppScore).length };
  };
  const split = (group, compare) => {
    const sorted = [...group].sort(compare), groups = [];
    for (const team of sorted) {
      const last = groups.at(-1);
      if (last && compare(last[0], team) === 0) last.push(team);
      else groups.push([team]);
    }
    return groups;
  };
  const criteria = [
    group => league === 'セ' ? split(group, (a, b) => count(b.wins) - count(a.wins)) : [group],
    group => {
      const ids = new Set(group.map(t => t.id)), values = new Map(group.map(t => [t.id, rate(t, ids)]));
      if (group.some(t => !values.get(t.id) || values.get(t.id).wins + values.get(t.id).losses === 0)) {
        warnings.add('同率時の対戦成績が不足しています'); return [group];
      }
      return split(group, (a, b) => compareRate(values.get(a.id), values.get(b.id)));
    },
    group => {
      const ids = new Set(clubs.map(t => t.id)), values = new Map(group.map(t => [t.id, rate(t, ids)]));
      if (group.some(t => !values.get(t.id) || values.get(t.id).wins + values.get(t.id).losses === 0)) {
        warnings.add('同率時のリーグ内成績が不足しています'); return [group];
      }
      return split(group, (a, b) => compareRate(values.get(a.id), values.get(b.id)));
    },
    group => {
      if (group.some(t => !previous.some(p => p.id === t.id))) {
        warnings.add('同率時の前年順位が未記録のため、球団ID順を使用しています');
        return split(group, (a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
      }
      return split(group, (a, b) => previous.findIndex(t => t.id === a.id) - previous.findIndex(t => t.id === b.id));
    },
  ];
  const resolve = (group, level = 0) => group.length < 2 || level === criteria.length
    ? group : criteria[level](group).flatMap(g => resolve(g, level + 1));
  const ranked = split(clubs, (a, b) => compareRate(
    { wins: count(a.wins), losses: count(a.losses) }, { wins: count(b.wins), losses: count(b.losses) }
  )).flatMap(group => resolve(group));
  return { teams: ranked, warnings: [...warnings] };
}

export function standingsContext(history, gameResultsMap, year) {
  return { gameResultsMap, previousStandings: history?.standingsHistory?.find(s => s.year === year - 1) };
}
