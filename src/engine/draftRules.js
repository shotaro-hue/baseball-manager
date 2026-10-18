import {draftRulesFor,draftParticipation,draftNominationCount} from './draftConference';
import {evaluateDraftContinuation} from './draftContinuation';
import { controlledRosterCounts, evaluateRosterCapacity } from './rosterCapacity';
import { MAX_SHIHAKA_TOTAL, MIN_SALARY_SHIHAKA } from '../constants';
import { rng, rngf, clamp } from '../utils';
import { analyzeTeamNeeds } from './trade';
import { ownedPlayers } from './renewalRules';
import { draftPicksForTeam } from './offseasonResume';
import { evaluateOrganizationNeeds } from './organizationNeeds';
import { draftReport } from './draftReports';
import {emitCpuDecision} from './cpuDecisionTrace';

export const registeredDraftCount = team => controlledRosterCounts(team).controlledCount;
export const remainingDraftSlots = (team, pool = [], drafted = {}, context = {}) => {
  const capacity = evaluateRosterCapacity(team, { ...context, draftPool: pool, drafted });
  return capacity.ok ? capacity.remainingSlots : 0;
};
export const draftRefused = (player, isMyTeam) => isMyTeam
  && rngf(0, 1) < clamp((player.potential - 70) / 200, 0, .15);
export const drawDraftWinner = teams => teams[rng(0, teams.length - 1)];
const pitcherRole = { '先発': 'starter', '中継ぎ': 'reliever', '抑え': 'closer' };

function uncoveredActiveShortage(role) {
  // Picks reserve future depth, not operating players. Suppress repeat drafting
  // for the part already planned; healthy farm depth can require a roster swap.
  return Math.max(0, role.activeShortage - role.availableFarmCount - role.acceptedPickCount);
}

function pitcherNeedBonus(player, report, amount) {
  const role = report.roles[pitcherRole[player.subtype]];
  if (!role) return 0;
  if (role.organizationShortage > 0) return amount;
  const age = player.age || 25;
  if (role.futureDepth && ((role.futureDepth.youngShortage > 0 && age <= 24)
    || (role.futureDepth.primeShortage > 0 && age <= 30))) return amount;
  // Owned but currently unavailable depth is weaker evidence for another draft
  // acquisition than an organization-wide gap. Eligibility is not readiness.
  return uncoveredActiveShortage(role) > 0 ? amount / 2 : 0;
}

