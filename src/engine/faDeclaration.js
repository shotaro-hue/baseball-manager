import { calcPlayerDemand, getFaProgress } from './contract';
import { renewalEligible } from './renewalRules';
import { pruneRosterReferences } from './offseasonReview';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const preference = (p, key) => Number.isFinite(p.personality?.[key]) ? clamp(p.personality[key], 0, 100) / 100 : .5;

// Deterministic season draw: unaffected by UI rerenders, loads or global RNG.
// Identity is type-tagged so numeric ID 0 remains valid and distinct from "0".
export function faSeasonDraw(player, team, year) {
  const key = JSON.stringify(['domestic-fa-v1', year, typeof team.id, team.id, typeof player.id, player.id]);
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15; hash = Math.imul(hash, 0x846ca68b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

export function assessFaDeclaration(player, team, year, demand = calcPlayerDemand(player)) {
  if (!Number.isFinite(year) || player.id == null || team.id == null || player.isForeign || player.育成
    || !renewalEligible(player, year) || !getFaProgress(player).domestic?.eligible) return null;
  if (player.faDeclarationDecision?.year === year) return player.faDeclarationDecision;
  // Overseas hopefuls retain the existing policy of waiting for overseas FA.
  if ((player.personality?.overseas ?? 0) >= 70) return null;
  const assessment = demand.assessment;
  const reasons = [];
  let probability = .06 + preference(player, 'money') * .1 + preference(player, 'future') * .06
    - preference(player, 'loyalty') * .08 - preference(player, 'stability') * .04;
  if (assessment?.recorded) {
    const playing = (1 - clamp(assessment.workload, 0, 1)) * preference(player, 'playing') * .3;
    probability += playing;
    if (playing >= .04) reasons.push('出場機会を求める');
  }
  const games = team.wins + team.losses;
  if (Number.isFinite(games) && games > 0) {
    const winning = clamp((.5 - team.wins / games) * 2, 0, 1) * preference(player, 'winning') * .18;
    probability += winning;
    if (winning >= .03) reasons.push('優勝を狙える環境を求める');
  }
  if (Number.isFinite(player.trust)) {
    const distrust = clamp((50 - player.trust) / 50, 0, 1) * .15;
    probability += distrust;
    if (distrust >= .04) reasons.push('球団との信頼関係');
  }
  if (Number.isFinite(player.salary) && player.salary > 0 && demand.demandSalary < player.salary) {
    probability += clamp(1 - demand.demandSalary / player.salary, 0, .4) * preference(player, 'money') * .3;
    reasons.push('減額見込みを踏まえ待遇を見直す');
  }
  if (preference(player, 'money') >= .7) reasons.push('市場で契約条件を確かめたい');
  if (!reasons.length) reasons.push('新しい環境・契約の選択肢を求める');
  probability = clamp(probability, .02, .45);
  const draw = faSeasonDraw(player, team, year);
  return { year, declared: draw < probability, probability, draw, reasons };
}

// Called for every club at the same pre-renewal boundary. Salary is the shared
// demand; this market's existing fixed-price signing can also result in a stay.
export function resolveOffseasonFaDeclarations(teams, year, salaryContext = {}) {
  const newFaPlayers = []; const news = [];
  const updatedTeams = teams.map(team => {
    const removed = new Set();
    const players = team.players.map(player => {
      if (!renewalEligible(player, year)) return player;
      const demand = calcPlayerDemand(player, { ...salaryContext, year, team, teams });
      const decision = assessFaDeclaration(player, team, year, demand);
      if (!decision) return player;
      const updated = { ...player, faDeclarationDecision: decision };
      if (!decision.declared) return updated;
      removed.add(player.id);
      newFaPlayers.push({ ...updated, salary: demand.demandSalary, faPreviousSalary: player.salary,
        isFA: true, contractYearsLeft: 0, marketEntryReason: '国内FA宣言', marketLastStats: player.stats,
        faEnteredYear: year, faOriginTeamId: team.id, faOriginTeamName: team.name });
      news.push({ type: 'season', headline: `【FA】${player.name}（${team.name}）が国内FA宣言`,
        source: '野球速報', dateLabel: `${year}年`,
        body: `${player.name}選手が国内FA権を行使。${decision.reasons.join('・')}。宣言残留も可能です。` });
      return updated;
    }).filter(p => !removed.has(p.id));
    return { ...team, players, ...pruneRosterReferences(team, removed),
      history: [...(team.history || []), ...team.players.filter(p => removed.has(p.id)).map(p => ({
        ...p, exitYear: year, exitReason: 'FA宣言', tenure: p.serviceYears ?? 1,
      }))] };
  });
  return { updatedTeams, newFaPlayers, news };
}
