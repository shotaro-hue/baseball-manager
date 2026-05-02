export const mockGameState = {
  scoreboard: { homeTeam: '東京スカイホークス', awayTeam: '大阪ベアーズ', homeScore: 2, awayScore: 3, inningLabel: '7回裏' },
  count: { balls: 2, strikes: 1, outs: 1 },
  runners: { first: true, second: false, third: true },
  matchup: {
    batter: '山田 太郎',
    pitcher: '佐藤 健',
    riskLevel: 'high',
    advice: '⚠️ 長打警戒。外角低め中心で配球し、必要なら敬遠を検討。',
  },
  actions: [
    { id: 'pitch', label: '勝負する' },
    { id: 'intentional_walk', label: '敬遠する' },
    { id: 'change_pitcher', label: '投手交代' },
    { id: 'defensive_shift', label: '守備シフト' },
    { id: 'auto', label: '自動進行' },
  ],
};
