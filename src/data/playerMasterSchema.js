// Pure validation shared by the staging CLI and new-game bootstrap.
const AS_OF='2026-03-27';
const statuses=['official','reported','game-assumption'];
const positions=['捕手','一塁手','二塁手','三塁手','遊撃手','左翼手','中堅手','右翼手'];
const requireValue=(ok,message)=>{if(!ok)throw new Error(`Player master: ${message}`);};
const number=n=>typeof n==='number'&&Number.isFinite(n);
const countStats=new Set(['G','GS','PA','AB','R','H','2B','3B','HR','RBI','SB','CS','BB','IBB','HBP','SO','SH','SF','GDP','W','L','SV','HLD','CG','SHO','ER','WP','BK','BF','outs']);
const rateStats=new Set(['IP','AVG','OBP','SLG','OPS','ERA','WHIP']);

function validateHistory(h, player) {
  const fail=message=>`${player.playerId}: ${message}`;
  if(h.teamName!=null)requireValue(typeof h.teamName==='string'&&h.teamName.trim().length>0,fail('invalid history team name'));
  requireValue(Number.isInteger(h.year)&&h.year>=1936&&h.year<=2025,fail('future/invalid performance year'));
  requireValue(!h.league||h.league==='NPB',fail('overseas statistics need a separate translation model'));
  if(player.kind==='pitcher')requireValue(Number.isSafeInteger(h.outs)&&h.outs>=0,fail('exact outs required, not truncated IP'));
  for(const [key,value] of Object.entries(h)) {
    if(value==null)continue; // Unknown is distinct from an observed zero.
    if(countStats.has(key))requireValue(Number.isSafeInteger(value)&&value>=0,fail(`invalid count ${key}`));
    else if(rateStats.has(key)||typeof value==='number')requireValue(number(value)&&value>=0,fail(`invalid statistic ${key}`));
  }
  const atMost=(a,b)=>{if(number(h[a])&&number(h[b]))requireValue(h[a]<=h[b],fail(`${a} exceeds ${b}`));};
  atMost('GS','G');atMost('ER','R');
  if(player.kind==='batter') {
    atMost('H','AB');atMost('AB','PA');atMost('HR','H');atMost('SO','AB');
    if(number(h.H))requireValue(['2B','3B','HR'].reduce((n,k)=>n+(h[k]??0),0)<=h.H,fail('extra-base hits exceed hits'));
    if(number(h.PA))requireValue(['AB','BB','HBP','SH','SF'].reduce((n,k)=>n+(h[k]??0),0)<=h.PA,fail('plate appearances inconsistent'));
    for(const key of ['AVG','OBP'])if(number(h[key]))requireValue(h[key]<=1,fail(`${key} exceeds 1`));
    if(number(h.SLG))requireValue(h.SLG<=4,fail('SLG exceeds 4'));
  } else if(number(h.IP))requireValue(Math.abs(h.IP*3-h.outs)<1e-7,fail('IP must equal exact outs / 3'));
}

