import { createFarmSchedule, createFarmRng, FARM_MODEL_VERSION, assertFarmId } from './farmSchedule';
import { selectFarmTeam, validateFarmTeams, farmAbility } from './farmSelection';
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo,x));
const BAT_KEYS = ['G','GS','PA','AB','H','D','T','HR','BB','HBP','K','RBI','R','SF','SH'];
const PITCH_KEYS = ['G','GS','outs','BF','Hp','Kp','BBp','HBPp','HRp','Rallowed','ER','W','L','QS'];
const empty = keys => Object.fromEntries(keys.map(k => [k,0]));
const HIT_BASES = { S:1, D:2, T:3, HR:4 };
const MODEL = Object.freeze({ version:FARM_MODEL_VERSION, modeledZero:['SF','SH'], unsupported:['SV','HLD'], allRunsEarned:true });

export function advanceFarmBases({ bases, outcome, batterId, pitcherId, runLimit = Infinity }) {
  if (!Array.isArray(bases) || bases.length !== 3 || !['BB','HBP','K','OUT','S','D','T','HR'].includes(outcome)
    || !(runLimit > 0)) throw new Error('invalid farm plate appearance');
  assertFarmId(batterId); assertFarmId(pitcherId);
  const runner = { playerId:batterId, responsiblePitcherId:pitcherId };
  let next = [...bases], scorers = [];
  if (['K','OUT'].includes(outcome)) return { outcome, bases:next, scorers, outsAdded:1, rbi:0 };
  if (['BB','HBP'].includes(outcome)) {
    if (next[0]) {
      if (next[1]) { if (next[2]) scorers.push(next[2]); next[2]=next[1]; }
      next[1]=next[0];
    }
    next[0]=runner;
  } else {
    let distance = HIT_BASES[outcome];
    if (outcome !== 'HR' && Number.isFinite(runLimit)) {
      const possible = bases.map((r,i)=>r && i+1+distance>=4 ? {r, needed:3-i} : null).filter(Boolean).reverse();
      if (possible.length >= runLimit) {
        distance = Math.max(...possible.slice(0,runLimit).map(x=>x.needed));
        outcome = Object.keys(HIT_BASES).find(k=>HIT_BASES[k]===distance);
      }
    }
    next=[null,null,null];
    for (let i=2; i>=0; i--) {
      if (!bases[i]) continue;
      if (i+distance >= 3) scorers.push(bases[i]); else next[i+distance]=bases[i];
    }
    if (distance===4) scorers.push(runner); else next[distance-1]=runner;
  }
  if (outcome !== 'HR') scorers=scorers.slice(0,runLimit);
  return { outcome, bases:next, scorers, outsAdded:0, rbi:scorers.length };
}