export function rankDraftProspects(team, pool, round = 1, acceptedPicks = [], draftContext = {}) {
  if (!pool.length) return [];
  // Preserve the accepted-array API. Real draft callers provide the canonical
  // pool/assignments so the evaluator can reject refusal and ownership conflict.
  const draftPool = draftContext.draftPool ?? acceptedPicks;
  const drafted = draftContext.drafted ?? Object.fromEntries(acceptedPicks
    .filter(p => p?.id != null && (!p._drafted || String(p._r1winner) === String(team.id)))
    .map(p => [p.id, team.id]));
  const organization = evaluateOrganizationNeeds(team, { ...draftContext, draftPool, drafted });
  const validatedIds = organization.ok ? new Set(organization.acceptedPickIds) : null;
  const ownedIds = new Set(ownedPlayers(team).map(p => p.id));
  const additions = draftPool.filter(p => {
    if (p?.id == null || ownedIds.has(p.id) || (validatedIds && !validatedIds.has(p.id))) return false;
    // An accepted ID may also occur on an earlier rejected record with another
    // role. Validate the record before deduplication, just as the report does.
    if (!draftPicksForTeam([p], drafted, team.id).length || drafted[p.id] === 'refused') return false;
    const firstOwner = p._drafted ? p._r1winner : null;
    const laterOwner = drafted[p.id];
    if (firstOwner != null && laterOwner != null && String(firstOwner) !== String(laterOwner)) return false;
    ownedIds.add(p.id);
    return true;
  });
  // Picks become owned only at the existing acquisition step. Project them
  // as controlled contracts, matching acquisition even if a prospect has a
  // development flag. Never change the original prospect or live roster.
  const needs = analyzeTeamNeeds(additions.length
    ? { ...team, farm: [...(team.farm || []), ...additions.map(p => ({ ...p, 育成: false, isIkusei: false }))] }
    : team, { includeFarmPitchers: true });
  const velocityNeed = needs.some(n => n.type === '投手陣の球威強化');
  const wantsPitcher = organization.ok ? velocityNeed || Object.values(organization.roles)
    .filter(r => ['starter', 'reliever', 'closer'].includes(r.role))
    .some(r => r.organizationShortage > 0 || uncoveredActiveShortage(r) > 0
      || (r.futureDepth && (r.futureDepth.youngShortage > 0 || r.futureDepth.primeShortage > 0)))
    : needs.some(n => /先発|中継ぎ|抑え|投手/.test(n.type));
  const first = round === 1;
  const pitchingBonus = first ? 26 : 24;
  const scored = pool.map((p, i) => {
    const roleBonus=(p.isPitcher ? organization.ok
      ? Math.max(velocityNeed ? pitchingBonus : 0, pitcherNeedBonus(p, organization, pitchingBonus))
      : wantsPitcher ? pitchingBonus : 0
      : !wantsPitcher ? (first ? 16 : 14) : 0);
    const catcherBonus=needs.some(n => n.type.includes('捕手')) && !p.isPitcher && p.pos === '捕手' ? (first ? 18 : 16) : 0;
    const youthBonus=needs.some(n => /若手|将来/.test(n.type)) && (p.age || 22) <= 20 ? 10 : 0;
    const fitReason=roleBonus>0 ? `${p.isPitcher?(p.subtype || p.pos):'野手'}の組織層を補う` : catcherBonus>0?'捕手の層を補う':youthBonus>0?'若手の将来層を補う':'補強の急務より選手評価を重視';
    if(draftContext.evaluation) {
      const report=draftReport(draftContext.evaluation,p.id,draftContext.publicEvaluation?null:team.id);
      if(!report) return {p,score:-Infinity,fit:0,fitReason:'評価情報なし'};
      const currentWeight=needs[0]?.horizon==='long'?.5:.7;
      const fit=(roleBonus+catcherBonus+youthBonus)*.35;
      return {p,report,fit,fitReason,score:report.current*currentWeight+report.future*(1-currentWeight)+fit};
    }
    return {p,fit:roleBonus+catcherBonus+youthBonus,fitReason,score:100-i*(first?3:2)+roleBonus+catcherBonus
    + Math.round(needs[0]?.horizon === 'short' ? (p.readinessScore ?? 50) * .2 : (p.potential ?? 50) * .15)
    + youthBonus + (!first && needs.some(n => n.type.includes('ミート')) && !p.isPitcher && (p.batting?.contact || 0) >= 65 ? 8 : 0)};
  }).sort((a,b)=>b.score-a.score || (draftContext.evaluation?String(a.p.id).localeCompare(String(b.p.id)):0));
  return scored;
}

