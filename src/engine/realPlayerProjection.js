import { MIN_SALARY_SHIHAKA, MIN_SALARY_IKUSEI, FIELDING_POSITIONS } from '../constants';

export const OPENING_DATE = '2026-03-27';
export const RATINGS_THROUGH = 2025;
const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

// Encoding is mandatory: 12.1 in baseball notation is not 12.1 decimal innings.
export function inningsToOuts(value, encoding) {
  let outs;
  if (encoding === 'baseball') {
    const m = String(value).match(/^(\d+)(?:\.([012]))?$/);
    if (m) outs = Number(m[1])*3+Number(m[2]||0);
  } else if (encoding === 'fraction') {
    const m = String(value).match(/^(?:(\d+)\s+)?([12])\/3$/);
    if (m) outs = Number(m[1]||0)*3+Number(m[2]);
  } else if (encoding === 'decimal' && valid(value) && Math.abs(value*3-Math.round(value*3))<1e-7) outs=Math.round(value*3);
  if (!Number.isSafeInteger(outs) || outs < 0) throw new Error(`invalid innings (${encoding}): ${value}`);
  return outs;
}

export function ageOnOpeningDate(birthDate) {
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error('invalid birthDate');
  const timestamp=Date.parse(`${birthDate}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0,10)!==birthDate || birthDate>OPENING_DATE) throw new Error('invalid birthDate');
  return 2026-Number(birthDate.slice(0,4))-(birthDate.slice(5)>OPENING_DATE.slice(5)?1:0);
}

// Rate shrinkage is a game model, never written back as observed performance.
// 2025/2024/2023 exposure weights: 1/.65/.35. Missing counts are not zero.
const weight = row => ({2025:1,2024:.65,2023:.35})[row.year]||0;
function rate(rows, numerator, denominator, prior, exposure) {
  let n=prior*exposure,d=exposure;
  for (const row of rows) {
    const a=numerator(row),b=denominator(row);
    // A pitcher can concede runs without recording an out. The prior keeps
    // the denominator positive, so those observed counts must still contribute.
    if (!valid(a)||!valid(b)) continue;
    n+=a*weight(row);d+=b*weight(row);
  }
  return n/d;
}

function projectBatting(rows) {
  const avg=rate(rows,h=>h.H,h=>h.AB,.25,200);
  const bb=rate(rows,h=>h.BB,h=>h.PA,.08,250);
  const hr=rate(rows,h=>h.HR,h=>h.PA,.022,250);
  const so=rate(rows,h=>h.SO,h=>h.PA,.21,250);
  const sb=rate(rows,h=>h.SB,h=>h.PA,5/600,200);
  const obp=rate(rows,h=>valid(h.OBP)?h.OBP*h.PA:undefined,h=>h.PA,.32,250);
  const slg=rate(rows,h=>[h.H,h['2B'],h['3B'],h.HR].every(valid)?h.H+h['2B']+2*h['3B']+3*h.HR:valid(h.SLG)?h.SLG*h.AB:undefined,h=>h.AB,.39,200);
  return {AVG:avg,OBP:obp,SLG:slg,OPS:obp+slg,PA:600,BB:bb*600,HR:hr*600,SO:so*600,SB:sb*600};
}

function projectPitching(rows) {
  const ip=h=>Number.isInteger(h.outs)&&h.outs>=0?h.outs/3:h.IP;
  const k9=rate(rows,h=>h.SO,ip,7.5/9,45)*9;
  const bb9=rate(rows,h=>h.BB,ip,3.2/9,45)*9;
  const era=rate(rows,h=>valid(h.ER)?h.ER:valid(h.ERA)?h.ERA*ip(h)/9:undefined,ip,4/9,45)*9;
  const whip=rate(rows,h=>valid(h.H)&&valid(h.BB)?h.H+h.BB:valid(h.WHIP)?h.WHIP*ip(h):undefined,ip,1.35,45);
  const recentYear=Math.max(0,...rows.map(h=>h.year));
  const latest=rows.filter(h=>h.year===recentYear);
  const sum=key=>latest.reduce((n,h)=>n+(valid(h[key])?h[key]:0),0);
  const innings=latest.reduce((n,h)=>n+(valid(ip(h))?ip(h):0),0);
  const role=sum('GS')>=3&&sum('GS')>=sum('G')*.4?'先発':sum('SV')>=10?'抑え':'中継ぎ';
  return {stats:{ERA:era,WHIP:whip,IP:innings||45,SO:k9*(innings||45)/9,BB:bb9*(innings||45)/9},role};
}

/** Called only when constructing new players. Never used to normalize a saved player. */
export function prepareRealPlayer(input, kind) {
  const history=(input.history||[]).filter(h=>Number.isInteger(h.year)&&h.year<=RATINGS_THROUGH&&h.year>=1936)
    .map(h=>({...h,...(Number.isInteger(h.outs)&&h.outs>=0?{IP:h.outs/3}:{})}));
  const recent=history.filter(h=>h.year>=2023);
  const dataQuality={...input.dataQuality,abilities:recent.length?'game-estimate-pre-opening':'game-estimate-no-history'};
  let pos=input.pos;
  if (kind==='pitcher') pos=['verified','game-estimate-pre-opening'].includes(input.roleStatus)?input.pos:projectPitching(recent).role;
  else if (!FIELDING_POSITIONS.includes(pos)) {pos=['捕手','C'].includes(pos)?'捕手':['内野手','IF'].includes(pos)?'一塁手':'左翼手';dataQuality.position='game-assumption';}
  else dataQuality.position ??= input.positions?'provided':'legacy-unverified';
  const development=Boolean(input.育成||input.isIkusei||input.registration==='development');
  const salary=valid(input.salary)&&input.salary>0?input.salary:development?MIN_SALARY_IKUSEI:MIN_SALARY_SHIHAKA;
  dataQuality.salary ??=valid(input.salary)&&input.salary>0?'legacy-unverified':'game-assumption';
  const age=input.birthDate?ageOnOpeningDate(input.birthDate):input.age??23;
  dataQuality.age ??=input.birthDate?'birth-date':'legacy-unverified';
  const days=Number.isInteger(input.daysOnActiveRoster)&&input.daysOnActiveRoster>=0?input.daysOnActiveRoster:0;
  dataQuality.serviceTime ??=Number.isInteger(input.daysOnActiveRoster)&&input.daysOnActiveRoster>=0?'provided':'game-baseline-unknown';
  dataQuality.foreignQuota ??=input.foreignQuotaStatus&&input.foreignQuotaStatus!=='unknown'?'provided':'legacy-unverified';
  const isForeign=input.foreignQuotaStatus==='counts'?true:['domestic','exempt'].includes(input.foreignQuotaStatus)?false:Boolean(input.isForeign);
  return {...input,history,pos,sourcePosition:input.pos,age,salary,isForeign,
    isIkusei:development,育成:development,
    stats:kind==='pitcher'?projectPitching(recent).stats:projectBatting(recent),
    daysOnActiveRoster:days,serviceYears:Number.isInteger(input.serviceYears)&&input.serviceYears>=0?input.serviceYears:0,
    entryAge:input.entryAge??age,entryType:input.entryType??'不明',
    dataQuality,ratingsThrough:RATINGS_THROUGH};
}