// Explicit initial balance model; no physical simulation or main-game random calls.
export function farmOutcomeProbabilities(batter, pitcher, { defensePenalty = 0, pitcherBF = 0 } = {}) {
  const bat = batter.batting || {}, pitch = pitcher.pitching || {};
  const batCond = farmAbility(batter.condition,100)/100;
  const pitchCond = farmAbility(pitcher.condition,100)/100;
  const contact = (farmAbility(bat.contact)*(.7+.3*batCond)-50)/50;
  const eye = (farmAbility(bat.eye)*(.7+.3*batCond)-50)/50;
  const power = (farmAbility(bat.power)*(.7+.3*batCond)-50)/50;
  const load = clamp((pitcherBF-34)/100,0,.3);
  const control = (farmAbility(pitch.control)*(.6+.4*pitchCond)-50)/50-load;
  const stuff = ((farmAbility(pitch.velocity)+farmAbility(pitch.breaking))/2*(.6+.4*pitchCond)-50)/50-load;
  const p = {
    HBP:clamp(.008-control*.003,.003,.015),
    BB:clamp(.08+(eye-control)*.025,.025,.16),
    K:clamp(.20+(stuff-contact)*.06,.08,.34),
    HR:clamp(.025+(power-stuff)*.015,.005,.07),
    T:.005,
    D:clamp(.045+(power-stuff)*.012,.015,.08),
    S:clamp(.15+(contact-stuff)*.045+clamp(defensePenalty,0,1)*.04,.06,.28),
  };
  p.OUT=1-Object.values(p).reduce((sum,x)=>sum+x,0);
  return p;
}
function outcomeFor(batter,pitcher,context,rng) {
  const value=rng();
  if (!Number.isFinite(value)||value<0||value>=1) throw new Error('invalid farm rng value');
  let edge=0;
  for (const [outcome,prob] of Object.entries(farmOutcomeProbabilities(batter,pitcher,context))) {
    edge+=prob; if(value<edge) return outcome;
  }
  return 'OUT';
}
function sideFrom(selection) {
  if (selection?.status !== 'ready' || selection.lineup?.length !== 9 || !selection.pitchers?.length) throw new Error('farm team not ready');
  const records=new Map();
  for (const entry of selection.lineup) records.set(String(entry.player.id),{playerId:entry.player.id,batting:{...empty(BAT_KEYS),G:1,GS:1}});
  return { selection, records, score:0, innings:[], outsMade:0, cursor:0, pitcherIndex:0 };
}
function currentPitcher(side,warnings) {
  let entry=side.selection.pitchers[side.pitcherIndex], rec=side.records.get(String(entry.player.id));
  if (rec && (rec.pitching.outs>=entry.maxOuts || rec.pitching.BF>=entry.maxBF)) {
    if (side.pitcherIndex+1<side.selection.pitchers.length) {
      entry=side.selection.pitchers[++side.pitcherIndex]; rec=undefined;
    } else if (!warnings.some(w=>w.code==='pitcher-overload' && w.playerId===entry.player.id)) {
      warnings.push({code:'pitcher-overload',teamId:side.selection.teamId,playerId:entry.player.id});
    }
  }
  if (!rec) {
    rec={playerId:entry.player.id,pitching:{...empty(PITCH_KEYS),G:1,GS:side.pitcherIndex===0?1:0}};
    side.records.set(String(entry.player.id),rec);
    if (entry.rescue && !warnings.some(w=>w.code==='pitcher-rescue' && w.playerId===entry.player.id)) {
      warnings.push({code:'pitcher-rescue',teamId:side.selection.teamId,playerId:entry.player.id});
    }
  }
  return { entry, rec };
}
function accountEvent(offense,defense,event) {
  const b=offense.records.get(String(event.batterId)).batting, p=defense.records.get(String(event.pitcherId)).pitching;
  b.PA++; p.BF++; b.RBI+=event.rbi;
  if(event.outcome==='BB') { b.BB++; p.BBp++; }
  else if(event.outcome==='HBP') { b.HBP++; p.HBPp++; }
  else {
    b.AB++;
    if(event.outcome==='K') {b.K++;p.Kp++;}
    if(HIT_BASES[event.outcome]) {
      b.H++;p.Hp++;
      if(event.outcome!=='S') b[event.outcome]++;
      if(event.outcome==='HR') p.HRp++;
    }
  }
  p.outs+=event.outsAdded; offense.outsMade+=event.outsAdded;
  for(const runner of event.scorers) {
    offense.records.get(String(runner.playerId)).batting.R++;
    const responsible=defense.records.get(String(runner.responsiblePitcherId)).pitching;
    responsible.Rallowed++; responsible.ER++;
  }
  offense.score+=event.scorers.length;
}

function winningFarmRecord(records,candidateId,pitchingOrder) {
  let winning=records.get(String(candidateId));
  if(!winning || (winning.pitching.GS && winning.pitching.outs<15)) {
    winning=pitchingOrder.map(id=>records.get(String(id))).filter(r=>r?.pitching && !r.pitching.GS)
      .sort((x,y)=>y.pitching.outs-x.pitching.outs)[0];
  }
  if(!winning) throw new Error('no eligible farm winning pitcher');
  return winning;
}

