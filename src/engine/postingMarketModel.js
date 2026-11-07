import { rng, rngf } from '../utils';
import { economyRandomContext } from './economyRandom';
import { assessSalaryPerformance } from './salaryDemand';

// USD scale is calibrated against published NPB -> MLB contracts, not an NPB
// salary multiplier. Keep v1 replayable when introducing a future policy.
export const POSTING_MARKET_POLICY = 'posting-mlb-scale-v1';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const id = n => typeof n === 'string' && n.trim().length > 0 || Number.isSafeInteger(n) && n >= 0;
const rating = n => Number.isFinite(n) && n >= 0 && n <= 100;
const money = n => Number.isSafeInteger(n) && n >= 0;
const stable = v => JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const fail = () => { throw Error('海外市場の評価資料・価格モデルを確認してください。'); };
export function inspectPostingMarketInputs(f) {
  if (f?.version !== 1 || ![f.requestId, f.qualificationId, f.teamId, f.playerId, f.sourceContractId].every(id)
    || !(f.sourcePlayerId === null || id(f.sourcePlayerId)) || !Number.isInteger(f.season) || f.season < 1 || f.season > 9999
    || f.date !== `${String(f.season).padStart(4, '0')}-12-01` || !Number.isInteger(f.ageYears) || f.ageYears < 0
    || !['exempt', 'restricted'].includes(f.exemption) || !['batter', 'starter', 'relief'].includes(f.role)
    || ![f.position, f.subtype].every(v => v === null || typeof v === 'string')) fail();
  const fields = f.role === 'batter' ? ['contact', 'power', 'eye'] : ['velocity', 'control', 'breaking', 'stamina'];
  if (!f.abilities || Object.keys(f.abilities).length !== fields.length || !fields.every(k => rating(f.abilities[k]))) fail();
  for (const r of [f.potential, ...['overseas', 'money', 'loyalty', 'stability', 'future', 'playing'].map(k => f.personality?.[k])]) {
    if (!r || !(r.recorded === true && rating(r.value) || r.recorded === false && r.value === null)) fail();
  }
  const player = { isPitcher: f.role !== 'batter', pos: f.position, subtype: f.subtype };
  if (!Array.isArray(f.performance) || !f.performance.length || f.performance.length > 3) fail();
  let previous = f.season + 1;
  const counters = f.role === 'batter' ? ['PA', 'AB', 'H', 'BB', 'HBP', 'SF', 'D', 'T', 'HR'] : ['IP', 'ER', 'Kp', 'BBp', 'G', 'GS', 'SV', 'HLD'];
  for (const r of f.performance) {
    if (!Number.isInteger(r.season) || r.season < f.season - 2 || r.season >= previous
      || r.source !== (r.season === f.season ? 'current-season' : 'saved-career')
      || !counters.every(k => r.stats?.[k] === null || Number.isFinite(r.stats?.[k]) && r.stats[k] >= 0)
      || stable(r.assessment) !== stable(assessSalaryPerformance(player, r.stats))) fail();
    previous = r.season;
  }
  if (f.performance[0].season !== f.season || !money(f.npb?.annualSalaryManYen)
    || !Number.isInteger(f.npb.endSeason) || f.npb.endSeason < f.season || f.npb.endSeason > 9999
    || !['guaranteed', 'not-guaranteed', 'unknown'].includes(f.npb.guaranteeStatus)
    || !Array.isArray(f.npb.retainedCostsBySeason)) fail();
  previous = f.season;
  for (const r of f.npb.retainedCostsBySeason) {
    if (!Number.isInteger(r.season) || r.season <= previous || !money(r.amountManYen)) fail();
    previous = r.season;
  }
  return f;
}

