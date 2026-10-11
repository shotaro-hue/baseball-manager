import { createFarmSchedule, FARM_MODEL_VERSION, assertFarmId } from './farmSchedule';
import { BAT_KEYS,PITCH_KEYS,emptyFarmStats,addFarmStats,validateFarmStats,farmCount,farmCompetitionSignature,farmRecordError as fail,farmStandings } from './farmRecordStats';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unique=items=>{const seen=new Set();for(const id of items){assertFarmId(id);if(seen.has(String(id)))fail('duplicate ID');seen.add(String(id));}};
export function validateFarmReasons(card) {
  if(!Array.isArray(card.reasons)||!card.reasons.length) fail('missing shortage reasons');
  const seen=new Set();
  for(const r of card.reasons) {
    const required=r.code==='insufficient-batters'?9:['insufficient-pitchers','insufficient-catcher'].includes(r.code)?1:0;
    const key=JSON.stringify([r.teamId,r.code]);
    if(![card.homeId,card.awayId].includes(r.teamId)||!required||r.required!==required
      ||!farmCount(r.available)||r.available>=required||seen.has(key)) fail('shortage reason');
    seen.add(key);
  }
}
function validateSummary(card) {
  const s=card.summary;
  if(s?.teams?.length!==2||typeof s.recordSignature!=='string'||!s.recordSignature||!Array.isArray(s.warnings)) fail('card summary');
  const [h,a]=s.teams;
  if(h.teamId!==card.homeId||a.teamId!==card.awayId)fail('card sides');
  for(const side of [h,a]) {
    validateFarmStats(side.batting,'batting');validateFarmStats(side.pitching,'pitching');
    if(!farmCount(side.score)||!farmCount(side.outsMade)||side.outsMade>27||side.outsMade<24
      ||side.outsMade!==side.batting.AB-side.batting.H||side.batting.G!==9||side.batting.GS!==9||side.pitching.GS!==1
      ||!Array.isArray(side.innings)||side.innings.length!==9
      ||side.innings.some((n,i)=>!farmCount(n)&&!(side===h&&i===8&&n===null))
      ||side.innings.reduce((n,x)=>n+(x??0),0)!==side.score||side.batting.R!==side.score||side.batting.RBI!==side.score) fail('card counts/innings');
  }
  if(a.outsMade!==27||(h.innings[8]===null?(h.outsMade!==24||h.score<=a.score||h.score-h.innings[8]<=a.score):
    (h.score-h.innings[8]>a.score||(h.outsMade!==27&&h.score<=a.score)))) fail('card end');
  for(const [off,def] of [[h,a],[a,h]]) {
    for(const [bat,pitch] of [['PA','BF'],['H','Hp'],['BB','BBp'],['HBP','HBPp'],['K','Kp'],['HR','HRp']]) {
      if(off.batting[bat]!==def.pitching[pitch])fail(`paired ${bat}`);
    }
    if(def.pitching.outs!==off.outsMade||def.pitching.Rallowed!==off.score||def.pitching.W!==Number(def.score>off.score)
      ||def.pitching.L!==Number(def.score<off.score)) fail('paired decisions');
  }
  for(const w of s.warnings) {
    assertFarmId(w.playerId);
    if(![h.teamId,a.teamId].includes(w.teamId)||!['pitcher-rescue','pitcher-overload','alternative-defense'].includes(w.code)) fail('warning');
  }
}
export function validateFarmPlayerRecords(competition,standings) {
  if(!Array.isArray(competition.players)) fail('players');
  unique(competition.players.map(p=>p.playerId));
  const totals=new Map(competition.teams.map(t=>[String(t.teamId),{batting:emptyFarmStats(BAT_KEYS),pitching:emptyFarmStats(PITCH_KEYS)}]));
  for(const p of competition.players) {
    if(typeof p.name!=='string'||typeof p.isPitcher!=='boolean'||!Array.isArray(p.teams)||!p.teams.length)fail('player identity');
    unique(p.teams.map(t=>t.teamId));
    for(const stint of p.teams) {
      const team=competition.teams.find(t=>t.teamId===stint.teamId),kind=p.isPitcher?'pitching':'batting',keys=p.isPitcher?PITCH_KEYS:BAT_KEYS;
      if(!team||stint.league!==team.league||stint[p.isPitcher?'batting':'pitching']) fail('stint identity');
      validateFarmStats(stint[kind],kind);
      if(stint[kind].G<1) fail('empty stint');
      const row=totals.get(String(team.teamId));row[kind]=addFarmStats(row[kind],stint[kind],keys);
    }
  }
  for(const row of standings) {
    const stats=totals.get(String(row.teamId));
    if(!same(row.batting,stats.batting)||!same(row.pitching,stats.pitching))fail('player/card aggregates');
  }
}
export function validateFarmCompetition(c) {
  if(c?.version!==1||c.modelVersion!==FARM_MODEL_VERSION||typeof c.saveId!=='string'||!c.saveId
    ||!Number.isSafeInteger(c.year)||c.year<1||!['new','migrated'].includes(c.source)
    ||!Number.isInteger(c.startRound)||c.startRound<1||c.startRound>144
    ||!Number.isInteger(c.nextRound)||c.nextRound<c.startRound||c.nextRound>144||!Array.isArray(c.teams)||!Array.isArray(c.cards)
    ||!Array.isArray(c.usage)||typeof c.archiveSignature!=='string'||!c.legacy||!Array.isArray(c.legacy.entries))fail('header');
  unique(c.teams.map(t=>t.teamId));
  const schedule=createFarmSchedule(c.teams.map(t=>({id:t.teamId,league:t.league})),c.year)
    .filter(card=>card.round>=c.startRound&&card.round<c.nextRound);
  if(c.cards.length!==schedule.length)fail('card count');
  c.cards.forEach((card,i)=>{
    for(const k of ['id','year','round','league','homeId','awayId']) if(card[k]!==schedule[i][k])fail('card identity/order');
    if(card.status==='unplayed'){validateFarmReasons(card);if(card.summary)fail('unplayed summary');}
    else if(card.status==='played')validateSummary(card);else fail('card status');
  });
  if(c.integrity!==farmCompetitionSignature(c))fail('competition checksum');
  if(c.legacy.source!=='legacy-estimated')fail('legacy provenance');
  const standings=farmStandings(c);validateFarmPlayerRecords(c,standings);
  unique(c.usage.map(u=>u.playerId));
  for(const u of c.usage) {
    const p=c.players.find(p=>p.playerId===u.playerId);
    if(!p||!farmCount(u.rescueAppearances)||!farmCount(u.overloadAppearances)||!Array.isArray(u.recentPitching))fail('usage');
    for(const k of ['lastBattedRound','lastPitchedRound']) if(u[k]!=null&&(!Number.isInteger(u[k])||u[k]<c.startRound||u[k]>=c.nextRound))fail('usage round');
    const seen=new Set();
    for(const load of u.recentPitching) {
      if(!Number.isInteger(load.round)||load.round<Math.max(c.startRound,c.nextRound-7)||load.round>=c.nextRound||seen.has(load.round)
        ||!farmCount(load.BF)||load.BF<1||!farmCount(load.outs)||load.outs>27)fail('pitching load');seen.add(load.round);
    }
    if((p.isPitcher&&(u.lastBattedRound!=null||u.lastPitchedRound==null))||(!p.isPitcher&&(u.lastBattedRound==null||u.lastPitchedRound!=null||u.recentPitching.length)))fail('usage role');
  }
  if(c.usage.length!==c.players.length)fail('missing usage');
  return true;
}