export function playFarmGame({ home, away, rng }) {
  if(typeof rng!=='function') throw new Error('farm rng required');
  const h=sideFrom(home), a=sideFrom(away);
  assertFarmId(home.teamId);assertFarmId(away.teamId);
  if(String(home.teamId)===String(away.teamId)) throw new Error('same farm team');
  const playerIds=new Set();
  for (const s of [home,away]) for(const x of [...s.lineup,...s.pitchers]) {
    assertFarmId(x.player.id);
    if(playerIds.has(String(x.player.id))) throw new Error('duplicate farm game player');
    playerIds.add(String(x.player.id));
  }
  const events=[], warnings=[...home.warnings.map(w=>({...w,teamId:home.teamId})),...away.warnings.map(w=>({...w,teamId:away.teamId}))];
  let decisive=null;
  for(let inning=1;inning<=9;inning++) {
    for(const isTop of [true,false]) {
      if(inning===9&&!isTop&&h.score>a.score) {h.innings.push(null);break;}
      const offense=isTop?a:h, defense=isTop?h:a;
      const startScore=offense.score;
      let outs=0,bases=[null,null,null],pa=0;
      while(outs<3) {
        if(++pa>200) throw new Error('farm plate appearance limit exceeded');
        const batter=offense.selection.lineup[offense.cursor++%9].player;
        const {entry,rec}=currentPitcher(defense,warnings);
        const outcome=outcomeFor(batter,entry.player,{defensePenalty:defense.selection.defensePenalty,pitcherBF:rec.pitching.BF},rng);
        const event={inning,isTop,offensiveTeamId:offense.selection.teamId,defensiveTeamId:defense.selection.teamId,
          batterId:batter.id,pitcherId:entry.player.id,runnersBefore:bases,
          ...advanceFarmBases({bases,outcome,batterId:batter.id,pitcherId:entry.player.id,
            runLimit:inning===9&&!isTop?defense.score-offense.score+1:Infinity})};
        event.runnersAfter=event.bases; delete event.bases;
        const before=offense.score;
        accountEvent(offense,defense,event); events.push(event);
        if(before<=defense.score&&offense.score>defense.score) {
          decisive={winner:offense.selection.teamId,winningPitcherId:offense.selection.pitchers[offense.pitcherIndex].player.id,
            losingPitcherId:event.scorers[defense.score-before].responsiblePitcherId};
        } else if(offense.score===defense.score) decisive=null;
        outs+=event.outsAdded;bases=event.runnersAfter;
        if(inning===9&&!isTop&&offense.score>defense.score) break;
      }
      offense.innings.push(offense.score-startScore);
    }
  }
  if(h.score!==a.score) {
    const winner=h.score>a.score?h:a, loser=h.score>a.score?a:h;
    if(!decisive || decisive.winner!==winner.selection.teamId) throw new Error('missing farm decision');
    const winning=winningFarmRecord(winner.records,decisive.winningPitcherId,winner.selection.pitchers.map(x=>x.player.id));
    winning.pitching.W=1;
    loser.records.get(String(decisive.losingPitcherId)).pitching.L=1;
  }
  for(const s of [h,a]) for(const r of s.records.values()) if(r.pitching?.GS && r.pitching.outs>=18 && r.pitching.ER<=3) r.pitching.QS=1;
  const result={status:'played',model:{...MODEL,modeledZero:[...MODEL.modeledZero],unsupported:[...MODEL.unsupported]},
    teams:[h,a].map(s=>({teamId:s.selection.teamId,score:s.score,innings:s.innings,outsMade:s.outsMade,records:[...s.records.values()]})),
    events,warnings,
    workload:[h,a].flatMap(s=>[...s.records.values()].map(r=>({teamId:s.selection.teamId,playerId:r.playerId,
      PA:r.batting?.PA||0,BF:r.pitching?.BF||0,outs:r.pitching?.outs||0}))),
  };
  validateFarmGame(result);
  return result;
}

export function simulateFarmRound({teams,year,round,saveId,usage={}}) {
  if(typeof saveId!=='string'||!saveId.length) throw new Error('farm save ID required');
  if(!Number.isInteger(round)||round<1||round>143) throw new Error('invalid farm round');
  validateFarmTeams(teams);
  const cards=createFarmSchedule(teams,year).filter(c=>c.round===round);
  const byId=new Map(teams.map(t=>[String(t.id),t]));
  const games=cards.map(card=>{
    const home=selectFarmTeam(byId.get(String(card.homeId)),{round,usage});
    const away=selectFarmTeam(byId.get(String(card.awayId)),{round,usage});
    const reasons=[home,away].flatMap(s=>s.reasons.map(r=>({...r,teamId:s.teamId})));
    if(reasons.length) return {card,status:'unplayed',reasons};
    return {card,status:'played',game:playFarmGame({home,away,rng:createFarmRng([saveId,year,round,card.id,FARM_MODEL_VERSION])})};
  });
  return {year,round,modelVersion:FARM_MODEL_VERSION,games};
}