// This forecast only consumes public observations and known roster/pick facts.
// It never consumes another club's private report or a nomination result.
export function forecastDraft(teams,pool,myId,context={}) {
  const out=Object.fromEntries(pool.map(p=>[p.id,{mass:0,survival:1,label:'不明'}]));
  if(!context.evaluation?.public) return out;
  const round=context.round ?? 1;
  if(round>1&&context.noNextPick)return out;
  const clubs=round>1 ? (context.nextTeams || []) : teams.filter(t=>!context.activeTeamIds || context.activeTeamIds.some(id=>String(id)===String(t.id)));
  for(const team of clubs) {
    if(String(team.id)===String(myId) || !draftParticipation(team,context.draftPool || pool,context.drafted || {},context).eligible) continue;
    const available=draftRulesFor(context.rules).version===2 ? evaluateDraftContinuation(team,pool,round,[],{...context,publicEvaluation:true}).candidates : pool;
    const ranked=rankDraftProspects(team,available,round,[],{...context,publicEvaluation:true});
    if(!Number.isFinite(ranked[0]?.score))continue;
    const weights=ranked.map(r=>r.score<ranked[0].score-24?0:Math.exp((r.score-ranked[0].score)/4));
    const total=weights.reduce((a,b)=>a+b,0);
    ranked.forEach((r,i)=>{const probability=weights[i]/total;out[r.p.id].mass+=probability;out[r.p.id].survival*=1-probability;});
  }
  for(const p of pool) {
    const f=out[p.id];
    f.label=round>1?(f.survival>=.75?'高':f.survival>=.4?'中':'低'):(f.mass>=1.7?'高':f.mass>=.55?'中':'低');
  }
  return out;
}

export function chooseDraftProspect(team,pool,round=1,acceptedPicks=[],draftContext={}) {
  const continuation=draftRulesFor(draftContext.rules).version===2
    ? evaluateDraftContinuation(team,pool,round,acceptedPicks,draftContext):null;
  const candidates=draftRulesFor(draftContext.rules).version===2
    ? continuation.candidates : pool;
  const chosen=p=>{
    emitCpuDecision({type:p?'draft-nomination':'draft-end',teamId:team.id,year:draftContext.year??draftContext.evaluation?.year,round,
      ...(p?{id:p.id,...continuation?.decisions.find(d=>d.id===p.id)}:{reason:continuation?.reason??'no-candidate'}),
      controlledBefore:registeredDraftCount(team),acceptedPickCount:acceptedPicks.length,budget:team.budget});
    return p;
  };
  const scored=rankDraftProspects(team,candidates,round,acceptedPicks,draftContext);
  if(!scored.length)return chosen(null);
  const first=round===1;
  if(draftContext.evaluation) {
    if(!first)return chosen(scored[0].p);
    const forecast=forecastDraft(draftContext.teams || [team],pool,team.id,{...draftContext,round});
    const utility=scored.filter(r=>r.score>=scored[0].score-12).map(r=>{
      const chance=1/(1+(forecast[r.p.id]?.mass || 0));
      const alternative=scored.find(x=>x.p.id!==r.p.id && (forecast[x.p.id]?.mass || 0)<.8) || scored.find(x=>x.p.id!==r.p.id);
      const fallback=(alternative?.score ?? r.score)-6;
      const cost=Math.min(12,Math.max(0,r.score-fallback));
      return {...r,utility:r.score-(1-chance)*cost};
    }).sort((a,b)=>b.utility-a.utility || String(a.p.id).localeCompare(String(b.p.id)));
    return chosen(utility[0].p);
  }
  if (first && rng(0, 9) < 3 && scored.length > 1) return chosen(scored[rng(1, Math.min(3, scored.length - 1))].p);
  if (!first && rngf(0, 1) < .08 && pool.length > 6) return chosen(pool[rng(4, Math.min(8, pool.length - 1))]);
  return chosen(scored[0].p);
}

