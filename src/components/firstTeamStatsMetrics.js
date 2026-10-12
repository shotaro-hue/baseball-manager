import { fmtAvg, fmtIP, fmtPct } from '../utils';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';
import { inningsToOuts } from '../engine/analysisComparison';

const battingBase = ['AB', 'H', 'D', 'T', 'HR', 'BB', 'HBP', 'SF'];
const pitchingFip = ['IP', 'HRp', 'BBp', 'HBPp', 'Kp'];
const definitions = {
  AVG: { keys: ['AB', 'H'], denominator: s => s.AB, value: s => s.H / s.AB, format: (_,s) => fmtAvg(s.H,s.AB) },
  OPS: { keys: battingBase, denominator: s => s.AB, decimals: 3 },
  wOBA: { keys: battingBase, denominator: s => s.AB+s.BB+s.HBP+s.SF, decimals: 3 },
  wRCp: { keys: battingBase, denominator: s => s.AB+s.BB+s.HBP+s.SF },
  ISO: { keys: ['AB','H','D','T','HR'], denominator: s => s.AB, decimals: 3 },
  BABIP: { keys: ['AB','H','K','HR','SF'], denominator: s => s.AB-s.K-s.HR+s.SF, decimals: 3 },
  BBpct: { keys: ['PA','BB'], pitcherKeys: ['BF','BBp'], denominator: (s,p) => p ? s.BF : s.PA, format: fmtPct },
  Kpct: { keys: ['PA','K'], pitcherKeys: ['BF','Kp'], denominator: (s,p) => p ? s.BF : s.PA, format: fmtPct },
  EVavg: { keys: ['evN','evSum'], denominator: s => s.evN, decimals: 1 },
  LAavg: { keys: ['laN','laSum'], denominator: s => s.laN, decimals: 1 },
  IP: { keys: ['IP'], value: s => inningsToOuts(s.IP), format: (_,s) => fmtIP(s.IP) },
  ERA: { keys: ['IP','ER'], denominator: s => s.IP, decimals: 2 },
  WHIP: { keys: ['IP','BBp','Hp'], denominator: s => s.IP, decimals: 2 },
  FIP: { keys: pitchingFip, denominator: s => s.IP },
  xFIP: { keys: ['IP','BF','BBp','HBPp','Kp'], denominator: s => s.IP },
  WAR: { keys: [...battingBase,'PA'], pitcherKeys: pitchingFip, denominator: (s,p) => p ? s.IP : Math.min(s.PA,s.AB+s.BB+s.HBP+s.SF) },
};

// Read-only presentation guards; saber calculations and rounding stay unchanged.
export function firstTeamMetric(player, key) {
  const s = player.stats || {}, p = Boolean(player.isPitcher), definition = definitions[key] || { keys: [key], value: s => s[key] };
  const keys = p && definition.pitcherKeys ? definition.pitcherKeys : definition.keys;
  const missing = reason => ({ value: null, display: `— ${reason}` });
  if (keys.some(k => !Number.isFinite(s[k]))) return missing('未記録');
  if (keys.some(k => s[k] < 0 && k !== 'laSum')) return missing('不正値');
  if (definition.denominator && !(definition.denominator(s,p) > 0)) return missing('算出不可');
  const value = definition.value ? definition.value(s) : (p ? saberPitcher(s) : saberBatter(s))[key];
  if (!Number.isFinite(value)) return missing('未記録');
  const display = definition.format ? definition.format(value,s) : definition.decimals != null ? value.toFixed(definition.decimals) : value;
  return { value, display };
}

const roleOrder = ['先発','中継ぎ','セットアッパー','抑え'];
const column = (key,label,advanced=false) => ({ key,label,advanced, value: p => firstTeamMetric(p,key).value, render: p => firstTeamMetric(p,key).display });
export const BATTER_COLUMNS = [
  column('OPS','OPS'),column('AVG','打率'),column('HR','本塁打'),column('RBI','打点'),column('PA','打席'),column('WAR','WAR'),
  column('wOBA','wOBA',true),column('wRCp','wRC+',true),column('ISO','ISO',true),column('BABIP','BABIP',true),
  column('BBpct','四球率',true),column('Kpct','三振率',true),column('EVavg','打球速度',true),column('LAavg','打球角度',true),column('SB','盗塁',true),
];
const ROLE_COLUMN = { key:'role', label:'役割', className:'text-cell', value: p => { const i=roleOrder.findIndex(r => String(p.subtype || '').includes(r)); return i >= 0 ? i : null; }, render: p => p.subtype || '— 未記録' };
export const PITCHER_COLUMNS = [
  column('ERA','防御率'),column('IP','投球回'),column('WHIP','WHIP'),column('Kp','奪三振'),column('W','勝'),column('L','敗'),column('WAR','WAR'),ROLE_COLUMN,
  column('SV','S',true),column('HLD','H',true),column('QS','QS',true),column('FIP','FIP',true),column('xFIP','xFIP',true),column('Kpct','三振率',true),column('BBpct','四球率',true),
];
