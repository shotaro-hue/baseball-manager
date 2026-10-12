// Fixed logs for result-screen/box-score parity. No simulation or storage stub.
export const decisionScenarios = {
  'own relief loss': [['opp', 'my-starter', 'out', 0], ['my', 'opp-starter', 'out', 0], ['opp', 'my-relief', 'hr', 1]],
  'opponent relief loss': [['my', 'opp-starter', 'out', 0], ['opp', 'my-starter', 'out', 0], ['my', 'opp-relief', 'hr', 1]],
  'lead regained then lost': [['opp', 'my-starter', 'hr', 1], ['my', 'opp-starter', 'hr', 2], ['opp', 'my-relief', 'hr', 2]],
  'starter win and closer save': [['opp', 'my-starter', 'out', 0, 15], ['my', 'opp-starter', 'hr', 2], ['opp', 'my-closer', 'out', 0, 3]],
  'short starter relief win and save': [['opp', 'my-starter', 'out', 0], ['my', 'opp-starter', 'hr', 2], ['opp', 'my-relief', 'out', 0], ['opp', 'my-closer', 'out', 0]],
  'draw without decisions': [['my', 'opp-starter', 'hr', 1], ['opp', 'my-starter', 'hr', 1], ['opp', 'my-relief', 'out', 0]],
};

export function decisionFixture(sequence, isHome) {
  const pitchers = (side) => ['starter', 'relief', 'closer'].map((role) => ({
    id: `${side}-${role}`, name: `${side === 'my' ? '自軍' : '相手'}${{ starter: '先発', relief: '救援', closer: '抑え' }[role]}`,
    isPitcher: true, stats: {},
  }));
  const myTeam = { id: 'my', name: '自軍', short: 'MY', players: pitchers('my'), farm: [] };
  const oppTeam = { id: 'opp', name: '相手', short: 'OPP', players: pitchers('opp'), farm: [] };
  const log = sequence.flatMap(([side, pitcherId, result, rbi, count = 1]) => Array.from({ length: count }, () => ({
    pitcherId, result, rbi, batId: `${side}-batter`, batter: `${side}-batter`,
    scorer: side === 'my', isTop: isHome ? side === 'opp' : side === 'my',
  })));
  const runs = (side) => log.filter((event) => event.scorer === (side === 'my')).reduce((n, event) => n + event.rbi, 0);
  return { myTeam, oppTeam, result: { score: { my: runs('my'), opp: runs('opp') }, log, inningSummary: [], isHome } };
}