// All first-round nominations are independent; only winners leave the pool.
export function resolveFirstRound(teams, pool, context={}) {
  const confirmed = {};
  const rounds=[];
  const endedTeams={...context.endedTeams},league=context.teams || teams;
  let active = teams.filter(t => {
    const participation=draftParticipation(t,pool,context.drafted||{},{...context,teams:league,endedTeams});
    if(!participation.eligible){endedTeams[t.id]=participation.reason;emitCpuDecision({type:'draft-end',teamId:t.id,
      year:context.year??context.evaluation?.year,round:1,reason:participation.reason,controlledBefore:registeredDraftCount(t),budget:t.budget});}
    return participation.eligible;
  });
  while (active.length) {
    const used = new Set(Object.values(confirmed).map(p => p.id));
    const available = pool.filter(p => !p._drafted && !used.has(p.id));
    if (!available.length) break;
    const groups = new Map();
    for (const team of active) {
      const player = chooseDraftProspect(team, available, 1, [], { ...context,teams:league,endedTeams,activeTeamIds:active.map(t=>t.id),draftPool:pool });
      if(!player){endedTeams[team.id]=draftRulesFor(context.rules).version===2?evaluateDraftContinuation(team,available,1,[],{...context,teams:league,endedTeams,draftPool:pool}).reason:'no-upgrade';continue;}
      if (!groups.has(player.id)) groups.set(player.id, { player, teams: [] });
      groups.get(player.id).teams.push(team);
    }
    rounds.push(Object.fromEntries([...groups.values()].flatMap(({player,teams:nominees})=>nominees.map(t=>[t.id,player.id]))));
    const losers = [];
    for (const { player, teams: nominees } of groups.values()) {
      const winner = nominees.length === 1 ? nominees[0] : drawDraftWinner(nominees);
      confirmed[winner.id] = player;
      losers.push(...nominees.filter(t => t.id !== winner.id));
    }
    active = losers;
  }
  return {picks:confirmed,rounds,endedTeams};
}

export const autoFirstRound=(teams,pool,context={})=>resolveFirstRound(teams,pool,context).picks;

export function applyDraftAcquisitions(teams, pool, drafted, year, context={}) {
  const fail = error => ({ ok: false, error });
  if (!Array.isArray(pool) || !drafted || typeof drafted !== 'object') return fail('ドラフト結果が無効です');
  const ids = pool.map(p => p?.id);
  if (ids.some(id => id == null) || new Set(ids).size !== ids.length) return fail('候補IDが未記録または重複しています');
  const assignments = new Map(teams.map(t => [String(t.id), []]));
  const owned = new Set(teams.flatMap(t => ownedPlayers(t).map(p => p.id)));
  for (const p of pool) {
    const first = p._drafted ? p._r1winner : null;
    const later = drafted[p.id];
    if (later === 'refused') continue;
    if (first != null && later != null && String(first) !== String(later)) return fail('当選球団が競合しています');
    const owner = later ?? first;
    if (owner == null || owner === 'refused') continue;
    if (!assignments.has(String(owner))) return fail('指名球団が見つかりません');
    if (!owned.has(p.id)) assignments.get(String(owner)).push(p);
  }
  for (const team of teams) {
    const rules=draftRulesFor(context.rules);
    if(rules.version===2&&draftNominationCount(team.id,pool,drafted,context.log)>rules.maxPicks)
      return fail(`年間指名上限（${rules.maxPicks}人）を超えます`);
    const capacity = evaluateRosterCapacity(team, { teams, draftPool: pool, drafted });
    if (!capacity.ok) return fail(`支配下人数が未確認です（${capacity.reason}）`);
    if (capacity.overBy > 0)
      return fail(`支配下登録枠（${MAX_SHIHAKA_TOTAL}人）を超えます`);
  }
  return { ok: true, teams: teams.map(t => {
    const picks = assignments.get(String(t.id));
    emitCpuDecision({type:'draft-complete',teamId:t.id,year,controlledBefore:registeredDraftCount(t),controlledAfter:registeredDraftCount(t)+picks.length,
      pickIds:picks.map(p=>p.id),committedRookiePayroll:picks.reduce((n,p)=>n+Math.max(MIN_SALARY_SHIHAKA,p.salary||0),0),
      immediateSpending:0,budget:t.budget});
    return !picks.length ? t : { ...t, farm: [...(t.farm || []), ...picks.map(p => ({ ...p,
      育成: false, isIkusei: false, salary: Math.max(MIN_SALARY_SHIHAKA, Number.isFinite(p.salary) ? p.salary : MIN_SALARY_SHIHAKA),
      contractYears: 1, contractYearsLeft: 1, contractSignedYear: year, ikuseiYears: 0 }))] };
  }) };
}