export function validateFarmGame(game) {
  const fail=message=>{throw new Error(`invalid farm record: ${message}`);};
  if(game?.status!=='played'||game.teams?.length!==2||!Array.isArray(game.events)) fail('shape');
  const ids=new Set();
  const total=(side,kind,key)=>side.records.reduce((sum,r)=>sum+(r[kind]?.[key]||0),0);
  for(const side of game.teams) {
    if(!Number.isSafeInteger(side.score)||side.score<0||!Number.isSafeInteger(side.outsMade)||side.outsMade<0) fail('score/outs');
    if(!Array.isArray(side.records)||side.records.length<10) fail('records');
    for(const r of side.records) {
      assertFarmId(r.playerId);
      if(ids.has(String(r.playerId))) fail('duplicate player');ids.add(String(r.playerId));
      if(!r.batting&&!r.pitching) fail('empty player');
      for(const [kind,keys] of [['batting',BAT_KEYS],['pitching',PITCH_KEYS]]) {
        if(!r[kind]) continue;
        if(keys.some(k=>!Number.isSafeInteger(r[kind][k])||r[kind][k]<0)) fail('counter');
        if(r[kind].G!==1||r[kind].GS>1) fail('appearance');
      }
      const b=r.batting,p=r.pitching;
      if(b&&(b.HR>b.H||b.H>b.AB||b.AB>b.PA||b.D+b.T+b.HR>b.H||b.PA!==b.AB+b.BB+b.HBP+b.SF+b.SH||b.SF||b.SH)) fail('batting identities');
      if(p&&(p.HRp>p.Hp||p.Hp+p.Kp+p.BBp+p.HBPp>p.BF||p.ER!==p.Rallowed||p.W>1||p.L>1||p.W+p.L>1
        ||p.QS!==(p.GS&&p.outs>=18&&p.ER<=3?1:0))) fail('pitching identities');
    }
    if(side.innings.length!==9||side.innings.reduce((n,x)=>n+(x??0),0)!==side.score) fail('innings');
    if(total(side,'batting','GS')!==9||total(side,'pitching','GS')!==1||total(side,'batting','R')!==side.score) fail('starters/runs');
    const offensive=game.events.filter(e=>e.offensiveTeamId===side.teamId);
    if(offensive.length!==total(side,'batting','PA')||offensive.reduce((n,e)=>n+e.outsAdded,0)!==side.outsMade
      ||offensive.reduce((n,e)=>n+e.scorers.length,0)!==side.score
      ||offensive.reduce((n,e)=>n+e.rbi,0)!==total(side,'batting','RBI')) fail('events');
  }
  // Rebuild individual counters from ordered events; team totals alone can hide misattribution.
  const replay=game.teams.map(side=>({selection:{teamId:side.teamId},score:0,outsMade:0,innings:Array(9).fill(0),
    records:new Map(side.records.map(r=>[String(r.playerId),{playerId:r.playerId,
      ...(r.batting?{batting:{...empty(BAT_KEYS),G:1,GS:1}}:{}),
      ...(r.pitching?{pitching:{...empty(PITCH_KEYS),G:1,GS:0}}:{})}]))}));
  const seenPitchers=new Map(replay.map(s=>[s.selection.teamId,[]]));
  let half=-1,halfOuts=0,bases=[null,null,null],decision=null;
  const runnersEqual=(x,y)=>Array.isArray(x)&&x.length===y.length&&x.every((r,i)=>r===null?y[i]===null:
    r&&y[i]&&r.playerId===y[i].playerId&&r.responsiblePitcherId===y[i].responsiblePitcherId);
  for(const event of game.events) {
    if(!Number.isInteger(event.inning)||event.inning<1||event.inning>9||typeof event.isTop!=='boolean') fail('event inning');
    const nextHalf=(event.inning-1)*2+(event.isTop?0:1);
    if(nextHalf!==half) {
      if(nextHalf!==half+1||(half>=0&&halfOuts!==3)) fail('half order');
      half=nextHalf;halfOuts=0;bases=[null,null,null];
    }
    if(halfOuts>=3) fail('extra plate appearance');
    const offense=replay[event.isTop?1:0],defense=replay[event.isTop?0:1];
    if(event.offensiveTeamId!==offense.selection.teamId||event.defensiveTeamId!==defense.selection.teamId
      ||!offense.records.get(String(event.batterId))?.batting||!defense.records.get(String(event.pitcherId))?.pitching
      ||!runnersEqual(event.runnersBefore,bases)) fail('event identity/bases');
    const entered=seenPitchers.get(defense.selection.teamId);
    if(entered.at(-1)!==event.pitcherId) {
      if(entered.includes(event.pitcherId)) fail('pitcher reentry');
      if(!entered.length) defense.records.get(String(event.pitcherId)).pitching.GS=1;
      entered.push(event.pitcherId);
    }
    const expected=advanceFarmBases({bases,outcome:event.outcome,batterId:event.batterId,pitcherId:event.pitcherId,
      runLimit:half===17?defense.score-offense.score+1:Infinity});
    if(event.outsAdded!==expected.outsAdded||event.rbi!==expected.rbi||event.outcome!==expected.outcome
      ||!runnersEqual(event.scorers,expected.scorers)||!runnersEqual(event.runnersAfter,expected.bases)) fail('event transition');
    const before=offense.score;
    accountEvent(offense,defense,event);halfOuts+=event.outsAdded;bases=expected.bases;
    offense.innings[event.inning-1]+=event.scorers.length;
    if(before<=defense.score&&offense.score>defense.score) {
      decision={winner:offense.selection.teamId,
        winningPitcherId:seenPitchers.get(offense.selection.teamId).at(-1)
          ??game.events.find(e=>e.defensiveTeamId===offense.selection.teamId)?.pitcherId,
        losingPitcherId:event.scorers[defense.score-before].responsiblePitcherId};
    } else if(offense.score===defense.score) decision=null;
  }
  if(!((half===16&&halfOuts===3&&replay[0].score>replay[1].score)
    ||(half===17&&(halfOuts===3||replay[0].score>replay[1].score)))) fail('game end');
  if(half===16) replay[0].innings[8]=null;
  if(replay[0].score!==replay[1].score) {
    const winner=replay[0].score>replay[1].score?replay[0]:replay[1],loser=winner===replay[0]?replay[1]:replay[0];
    if(!decision||decision.winner!==winner.selection.teamId) fail('missing decision');
    winningFarmRecord(winner.records,decision.winningPitcherId,seenPitchers.get(winner.selection.teamId)).pitching.W=1;
    loser.records.get(String(decision.losingPitcherId)).pitching.L=1;
  }
  for(let i=0;i<2;i++) {
    if(game.teams[i].innings.some((runs,j)=>runs!==replay[i].innings[j])) fail('inning attribution');
    for(const actual of game.teams[i].records) {
      const expected=replay[i].records.get(String(actual.playerId));
      for(const [kind,keys] of [['batting',BAT_KEYS],['pitching',PITCH_KEYS.filter(k=>k!=='QS')]]) {
        if(actual[kind]&&keys.some(k=>actual[kind][k]!==expected[kind][k])) fail('individual attribution');
      }
      if(actual.pitching&&!seenPitchers.get(game.teams[i].teamId).includes(actual.playerId)) fail('unused pitcher record');
    }
  }
  const [home,away]=game.teams;
  if(home.teamId===away.teamId) fail('same team');
  for(const [off,def] of [[home,away],[away,home]]) {
    for(const [bat,pitch] of [['PA','BF'],['H','Hp'],['BB','BBp'],['HBP','HBPp'],['K','Kp'],['HR','HRp']]) {
      if(total(off,'batting',bat)!==total(def,'pitching',pitch)) fail(`paired ${bat}`);
    }
    if(total(def,'pitching','outs')!==off.outsMade||total(def,'pitching','Rallowed')!==off.score||total(def,'pitching','ER')!==off.score) fail('paired runs/outs');
    if(total(off,'pitching','W')!==(off.score>def.score?1:0)||total(off,'pitching','L')!==(off.score<def.score?1:0)) fail('decisions');
  }
  return true;
}
