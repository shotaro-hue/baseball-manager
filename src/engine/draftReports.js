import { clamp } from '../utils';

export const DRAFT_EVALUATION_VERSION = 1;
export const DRAFT_SKILLS = {
  velocity: '球速能力', control: '制球', breaking: '変化球', stamina: 'スタミナ',
  contact: 'ミート', power: '長打', eye: '選球', speed: '走力',
  defense: '守備', catching: '捕球', arm: '送球',
};
const order = (a,b) => String(a.id).localeCompare(String(b.id));
const idsOf = pool => [...pool].sort(order).map(p=>p.id);
const numeric = (n, fallback=50) => Number.isFinite(n) ? n : fallback;

// Stable observation, not a new game-event draw: opening a report never consumes RNG.
function noise(key) {
  let hash = 2166136261;
  for (const c of String(key)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  hash=Math.imul(hash ^ (hash>>>16),0x85ebca6b);
  hash=Math.imul(hash ^ (hash>>>13),0xc2b2ae35);
  hash^=hash>>>16;
  return (hash >>> 0) / 4294967295 * 2 - 1;
}
function weights(p) {
  if(p.isPitcher) return (p.subtype || p.pos)==='先発'
    ? { velocity:.26, control:.26, breaking:.24, stamina:.24 }
    : { velocity:.36, control:.28, breaking:.30, stamina:.06 };
  if(p.pos==='捕手') return { contact:.15, power:.1, eye:.1, speed:.05, defense:.2, catching:.25, arm:.15 };
  if(['遊撃手','二塁手','中堅手'].includes(p.pos)) return { contact:.23,power:.14,eye:.14,speed:.19,defense:.24,arm:.06 };
  return { contact:.3,power:.28,eye:.2,speed:.1,defense:.08,arm:.04 };
}
// Owned abilities are known; candidates must keep using their observed report.
export function ownedDraftCurrent(player) {
  const values=player.isPitcher ? player.pitching : player.batting;
  return Object.entries(weights(player)).reduce((sum,[key,weight])=>sum+numeric(values?.[key])*weight,0);
}

function observe(p, year, observer, width) {
  const keys = Object.keys(weights(p));
  const values = p.isPitcher ? p.pitching : p.batting;
  const estimate = (trueValue, key, range) => {
    const shared = noise(`${year}/${p.id}/${key}/public`);
    const independent = noise(`${year}/${p.id}/${key}/${observer}`);
    const error = observer==='public' ? shared : shared*.35 + independent*.65;
    const value = clamp(Math.round(numeric(trueValue) + error*range), 1, 99);
    return { value, low: Math.max(1,value-range), high: Math.min(99,value+range) };
  };
  const skills = Object.fromEntries(keys.map(k=>[k,estimate(values?.[k],k,width)]));
  const current = Math.round(keys.reduce((sum,k)=>sum+skills[k].value*weights(p)[k],0));
  const futureEstimate = estimate(numeric(p.potential,60),'future',Math.max(5,width+4));
  const sorted = [...keys].sort((a,b)=>skills[b].value-skills[a].value || a.localeCompare(b));
  const strength = DRAFT_SKILLS[sorted[0]], weakness = DRAFT_SKILLS[sorted.at(-1)];
  return { skills, current, future: futureEstimate.value, futureEstimate,
    value: current*.65+futureEstimate.value*.35, uncertainty: width,
    confidence: width<=9?'高':width<=12?'中':'低', strength, weakness,
    role: p.isPitcher ? (p.subtype || p.pos || '投手') : p.pos,
    summary: `${strength}が強み。${weakness}は追加確認したい`,
    currentRange: [Math.max(1,current-width),Math.min(99,current+width)],
  };
}
export const draftReport = (session,id,teamId) => teamId==null ? session?.public?.[id] : session?.teams?.[teamId]?.[id];
export const draftBand = value => value>=80?'非常に高い':value>=70?'高い':value>=60?'標準以上':value>=50?'標準':'育成が必要';
// Public observations are immutable within a conference. Private scouting can
// replace the session while keeping this map, so rank once per public map.
const publicTierCache=new WeakMap();
export function publicDraftTier(session,id) {
  const source=session?.public;
  if(!source || typeof source!=='object')return '評価不明';
  let tiers=publicTierCache.get(source);
  if(!tiers){
    const reports=Object.entries(source).sort((a,b)=>b[1].value-a[1].value || a[0].localeCompare(b[0]));
    tiers=new Map(reports.map(([key],index)=>[key,index===0&&reports.length>1&&reports[0][1].value-reports[1][1].value>=8?'突出した目玉':index<12?'1位候補':index<36?'上位候補':'中下位候補']));
    publicTierCache.set(source,tiers);
  }
  return tiers.get(String(id)) || '評価不明';
}
export function draftClassSummary(session) {
  const sorted=Object.values(session?.public || {}).sort((a,b)=>b.value-a.value);
  if(!sorted.length) return '候補情報を確認できません。';
  const gap=sorted.length>1?sorted[0].value-sorted[1].value:0;
  return gap>=8 ? '公開評価で突出した候補がいる年。競合を受け入れる価値と代替候補を比較したい。'
    : '上位候補の公開評価は接近。球団との相性と、確保できる見込みを比較したい。';
}
const normalizedAllocation = allocation => {
  const pitcher=clamp(Math.round(numeric(allocation?.pitcher,50)),10,90);
  return { pitcher,batter:100-pitcher };
};
function refine(session,pool,id) {
  const p=pool.find(p=>String(p.id)===String(id));
  if(!p) return session;
  const width=p.fromScout?0:Math.round(10*(1-session.allocation[p.isPitcher?'pitcher':'batter']/200));
  const mine={...session.teams[session.myId],[p.id]:observe(p,session.year,`team-${session.myId}`,width)};
  return {...session,scouted:[...new Set([...session.scouted,p.id])],teams:{...session.teams,[session.myId]:mine}};
}
export function ensureDraftEvaluation({ existing, teams=[],pool=[],year,myId,allocation,legacy={} }) {
  const candidateIds=idsOf(pool), teamIds=teams.map(t=>String(t.id)).sort();
  const sameIdentity=existing?.version===DRAFT_EVALUATION_VERSION && existing.year===year && String(existing.myId)===String(myId)
    && JSON.stringify(existing.candidateIds)===JSON.stringify(candidateIds);
  const usable=r=>r&&Number.isFinite(r.current)&&Number.isFinite(r.future)&&Number.isFinite(r.value)&&r.skills&&Array.isArray(r.currentRange);
  const valid=sameIdentity && Array.isArray(existing.scouted) && existing.snapshots && Number.isFinite(existing.points)
    && existing.allocation && typeof existing.locked==='boolean'
    && teamIds.every(id=>candidateIds.every(pid=>usable(existing.teams?.[id]?.[pid])))
    && candidateIds.every(id=>usable(existing.public?.[id]));
  if(valid) return existing;
  const sorted=[...pool].sort(order);
  const known=sameIdentity?existing:null;
  let session={version:DRAFT_EVALUATION_VERSION,year,myId,candidateIds,
    allocation:normalizedAllocation(known?.allocation || allocation),locked:known?.locked===true,
    points:clamp(Math.floor(numeric(known?.points,numeric(legacy.scoutPt,5))),0,5),
    scouted:(Array.isArray(known?.scouted)?known.scouted:legacy.scouted || []).filter(id=>candidateIds.some(pid=>String(pid)===String(id))),
    snapshots:{...(known?.snapshots || {})},public:{},teams:{}};
  for(const p of sorted) session.public[p.id]=usable(known?.public?.[p.id])?known.public[p.id]:observe(p,year,'public',10);
  for(const t of [...teams].sort(order)) session.teams[t.id]=Object.fromEntries(sorted.map(p=>{
    const saved=known?.teams?.[t.id]?.[p.id];
    const detailed=String(t.id)===String(myId)&&(p.fromScout||session.scouted.some(id=>String(id)===String(p.id)));
    const width=detailed?(p.fromScout?0:Math.round(10*(1-session.allocation[p.isPitcher?'pitcher':'batter']/200))):18;
    return [p.id,usable(saved)?saved:observe(p,year,`team-${t.id}`,width)];
  }));
  if(!session.teams[myId]) session.teams[myId]={};
  // Preserve valid observations; only legacy known reports still need refinement.
  if(!known)for(const p of sorted) if(p.fromScout || session.scouted.some(id=>String(id)===String(p.id))) session=refine(session,pool,p.id);
  return session;
}
export function startDraftEvaluation(session,pool,allocation=session.allocation) {
  if(session.locked) return session;
  let next={...session,locked:true,allocation:normalizedAllocation(allocation)};
  for(const isPitcher of [true,false]) {
    const targets=pool.filter(p=>!!p.isPitcher===isPitcher && !p.fromScout)
      .sort((a,b)=>draftReport(next,b.id).value-draftReport(next,a.id).value || order(a,b))
      .slice(0,Math.round(next.allocation[isPitcher?'pitcher':'batter']/100*8));
    for(const p of targets) next=refine(next,pool,p.id);
  }
  // Already known legacy/manual reports retain their status at the locked precision.
  for(const id of session.scouted) next=refine(next,pool,id);
  return next;
}
export function scoutDraftCandidate(session,pool,id) {
  if(!session.locked || session.points<=0 || session.scouted.some(x=>String(x)===String(id))) return session;
  const p=pool.find(p=>String(p.id)===String(id));
  if(!p || p._drafted) return session;
  return {...refine(session,pool,p.id),points:session.points-1};
}
export function rememberDraftReport(session,id) {
  if(!session || session.snapshots[id]) return session;
  const report=draftReport(session,id,session.myId);
  if(!report) return session;
  return {...session,snapshots:{...session.snapshots,[id]:{report:structuredClone(report),publicTier:publicDraftTier(session,id)}}};
}
