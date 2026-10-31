import { fmtAvg, fmtIP } from '../utils';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';

export const UNKNOWN_CAREER_STAT = '— 未記録';
const available = (s, keys) => keys.every(key => Number.isFinite(s?.[key]));
export const careerCount = value => Number.isFinite(value) ? value : UNKNOWN_CAREER_STAT;
export const careerAverage = s => available(s, ['H', 'AB']) ? fmtAvg(s.H, s.AB)
  : Number.isFinite(s?.AVG) && (s.AVG > 0 || s.recording === 'observed') ? fmtAvg(s.AVG, 1) : UNKNOWN_CAREER_STAT;
export const careerInnings = value => Number.isFinite(value) ? fmtIP(value) : UNKNOWN_CAREER_STAT;
export const careerRateText = value => Number.isFinite(value) ? value.toFixed(2) : UNKNOWN_CAREER_STAT;

const battingInputs = {
  AVG: ['H', 'AB'],
  wOBA: ['AB', 'H', 'D', 'T', 'HR', 'BB', 'HBP', 'SF'],
  WAR: ['AB', 'H', 'D', 'T', 'HR', 'BB', 'HBP', 'SF', 'PA'],
};
const pitchingInputs = {
  ERA: ['IP', 'ER'], WHIP: ['IP', 'BBp', 'Hp'],
  FIP: ['IP', 'HRp', 'BBp', 'HBPp', 'Kp'],
  WAR: ['IP', 'HRp', 'BBp', 'HBPp', 'Kp'],
};
export function careerMetric(stats, key, pitcher = false) {
  // Positive stored rates remain usable for legacy incomplete records. Zero
  // rates need observed counts because old saves used zero for absent rates.
  if (['AVG', 'ERA', 'WHIP'].includes(key) && Number.isFinite(stats?.[key]) && (stats[key] > 0 || stats.recording === 'observed')) return stats[key];
  const keys = (pitcher ? pitchingInputs : battingInputs)[key];
  if (!keys || !available(stats, keys)) return null;
  return (pitcher ? saberPitcher(stats) : saberBatter(stats))[key];
}
export function sumCareerStat(rows, key) {
  // Keep legacy omitted fields' behavior, but never add an explicitly unknown
  // imported observation as zero or present a partial sum as a career total.
  return rows.some(s => s?.[key] === null) ? null : rows.reduce((sum, s) => sum + (s?.[key] || 0), 0);
}

// Imported counts can include a zero-out appearance with runs/hits/walks.
// Add those numerators before dividing; a weighted yearly rate would lose them.
export function totalCareerPitchingRate(rows, key) {
  let numerator = 0, innings = 0;
  const components = key === 'ERA' ? ['ER'] : ['BBp', 'Hp'];
  for (const s of rows) {
    if (s.IP === null) return null;
    const ip = Number(s.IP) || 0;
    if (s.recording === 'observed' && available(s, components)) {
      numerator += key === 'ERA' ? s.ER * 9 : s.BBp + s.Hp;
    } else if (ip > 0) {
      const rate = careerMetric(s, key, true);
      if (!Number.isFinite(rate)) return null;
      numerator += rate * ip;
    } else if (s.recording === 'observed') return null;
    innings += ip;
  }
  return innings > 0 ? numerator / innings : null;
}
