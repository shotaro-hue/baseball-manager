import { BAT_KEYS, PITCH_KEYS, validateFarmGame } from './farmGame';
import { FARM_MODEL_VERSION, compareFarmIds } from './farmSchedule';
export { BAT_KEYS, PITCH_KEYS };
export const emptyFarmStats = keys => Object.fromEntries(keys.map(k=>[k,0]));
export const addFarmStats = (a,b,keys) => Object.fromEntries(keys.map(k=>[k,(a?.[k]||0)+(b?.[k]||0)]));
export const farmRecordError = detail => {throw new Error(`invalid farm competition: ${detail}`);};
export const farmCount = value => Number.isSafeInteger(value)&&value>=0;
export const farmChecksum = value => {
  const json=JSON.stringify(value);let hash=2166136261;
  for(let i=0;i<json.length;i++) hash=Math.imul(hash^json.charCodeAt(i),16777619);
  return `${json.length}:${hash>>>0}`;
};
export function farmCompetitionSignature(c) {const {integrity,...data}=c;return farmChecksum(data);}
export function sealFarmCompetition(c) {c.integrity=farmCompetitionSignature(c);return c;}
export function validateFarmStats(stats,kind) {
  const keys=kind==='batting'?BAT_KEYS:PITCH_KEYS;
  if(!stats||keys.some(k=>!farmCount(stats[k]))) farmRecordError('missing/nonfinite counter');
  if(stats.GS>stats.G) farmRecordError('GS/G');
  if(kind==='batting') {
    if(stats.HR>stats.H||stats.H>stats.AB||stats.AB>stats.PA||stats.D+stats.T+stats.HR>stats.H
      ||stats.K>stats.AB-stats.H||stats.PA!==stats.AB+stats.BB+stats.HBP||stats.SF||stats.SH) farmRecordError('batting identities');
  } else if(stats.HRp>stats.Hp||stats.BF!==stats.outs+stats.Hp+stats.BBp+stats.HBPp||stats.Kp>stats.outs
    ||stats.ER!==stats.Rallowed||stats.QS>stats.GS||stats.W+stats.L>stats.G) farmRecordError('pitching identities');
}
export function farmTeamTotals(side) {
  return {...side,batting:side.records.reduce((sum,r)=>addFarmStats(sum,r.batting,BAT_KEYS),emptyFarmStats(BAT_KEYS)),
    pitching:side.records.reduce((sum,r)=>addFarmStats(sum,r.pitching,PITCH_KEYS),emptyFarmStats(PITCH_KEYS))};
}
export const canonicalFarmRecords = sides => sides.map(s=>({teamId:s.teamId,records:[...s.records]
  .sort((a,b)=>compareFarmIds(a.playerId,b.playerId)).map(r=>({playerId:r.playerId,
    ...(r.batting?{batting:Object.fromEntries(BAT_KEYS.map(k=>[k,r.batting[k]]))}:{}),
    ...(r.pitching?{pitching:Object.fromEntries(PITCH_KEYS.map(k=>[k,r.pitching[k]]))}:{})}))}));
export function compactFarmGame(game) {
  validateFarmGame(game);
  if(game.model?.version!==FARM_MODEL_VERSION||game.model.allRunsEarned!==true
    ||JSON.stringify(game.model.modeledZero)!==JSON.stringify(['SF','SH'])
    ||JSON.stringify(game.model.unsupported)!==JSON.stringify(['SV','HLD'])) farmRecordError('model metadata');
  const workload=game.teams.flatMap(s=>s.records.map(r=>({teamId:s.teamId,playerId:r.playerId,
    PA:r.batting?.PA||0,BF:r.pitching?.BF||0,outs:r.pitching?.outs||0})));
  if(JSON.stringify(game.workload)!==JSON.stringify(workload)) farmRecordError('workload mismatch');
  if(!Array.isArray(game.warnings)) farmRecordError('warnings');
  for(const warning of game.warnings) {
    const actor=game.teams.find(t=>t.teamId===warning.teamId)?.records.find(r=>r.playerId===warning.playerId);
    if(!actor||!['pitcher-rescue','pitcher-overload','alternative-defense'].includes(warning.code)
      ||(warning.code==='alternative-defense'?!actor.batting:!actor.pitching)) farmRecordError('warning actor');
  }
  return {teams:game.teams.map(s=>{
    const {records,...summary}=farmTeamTotals(s);return summary;
  }),warnings:structuredClone(game.warnings),recordSignature:farmChecksum(canonicalFarmRecords(game.teams))};
}
export function farmStandings(competition) {
  const rows=competition.teams.map(t=>({...t,scheduled:0,played:0,unplayed:0,W:0,L:0,T:0,RF:0,RA:0,
    batting:emptyFarmStats(BAT_KEYS),pitching:emptyFarmStats(PITCH_KEYS)}));
  for(const c of competition.cards) for(const [id,other] of [[c.homeId,c.awayId],[c.awayId,c.homeId]]) {
    const row=rows.find(r=>r.teamId===id);row.scheduled++;
    if(c.status==='unplayed'){row.unplayed++;continue;}
    row.played++;
    const own=c.summary.teams.find(t=>t.teamId===id),opp=c.summary.teams.find(t=>t.teamId===other);
    row.RF+=own.score;row.RA+=opp.score;row.W+=Number(own.score>opp.score);row.L+=Number(own.score<opp.score);row.T+=Number(own.score===opp.score);
    row.batting=addFarmStats(row.batting,own.batting,BAT_KEYS);row.pitching=addFarmStats(row.pitching,own.pitching,PITCH_KEYS);
  }
  return rows;
}