export function compilePlayerMaster(master, {localImport=false} = {}) {
  requireValue(master?.schemaVersion===1&&master.asOf===AS_OF&&master.status==='verified','verified schema v1 / opening date required');
  requireValue(Array.isArray(master.players)&&master.players.length>=800,'complete population required');
  requireValue(Array.isArray(master.sources)&&master.sources.length>0,'sources required');
  const sources=new Set();
  for(const source of master.sources) {
    requireValue(source.id&&!sources.has(source.id)&&/^https?:\/\//.test(source.url),'unique source id and URL required');
    if(!localImport)requireValue(source.redistribution==='cleared'&&typeof source.rightsEvidence==='string'&&source.rightsEvidence.trim(),'redistribution rights not cleared');
    sources.add(source.id);
  }
  requireValue(Array.isArray(master.teams)&&master.teams.length===12&&new Set(master.teams.map(t=>t.teamId)).size===12,'12 independent team evidence rows required');
  const rosters=Object.fromEntries(Array.from({length:12},(_,id)=>[id,{complete:true,asOf:AS_OF,batters:[],pitchers:[]} ]));
  const seen=new Set();
  for(const p of master.players) {
    requireValue(typeof p.playerId==='string'&&p.playerId&&!seen.has(p.playerId),'missing or duplicate player ID');seen.add(p.playerId);
    requireValue(typeof p.name==='string'&&p.name.trim()&&Number.isInteger(p.teamId)&&rosters[p.teamId],'name/team required');
    requireValue(['controlled','development'].includes(p.registration)&&['batter','pitcher'].includes(p.kind),`${p.playerId}: invalid registration/kind`);
    requireValue(Array.isArray(p.sourceIds)&&p.sourceIds.length>0&&p.sourceIds.every(id=>sources.has(id)),`${p.playerId}: missing evidence`);
    requireValue(['right','left','unknown'].includes(p.throws)&&['right','left','switch','unknown'].includes(p.bats),`${p.playerId}: hands required`);
    requireValue(['counts','domestic','exempt','unknown'].includes(p.foreignQuotaStatus),`${p.playerId}: quota status required`);
    if(p.foreignQuotaStatus==='unknown')requireValue(typeof p.gameIsForeign==='boolean',`${p.playerId}: explicit quota assumption required`);
    if(p.birthDate!=null) {
      const date=new Date(`${p.birthDate}T00:00:00Z`);
      requireValue(/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===p.birthDate&&p.birthDate<=AS_OF,`${p.playerId}: birth date invalid`);
      const age=2026-Number(p.birthDate.slice(0,4))-(p.birthDate.slice(5)>AS_OF.slice(5)?1:0);
      requireValue(age>=15&&age<=65,`${p.playerId}: opening age outside supported range`);
    } else requireValue(Number.isInteger(p.gameAge)&&p.gameAge>=15&&p.gameAge<=65,`${p.playerId}: explicit unknown-age assumption required`);
    for(const key of ['daysOnActiveRoster','serviceYears'])if(p[key]!=null)requireValue(Number.isSafeInteger(p[key])&&p[key]>=0,`${p.playerId}: invalid ${key}`);
    requireValue(statuses.includes(p.salaryStatus)&&statuses.includes(p.contractStatus),`${p.playerId}: salary/contract confidence required`);
    const salary=p.salaryStatus==='game-assumption'?p.gameSalaryManYen:p.salaryManYen;
    const endYear=p.contractStatus==='game-assumption'?p.gameContractEndYear:p.contractEndYear;
    requireValue(number(salary)&&salary>=(p.registration==='development'?240:420),`${p.playerId}: invalid annual salary in 万円`);
    requireValue(Number.isInteger(endYear)&&endYear>=2026&&endYear<=2032,`${p.playerId}: contract end year invalid`);
    requireValue(p.kind==='pitcher'?['先発','中継ぎ','抑え'].includes(p.pos):positions.includes(p.pos),`${p.playerId}: explicit game position required`);
    if(p.kind==='batter')requireValue(p.positions&&p.positions[p.pos]===100&&Object.entries(p.positions).every(([pos,value])=>positions.includes(pos)&&number(value)&&value>=0&&value<=100),`${p.playerId}: invalid position proficiencies`);
    requireValue(Array.isArray(p.history),`${p.playerId}: history required (empty if unknown)`);
    for(const h of p.history)validateHistory(h,p);
    const source={...p,age:p.gameAge,hand:p.throws==='unknown'?undefined:p.throws,batHand:p.bats==='unknown'?undefined:p.bats,
      salary,contractEndYear:endYear,isIkusei:p.registration==='development',育成:p.registration==='development',
      isForeign:p.foreignQuotaStatus==='counts'||(p.foreignQuotaStatus==='unknown'&&p.gameIsForeign),
      dataQuality:{salary:p.salaryStatus,contract:p.contractStatus,age:p.birthDate?'official':'game-assumption',
        position:p.positionStatus||'game-assumption',foreignQuota:p.foreignQuotaStatus==='unknown'?'game-assumption':'provided',
        history:'sourced',identity:'stable-source-id',membership:'verified-opening'},
    };
    rosters[p.teamId][p.kind==='pitcher'?'pitchers':'batters'].push(source);
  }
  for(const [teamId,roster] of Object.entries(rosters)) {
    const players=[...roster.batters,...roster.pitchers],controlled=players.filter(p=>!p.isIkusei).length;
    const evidence=master.teams.find(t=>t.teamId===Number(teamId));
    requireValue(controlled>0&&controlled<=70&&evidence?.verified===true&&evidence.controlled===controlled&&evidence.development===players.length-controlled,`team ${teamId}: count/cap/evidence mismatch`);
  }
  return rosters;
}

export function comparePlayerMasters(before, after) {
  const a=new Map((before?.players||[]).map(p=>[p.playerId,p])),b=new Map((after?.players||[]).map(p=>[p.playerId,p]));
  return {added:[...b.keys()].filter(id=>!a.has(id)),removed:[...a.keys()].filter(id=>!b.has(id)),
    changed:[...b.keys()].filter(id=>a.has(id)&&JSON.stringify(a.get(id))!==JSON.stringify(b.get(id)))};
}