function scouting(f) {
  const a = f.abilities;
  const raw = f.role === 'batter' ? .4 * a.contact + .35 * a.power + .25 * a.eye
    : f.role === 'starter' ? .25 * a.velocity + .3 * a.control + .25 * a.breaking + .2 * a.stamina
      : .35 * a.velocity + .3 * a.control + .3 * a.breaking + .05 * a.stamina;
  let sum = 0, weights = 0;
  for (const r of f.performance) if (r.assessment?.workload > 0) {
    const w = [1, .65, .4][f.season - r.season] * Math.min(1, r.assessment.workload);
    sum += w * r.assessment.quality; weights += w;
  }
  const performanceAdjustment = weights ? clamp((sum / weights - .8) * 8, -6, 8) * Math.min(1, weights) : 0;
  const potentialAdjustment = f.ageYears < 27 && f.potential.recorded ? Math.max(0, f.potential.value - 60) * .06 : 0;
  const scoutScore = raw + performanceAdjustment + potentialAdjustment;
  const excess = scoutScore - ({ batter: 50, starter: 65, relief: 62 }[f.role]);
  const interestProbability = clamp(.04 + (excess + 6) * .045 - Math.max(0, f.ageYears - 32) * .03, .02, .98);
  return { raw, performanceAdjustment, potentialAdjustment, scoutScore, excess, interestProbability };
}
function terms(f, a, context) {
  if (f.exemption === 'exempt' && a.excess >= 0) {
    let years = f.ageYears <= 26 ? clamp(2 + Math.floor((a.excess - 1) / 3), 1, 7)
      : f.ageYears <= 30 ? clamp(2 + Math.floor(a.excess / 5), 1, 5)
        : f.ageYears <= 34 ? clamp(1 + Math.floor(a.excess / 7), 1, 3) : 1;
    if (f.ageYears <= 26 && a.excess >= 24) years = 12;
    years = Math.max(1, Math.min(years, 37 - f.ageYears, f.role === 'relief' ? f.ageYears >= 30 ? 3 : 5 : 12));
    const baseUsd = f.role === 'batter' ? 1.8e6 : 1e6;
    const annualUsd = Math.round(clamp(baseUsd * 2 ** (a.excess / 4.5) * rngf(.85, 1.15, context)
      * .93 ** Math.max(0, f.ageYears - 30), 1e6, f.role === 'relief' ? 16e6 : 35e6) / 50000) * 50000;
    return { kind: 'major', years, guaranteedUsdCents: Math.min(325e6, annualUsd * years) * 100 };
  }
  const restricted = f.exemption === 'restricted';
  const unit = restricted ? 10000 : 1000, cap = restricted ? 6.5e6 : 100000;
  const bonus = (restricted ? 25000 * 2 ** ((a.excess + 8) / 3.5) : 10000 * 2 ** ((a.excess + 6) / 4)) * rngf(.85, 1.15, context);
  // A calibration bound, not a claim about each MLB club's bonus pool.
  return { kind: 'minor', years: 1, signingBonusUsdCents: Math.round(clamp(bonus, 0, cap) / unit) * unit * 100 };
}
function acceptance(f, offer, preference) {
  const trait = k => f.personality[k].recorded ? f.personality[k].value : 50;
  const moneyWeight = .15 + trait('money') * .003;
  const retainedComparableManYen = f.npb.retainedCostsBySeason.filter(r => r.season <= f.season + offer.years)
    .reduce((n, r) => n + r.amountManYen, 0);
  // Retained NPB liabilities are paid in either choice. Compare only additional
  // future stay earnings against the MLB guarantee/bonus, at the existing FX150.
  const stayUncontractedManYen = f.npb.annualSalaryManYen * Math.max(0, offer.years - (f.npb.endSeason - f.season));
  const overseasManYen = (offer.guaranteedUsdCents ?? offer.signingBonusUsdCents) * 150 / 1e6;
  const moneyScore = stayUncontractedManYen === 0 ? overseasManYen > 0 ? 100 : 50
    : clamp(50 + 25 * Math.log2((overseasManYen + .015) / (stayUncontractedManYen + .015)), 0, 100);
  const opportunityScore = offer.kind === 'major' ? 75 : f.ageYears <= 24 && f.potential.recorded && f.potential.value >= 70 ? 50 : 35;
  const score = clamp(.4 * preference.value + moneyWeight * moneyScore + (.6 - moneyWeight) * opportunityScore
    - (trait('loyalty') - 50) * .12 - trait('stability') * (offer.kind === 'minor' ? .15 : .03), 0, 100);
  return { score, threshold: 60, moneyScore, opportunityScore, stayUncontractedManYen, retainedComparableManYen,
    guaranteeStatus: f.npb.guaranteeStatus,
    neutralTraits: ['money', 'loyalty', 'stability'].filter(k => !f.personality[k].recorded) };
}
export function evaluatePostingMarket(inputs, root, scope) {
  const f = inspectPostingMarketInputs(inputs);
  if (scope?.season !== f.season || scope.subjectId !== f.playerId || scope.operationId !== f.requestId) fail();
  const interest = economyRandomContext(root, scope, 'posting:interest:v1');
  const price = economyRandomContext(root, scope, 'posting:price:v1');
  const estimated = economyRandomContext(root, { ...scope, operationId: 'posting-preference' }, 'posting:preference:v1');
  const preference = f.personality.overseas.recorded ? { source: 'recorded', value: f.personality.overseas.value }
    : { source: 'game-estimate', value: rng(0, 100, estimated) };
  const assessment = { ...scouting(f), interestDraw: rngf(0, 1, interest) };
  const offer = assessment.interestDraw < assessment.interestProbability ? terms(f, assessment, price) : null;
  const decision = offer ? acceptance(f, offer, preference) : null;
  return { version: 1, policyVersion: POSTING_MARKET_POLICY,
    outcome: !offer ? 'no-offer' : decision.score >= decision.threshold ? 'signed' : 'declined',
    assessment, preference, offer, acceptance: decision };
}
