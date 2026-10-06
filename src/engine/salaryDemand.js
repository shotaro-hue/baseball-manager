import { MIN_SALARY_SHIHAKA, MIN_SALARY_IKUSEI } from '../constants';
import { salaryCutRule } from './renewalRules';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const measured = (s, keys) => keys.every(k => Number.isFinite(s?.[k]) && s[k] >= 0);
const roundSalary = n => Math.round(n / 100) * 100;

export const SALARY_MODEL = {
  adjustment: .4,
  batterBase: 12000,
  pitcherBase: 9000,
  titleBonusCap: .25,
  teamBonusCap: .05,
};

export function renewalSalaryFloor(player) {
  const minimum = player.育成 ? MIN_SALARY_IKUSEI : MIN_SALARY_SHIHAKA;
  const previous = Number.isFinite(player.salary) ? Math.max(minimum, player.salary) : minimum;
  const cut = salaryCutRule({ salary: previous }).rate;
  // Round upward so the cut limit cannot be exceeded by rounding.
  return Math.max(minimum, Math.ceil(previous * (1 - cut) / 100) * 100);
}

export function assessSalaryPerformance(player, stats = player.stats) {
  if (!player.isPitcher) {
    if (!measured(stats, ['PA'])) return null;
    if (stats.PA === 0) return { role: '野手', workload: 0, quality: 0, value: 0 };
    if (!measured(stats, ['AB','H','BB','HBP','SF','D','T','HR']) || stats.AB <= 0) return null;
    const denominator = stats.AB + stats.BB + stats.HBP + stats.SF;
    if (denominator <= 0 || stats.H > stats.AB || stats.D + stats.T + stats.HR > stats.H) return null;
    const obp = (stats.H + stats.BB + stats.HBP) / denominator;
    const slg = (stats.H + stats.D + 2 * stats.T + 3 * stats.HR) / stats.AB;
    const workload = clamp(stats.PA / 500, 0, 1.2);
    const quality = clamp(.65 + 4 * (obp - .32) + 1.6 * (slg - .4), .25, 1.8);
    return { role: '野手', workload, quality, value: workload * quality, obp, slg };
  }
  if (!measured(stats, ['IP'])) return null;
  // Actual start/appearance counts take precedence; registered role is a labeled fallback.
  const actualRole = measured(stats, ['G','GS']) && stats.G > 0;
  const relief = actualRole ? stats.GS / stats.G < .5 : /抑え|中継ぎ|救援/.test(player.subtype || player.pos || '');
  const role = relief ? '救援' : '先発';
  if (stats.IP === 0) return { role, roleSource: actualRole ? '登板記録' : '登録上の役割', workload: 0, quality: 0, value: 0 };
  if (!measured(stats, ['ER','Kp','BBp'])) return null;
  const era = stats.ER / stats.IP * 9;
  const k9 = stats.Kp / stats.IP * 9;
  const bb9 = stats.BBp / stats.IP * 9;
  const workload = clamp(stats.IP / (relief ? 60 : 150), 0, 1.2);
  const quality = clamp(.65 + .4 * (4 - era) + .06 * (k9 - 7) - .08 * (bb9 - 3), .25, 1.8);
  // Missing optional saves/holds do not become an invented zero or bonus.
  const reliefBonus = relief && measured(stats, ['SV','HLD']) ? .15 * clamp((stats.SV + stats.HLD) / 40, 0, 1) : 0;
  return { role, roleSource: actualRole ? '登板記録' : '登録上の役割', workload, quality, value: workload * quality * (1 + reliefBonus), era, k9, bb9 };
}

function hasWinner(award, playerId) {
  const winners = Array.isArray(award?.winners) ? award.winners : award ? [award] : [];
  return winners.some(w => w.playerId != null && w.playerId === playerId);
}

export function salaryAwardBonuses(player, context = {}) {
  const awards = context.awards;
  const reasons = [];
  if (awards?.version >= 2 && awards.year === context.year) {
    const league = context.team?.league === 'セ' ? 'central' : context.team?.league === 'パ' ? 'pacific' : null;
    if (league) {
      for (const [label, award, bonus] of [
        ['MVP', awards.mvp?.[league], .15], ['新人王', awards.rookie?.[league], .08], ['沢村賞', awards.sawamura, .12],
      ]) if (hasWinner(award, player.id)) reasons.push({ label, bonus });
      if (Object.values(awards.bestNine?.[league] || {}).some(rows => rows.some(w => w.playerId === player.id))) reasons.push({ label: 'ベストナイン', bonus: .04 });
      const names = { avg: '首位打者', obp: '最高出塁率', hr: '本塁打王', rbi: '打点王', sb: '盗塁王', era: '最優秀防御率', win: '最多勝', winPct: '最高勝率', so: '最多奪三振', sv: '最多セーブ', hld: '最多ホールド' };
      for (const [key, label] of Object.entries(names)) {
        const title = awards.titles?.[league]?.[key];
        if (Number.isFinite(title?.value) && (['avg','obp','era','winPct'].includes(key) || title.value > 0) && hasWinner(title, player.id)) reasons.push({ label, bonus: .04 });
      }
    }
  }
  return { reasons, bonus: Math.min(SALARY_MODEL.titleBonusCap, reasons.reduce((sum, r) => sum + r.bonus, 0)) };
}

