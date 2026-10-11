import { createFarmSchedule, FARM_MODEL_VERSION, compareFarmIds } from './farmSchedule';
import { validateFarmTeams, selectFarmTeam } from './farmSelection';
import { compactFarmGame, addFarmStats, BAT_KEYS,PITCH_KEYS,farmChecksum,sealFarmCompetition,farmRecordError as fail } from './farmRecordStats';
import { validateFarmCompetition,validateFarmReasons } from './farmRecordValidation';

export function createFarmCompetition({saveId,year,teams,startRound=1,source='new',legacy={source:'legacy-estimated',entries:[]},archiveSignature=farmChecksum([])}) {
  validateFarmTeams(teams);createFarmSchedule(teams,year);
  const c={version:1,saveId,modelVersion:FARM_MODEL_VERSION,year,startRound,nextRound:startRound,source,
    teams:[...teams].sort((a,b)=>compareFarmIds(a.id,b.id)).map(t=>({teamId:t.id,league:t.league,name:t.name??String(t.id)})),
    players:[],usage:[],cards:[],legacy:structuredClone(legacy),archiveSignature};
  sealFarmCompetition(c);validateFarmCompetition(c);return c;
}
function compressRound(c,result) {
  if(result?.year!==c.year||result.modelVersion!==c.modelVersion||!Number.isInteger(result.round)||result.round<c.startRound||result.round>143
    ||result.games?.length!==6)fail('round header');
  const cards=createFarmSchedule(c.teams.map(t=>({id:t.teamId,league:t.league})),c.year).filter(card=>card.round===result.round);
  const entries=cards.map(card=>{
    const matches=result.games.filter(g=>g?.card?.id===card.id);
    if(matches.length!==1||Object.keys(card).some(k=>matches[0].card[k]!==card[k]))fail('round card');
    const r=matches[0];
    if(r.status==='unplayed'){const summary={...card,status:'unplayed',reasons:structuredClone(r.reasons)};validateFarmReasons(summary);return summary;}
    if(r.status!=='played')fail('round status');
    const summary=compactFarmGame(r.game);
    if(summary.teams[0].teamId!==card.homeId||summary.teams[1].teamId!==card.awayId)fail('round sides');
    return {...card,status:'played',summary};
  });
  return entries;
}
export function applyFarmRound(c,result,teams) {
  validateFarmCompetition(c);
  const cards=compressRound(c,result);
  if(result.round<c.nextRound) {
    const previous=c.cards.filter(card=>card.round===result.round);
    if(JSON.stringify(previous)!==JSON.stringify(cards))fail('round conflict');return c;
  }
  if(result.round!==c.nextRound)fail('round gap');
  validateFarmTeams(teams);
  if(teams.length!==c.teams.length||c.teams.some(t=>!teams.some(x=>x.id===t.teamId&&x.league===t.league)))fail('team snapshot');
  const next=structuredClone(c),known=new Map(next.players.map(p=>[String(p.playerId),p])),loads=new Map(next.usage.map(u=>[String(u.playerId),u]));
  const usage=Object.fromEntries(next.usage.map(u=>[String(u.playerId),u]));
  for(const card of cards) {
    const game=result.games.find(g=>g.card.id===card.id);
    if(card.status==='unplayed') {
      const expected=[card.homeId,card.awayId].flatMap(id=>selectFarmTeam(teams.find(t=>t.id===id),{round:result.round,usage}).reasons.map(r=>({...r,teamId:id})));
      if(JSON.stringify(card.reasons)!==JSON.stringify(expected))fail('shortage snapshot');continue;
    }
    for(const side of game.game.teams) {
      const team=teams.find(t=>t.id===side.teamId);
      for(const r of side.records) {
        const player=team.farm.find(p=>p.id===r.playerId);
        if(!player||Number(player.injuryDaysLeft||0)>0||Boolean(r.pitching)!==player.isPitcher)fail('player membership');
        let entry=known.get(String(player.id));
        if(!entry){entry={playerId:player.id,name:player.name??String(player.id),isPitcher:player.isPitcher,teams:[]};next.players.push(entry);known.set(String(player.id),entry);}
        if(entry.isPitcher!==player.isPitcher)fail('changed player role');
        let stint=entry.teams.find(t=>t.teamId===team.id);
        if(!stint){stint={teamId:team.id,league:team.league};entry.teams.push(stint);}
        const kind=player.isPitcher?'pitching':'batting',keys=player.isPitcher?PITCH_KEYS:BAT_KEYS;
        stint[kind]=addFarmStats(stint[kind],r[kind],keys);
        let load=loads.get(String(player.id));
        if(!load){load={playerId:player.id,recentPitching:[],rescueAppearances:0,overloadAppearances:0};next.usage.push(load);loads.set(String(player.id),load);}
        if(r.batting)load.lastBattedRound=result.round;
        if(r.pitching){load.lastPitchedRound=result.round;load.recentPitching.push({round:result.round,BF:r.pitching.BF,outs:r.pitching.outs});}
        load.rescueAppearances+=Number(card.summary.warnings.some(w=>w.code==='pitcher-rescue'&&w.playerId===player.id));
        load.overloadAppearances+=Number(card.summary.warnings.some(w=>w.code==='pitcher-overload'&&w.playerId===player.id));
      }
    }
  }
  next.nextRound++;next.cards.push(...cards);
  for(const load of next.usage)load.recentPitching=load.recentPitching.filter(l=>l.round>=next.nextRound-7);
  next.players.sort((a,b)=>compareFarmIds(a.playerId,b.playerId));next.usage.sort((a,b)=>compareFarmIds(a.playerId,b.playerId));
  sealFarmCompetition(next);validateFarmCompetition(next);return next;
}
