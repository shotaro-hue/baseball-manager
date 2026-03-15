import { clamp } from '../utils';
import { ACCEPT_THRESHOLD } from '../constants';
import { tradeValue, analyzeTeamNeeds } from './trade';

/* ═══════════════════════════════════════════════
   CONTRACT EVALUATION
═══════════════════════════════════════════════ */

export function evalOffer(player, offer, myTeam, allTeams) {
  const p = player.personality;
  const g = myTeam.wins + myTeam.losses;
  const winPct = g > 0 ? myTeam.wins / g : 0.5;
  const rank = [...allTeams]
    .filter((t) => t.league === myTeam.league)
    .sort((a, b) => b.wins - a.wins)
    .findIndex((t) => t.id === myTeam.id) + 1;

  const moneyScore = clamp((offer.salary / Math.max(player.salary, 100000)) * 60 + 20, 0, 100);
  const winScore = clamp(winPct * 100 * 1.2, 0, 100);
  const rankScore = clamp((7 - rank) / 6 * 100, 0, 100);
  const playScore = myTeam.lineup.includes(player.id) ? 85 : 40;
  const homeScore = myTeam.city === player.hometown ? 80 : 30;
  const trustScore = clamp(player.trust, 0, 100);
  const avgAge = myTeam.players.reduce((s, x) => s + x.age, 0) / Math.max(myTeam.players.length, 1);
  const futureScore = clamp((32 - avgAge) / 14 * 100, 0, 100);
  const stabilityScore = offer.years >= 3 ? 85 : offer.years === 2 ? 65 : 40;

  const total = (
    p.money * moneyScore +
    p.winning * Math.max(winScore, rankScore) +
    p.playing * playScore +
    p.hometown * homeScore +
    p.loyalty * trustScore +
    p.stability * stabilityScore +
    p.future * futureScore
  ) / (p.money + p.winning + p.playing + p.hometown + p.loyalty + p.stability + p.future);

  return {
    total: Math.round(total),
    breakdown: {
      money:     { score: Math.round(moneyScore), weight: p.money },
      winning:   { score: Math.round(Math.max(winScore, rankScore)), weight: p.winning },
      playing:   { score: Math.round(playScore), weight: p.playing },
      hometown:  { score: Math.round(homeScore), weight: p.hometown },
      loyalty:   { score: Math.round(trustScore), weight: p.loyalty },
      stability: { score: Math.round(stabilityScore), weight: p.stability },
      future:    { score: Math.round(futureScore), weight: p.future },
    },
  };
}

/* ═══════════════════════════════════════════════
   CPU CONTRACT RENEWAL
   オフシーズンに CPU 球団が満了選手と再契約する
═══════════════════════════════════════════════ */

export function cpuRenewContracts(teams, myId, allTeams) {
  const updatedTeams = [];
  const newFaPlayers = [];
  const news = [];

  for (const t of teams) {
    if (t.id === myId) { updatedTeams.push(t); continue; }

    const expiring = t.players.filter(p => p.contractYearsLeft === 0);
    let players = [...t.players];
    let budget = t.budget;

    for (const p of expiring) {
      const raise = tradeValue(p) >= 70 ? 1.15 : 1.0;
      const salary = Math.round(p.salary * raise);
      const years = p.age <= 28 ? 2 : 1;
      const result = evalOffer(p, { salary, years }, t, allTeams);

      if (result.total >= ACCEPT_THRESHOLD && budget >= salary) {
        players = players.map(x => x.id === p.id
          ? { ...x, salary, contractYears: years, contractYearsLeft: years }
          : x
        );
        budget -= salary;
      } else {
        // 球団側が自由契約（保有権切れで放出）
        players = players.filter(x => x.id !== p.id);
        newFaPlayers.push({ ...p, isFA: true });
        news.push({
          type: 'season',
          headline: `【自由契約】${t.name}が${p.name}を自由契約`,
          source: '野球速報',
          dateLabel: '',
          body: `${t.name}は${p.name}選手（${p.age}歳）を自由契約とした。`,
        });
      }
    }

    updatedTeams.push({ ...t, players, budget });
  }

  return { updatedTeams, newFaPlayers, news };
}

/* ═══════════════════════════════════════════════
   CPU FA BIDDING
   ウェーバー後に CPU 球団が FA 市場で獲得する
═══════════════════════════════════════════════ */

export function processCpuFaBids(teams, myId, faPool, allTeams) {
  if (!faPool.length) return { updatedTeams: teams, remainingFaPool: faPool, news: [] };

  const news = [];
  let remainingPool = [...faPool];
  const teamMap = new Map(teams.map(t => [t.id, { ...t, players: [...t.players] }]));

  // 各 CPU チームが最も欲しい FA 候補に入札
  const bids = [];
  for (const t of teams.filter(t => t.id !== myId)) {
    const needs = analyzeTeamNeeds(t);
    const wantPitcher = needs.some(n => n.includes('投手'));

    const candidates = remainingPool
      .filter(p => wantPitcher ? p.isPitcher : !p.isPitcher)
      .filter(p => t.budget >= p.salary)
      .map(p => {
        const r = evalOffer(p, { salary: p.salary, years: 1 }, t, allTeams);
        return { pid: p.id, tid: t.id, score: r.total, salary: p.salary };
      })
      .filter(c => c.score >= 50)
      .sort((a, b) => b.score - a.score);

    if (candidates[0]) bids.push(candidates[0]);
  }

  // スコア降順に処理（同一選手は最高入札チームが獲得）
  bids.sort((a, b) => b.score - a.score);
  const signedPlayers = new Set();
  const signedTeams = new Set();

  for (const bid of bids) {
    if (signedPlayers.has(bid.pid) || signedTeams.has(bid.tid)) continue;
    const player = remainingPool.find(p => p.id === bid.pid);
    const team = teamMap.get(bid.tid);
    if (!player || !team) continue;

    teamMap.set(bid.tid, {
      ...team,
      players: [...team.players, { ...player, isFA: false, contractYearsLeft: 1 }],
      budget: team.budget - bid.salary,
    });
    remainingPool = remainingPool.filter(p => p.id !== bid.pid);
    signedPlayers.add(bid.pid);
    signedTeams.add(bid.tid);

    news.push({
      type: 'season',
      headline: `【入団】${player.name}が${team.name}と契約`,
      source: '野球速報',
      dateLabel: '',
      body: `${player.name}選手（${player.age}歳）が${team.name}と契約した。`,
    });
  }

  return {
    updatedTeams: teams.map(t => teamMap.get(t.id) || t),
    remainingFaPool: remainingPool,
    news,
  };
}
