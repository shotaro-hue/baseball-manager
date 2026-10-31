import { saberBatter } from '../engine/sabermetrics';

const keys = ['AB', 'H', 'D', 'T', 'HR', 'BB', 'HBP', 'SF'];
const available = s => keys.every(k => Number.isFinite(s?.[k]) && s[k] >= 0);
// Old imported compact records may have zero-filled HBP/SF/SH. An unexplained
// PA remainder is evidence that these are not complete recorded counts.
function complete(s) {
  if (!available(s)) return false;
  const accounted = s.AB + s.BB + s.HBP + s.SF + (Number.isFinite(s.SH) ? s.SH : 0);
  return !(Number.isFinite(s.PA) && s.PA > 0 && s.PA !== accounted);
}
const result = (value, reason, source) => ({ value, display: value == null ? `— ${reason}` : value.toFixed(3), source });

export function careerOps(s) {
  if (complete(s)) {
    if (!(s.AB > 0)) return result(null, '算出不可');
    return result(saberBatter(s).OPS, null, 'counts');
  }
  // Compact history used 0 for absent rates, so only a positive saved OPS is
  // unambiguously recorded when its source counts are incomplete.
  const stored = s?.OPS;
  if (Number.isFinite(stored) && (stored > 0 || (stored === 0 && s.recording === 'observed'))) return result(stored, null, 'stored');
  return result(null, '未記録');
}

export function careerTotalOps(rows) {
  // Do not silently zero-fill a missing season or average yearly OPS. A total
  // is confirmed only when every row has its component counts available.
  if (!rows.every(complete)) return result(null, '未記録');
  const totals = Object.fromEntries(keys.map(k => [k, rows.reduce((sum,s) => sum + s[k], 0)]));
  return careerOps(totals);
}