export function calculateSalaryDemand(player, context = {}) {
  const minimum = player.育成 ? MIN_SALARY_IKUSEI : MIN_SALARY_SHIHAKA;
  const previous = Number.isFinite(player.salary) ? Math.max(minimum, player.salary) : minimum;
  const floor = renewalSalaryFloor(player);
  const current = assessSalaryPerformance(player);
  const reasons = [];
  if (!current) return { demandSalary: previous, minOfferSalary: floor, minAcceptSalary: floor,
    assessment: { recorded: false, previousSalary: previous, reasons: [{ label: '成績未記録のため前年年俸を維持' }] } };
  const sourceLogs = Array.isArray(player.recentCareerLog) && player.recentCareerLog.length ? player.recentCareerLog : Array.isArray(player.careerLog) ? player.careerLog : [];
  const logs = sourceLogs.filter(row => Number.isFinite(context.year) && row.year < context.year && row.year >= context.year - 2);
  // Combine traded-team entries in the same year, then weight complete recorded seasons only.
  const perYear = new Map();
  for (const row of logs) {
    if (!assessSalaryPerformance(player, row.stats)) continue;
    const existing = perYear.get(row.year);
    if (!existing) perYear.set(row.year, { ...row.stats });
    else for (const key of Object.keys(row.stats)) if (Number.isFinite(row.stats[key]) && Number.isFinite(existing[key])) existing[key] += row.stats[key];
  }
  const recent = [...perYear.values()].map(stats => assessSalaryPerformance(player, stats)).filter(Boolean);
  const historyValue = recent.length ? recent.reduce((s, p) => s + p.value, 0) / recent.length : null;
  // A breakout must not be held down by seasons without appearances; history buffers declines only.
  const value = historyValue == null ? current.value : Math.max(current.value, .75 * current.value + .25 * historyValue);
  reasons.push({ label: `${current.role}の出場量・今季成績`, value: current.value });
  if (historyValue != null && value > current.value) reasons.push({ label: '直近2年の実績で単年の落ち込みを緩和' });
  const titles = salaryAwardBonuses(player, context);
  reasons.push(...titles.reasons);
  let teamBonus = 0;
  const team = context.team;
  if (team && context.teams?.length) {
    const league = context.teams.filter(t => t.league === team.league);
    const pct = t => (t.wins + t.losses) > 0 ? t.wins / (t.wins + t.losses) : 0;
    const best = Math.max(...league.map(pct));
    if (team.wins > 0 && pct(team) === best && league.filter(t => pct(t) === best).length === 1) {
      teamBonus += .03; reasons.push({ label: 'リーグ優勝', bonus: .03 });
    }
  }
  if (context.championship && Number.isFinite(context.year) && context.championship.year === context.year && context.championship.championId === team?.id && team?.id != null) {
    teamBonus += .02; reasons.push({ label: '日本一', bonus: .02 });
  }
  const money = Number.isFinite(player.personality?.money) ? clamp(player.personality.money, 0, 100) : 50;
  const personalityBonus = (money - 50) / 1000; // -5% through +5%, with actual zero retained.
  const workloadFactor = clamp(current.workload / .4, 0, 1);
  const base = current.role === '野手' ? SALARY_MODEL.batterBase : SALARY_MODEL.pitcherBase;
  let target = minimum + base * value * (1 + titles.bonus + Math.min(teamBonus, SALARY_MODEL.teamBonusCap) * workloadFactor);
  target *= 1 + personalityBonus;
  // Do not cut an established player's pay solely because the simplified valuation is lower.
  if (current.workload >= .8 && current.quality >= 1) target = Math.max(previous, target);
  let change = (target - previous) * SALARY_MODEL.adjustment;
  const smallSampleCap = current.workload < .4 ? previous * .25 * current.workload / .4 : null;
  if (change > 0 && smallSampleCap != null) change = Math.min(change, smallSampleCap);
  let demandSalary = Math.max(floor, minimum, roundSalary(previous + change));
  if (change > 0 && smallSampleCap != null) demandSalary = Math.min(demandSalary, Math.max(previous, Math.floor((previous + smallSampleCap) / 100) * 100));
  // Consent can be given beyond the cut boundary; it is not an input floor.
  const minAcceptSalary = Math.min(demandSalary, Math.max(minimum, Math.ceil(demandSalary * .75 / 100) * 100));
  if (money !== 50) reasons.push({ label: '金銭へのこだわり', bonus: personalityBonus });
  return { demandSalary, minOfferSalary: floor, minAcceptSalary,
    assessment: { recorded: true, previousSalary: previous, targetSalary: roundSalary(target), ...current,
      historyYears: perYear.size, titleBonus: titles.bonus, teamBonus, personalityBonus, reasons } };
}
