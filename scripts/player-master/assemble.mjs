// Build a review candidate from separately collected facts and a dated register.
// No network, source overwrite, licensing assertion, or publication happens here.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NPB2025_ROSTERS} from '../../src/data/npb2025.js';
import {PLAYER_CORRECTIONS_2026} from '../../src/data/playerMaster2026Corrections.js';
import {REVIEWED_PLAYER_FACTS_2026} from '../../src/data/playerMaster2026Facts.js';
const codes=['s','db','c','t','g','d','h','e','l','m','f','b'];
const teamNames=['東京ヤクルトスワローズ','横浜DeNAベイスターズ','広島東洋カープ','阪神タイガース','読売ジャイアンツ','中日ドラゴンズ','福岡ソフトバンクホークス','東北楽天ゴールデンイーグルス','埼玉西武ライオンズ','千葉ロッテマリーンズ','北海道日本ハムファイターズ','オリックス・バファローズ'];
const key=s=>s.normalize('NFKC').replace(/[\s・.]/g,'').replaceAll('廣','広').replaceAll('髙','高').replaceAll('﨑','崎').replaceAll('瀨','瀬');
const aliases=s=>[key(s),key(s).replace(/^[A-Z]+/,'')];
const positions=['捕手','一塁手','二塁手','三塁手','遊撃手','左翼手','中堅手','右翼手'];

export function assemble(reference,facts, legacyRosters=NPB2025_ROSTERS) {
  if(reference.asOf!=='2026-03-27'||reference.scope!=='all')throw Error('Opening reference required');
  const players=reference.players,sources=new Map();
  const source=url=>{sources.set(url,{id:url,url,redistribution:'unconfirmed'});return url;};
  const index=new Map();
  for(const p of players)for(const a of aliases(p.name)){const ids=index.get(a)||new Set();ids.add(p.playerId);index.set(a,ids);}
  const match=(name,teamId,kind)=>{
    const ids=new Set(aliases(name).flatMap(a=>[...(index.get(a)||[])]));
    const found=players.filter(p=>ids.has(p.playerId)&&(teamId==null||p.teamId===Number(teamId))&&(!kind||p.kind===kind));
    if(found.length>1)throw Error(`Ambiguous identity: ${name}`);
    return found[0]?.playerId;
  };
  const legacy=new Map();
  for(const [teamId,r] of Object.entries(legacyRosters))for(const p of [...r.batters,...r.pitchers]){
    const id=match(p.name,teamId);if(!id)throw Error(`Legacy player not matched: ${p.name}`);
    legacy.set(id,{...p,...PLAYER_CORRECTIONS_2026[`${teamId}::${p.name}`]});
  }
  const histories=new Map(),fielding=new Map();
  for(const row of facts.observations){
    if(row.year>2025||row.year<1936)throw Error('Observation outside pre-opening window');
    const id=row.playerId;if(!id)throw Error('Stable identity required for history');
    const p=players.find(p=>p.playerId===id);
    if(!p)throw Error('Unknown history identity');
    const {playerId,...stats}=row;
    const list=histories.get(id)||[];
    list.push({...stats,sourceId:source(`https://npb.jp/bis/players/${id.split(':')[1]}.html`)});histories.set(id,list);
  }
  for(const row of facts.fielding){
    if(row.position==='投手')continue;
    // Team tables omit IDs. Only use a unique name whose ID-addressed history
    // independently confirms playing for that team in 2025. Otherwise unknown.
    const candidates=players.filter(p=>p.kind==='batter'&&aliases(p.name).some(a=>aliases(row.name).includes(a))&&
      (histories.get(p.playerId)||[]).some(h=>h.year===2025&&teamNames[codes.indexOf(row.teamCode)].includes(h.teamName.replace(/\s/g,''))));
    if(candidates.length!==1)continue;
    const id=candidates[0].playerId;
    const list=fielding.get(id)||[];list.push(row);fielding.set(id,list);
  }
  const result=players.map(p=>{
    const f=facts.facts[p.playerId];if(!f)throw Error(`Missing profile: ${p.playerId}`);
    const old=legacy.get(p.playerId),history=histories.get(p.playerId)||[];
    const sourceIds=new Set([source(p.sourceUrl),source(f.sourceUrl),...history.map(h=>h.sourceId)]);
    const games=new Map();
    for(const row of fielding.get(p.playerId)||[]){
      games.set(row.position,(games.get(row.position)||0)+row.games);
      sourceIds.add(source(`https://npb.jp/bis/2025/stats/idf1_${row.teamCode}.html`));
    }
    let pos,proficiencies={},positionStatus='game-assumption';
    if(p.kind==='pitcher'){
      const latest=history.filter(h=>h.year===Math.max(0,...history.map(h=>h.year)));
      const innings=latest.reduce((n,h)=>n+(h.outs||0),0)/3,games=latest.reduce((n,h)=>n+h.G,0);
      pos=latest.reduce((n,h)=>n+(h.SV||0),0)>=10?'抑え':games>=3&&innings/games>=3?'先発':'中継ぎ';
    }
    else {
      const ranked=[...games].filter(([position])=>positions.includes(position)).sort((a,b)=>b[1]-a[1]);
      if(ranked.length){
        pos=ranked[0][0];proficiencies=Object.fromEntries(ranked.map(([position,n])=>[position,position===pos?100:n>=10?85:60]));positionStatus='observed-2025-game-proficiency';
      }else if(p.position==='捕手') {pos='捕手';proficiencies={捕手:100};positionStatus='registered-catcher';}
      else if(p.position==='外野手'){
        pos=positions.includes(old?.pos)?old.pos:'左翼手';
        proficiencies={左翼手:60,中堅手:60,右翼手:60,[pos]:100};
      }else {pos=positions.includes(old?.pos)?old.pos:'一塁手';proficiencies={一塁手:60,二塁手:60,三塁手:60,遊撃手:60,[pos]:100};}
    }
    // A sparse register is not evidence of citizenship or service time.
    const draft=f.draft?.match(/^(\d{4})年/),quota=old?.foreignQuotaStatus||(draft?'domestic':'unknown');
    const foreign=quota==='unknown'?(old?.isForeign??!draft):quota==='counts';
    const {sourceUrls=[],...reviewed}=REVIEWED_PLAYER_FACTS_2026[p.playerId]||{};
    for(const url of sourceUrls)sourceIds.add(source(url));
    return {playerId:p.playerId,legacyPlayerId:old?.playerId,name:p.name,teamId:p.teamId,registration:p.registration,kind:p.kind,
      birthDate:f.birthDate,throws:f.throws,bats:f.bats,pos,positions:proficiencies,positionStatus,roleStatus:'game-estimate-pre-opening',
      foreignQuotaStatus:quota,gameIsForeign:foreign,
      foreignQuotaBasis:quota==='unknown'?'game-assumption-not-eligibility-certification':draft?'documented-domestic-draft':'reviewed-legacy-correction',
      salaryStatus:'game-assumption',gameSalaryManYen:Math.max(old?.salary||0,p.registration==='development'?240:420),
      salaryBasis:old?'preserved-unverified-legacy':'minimum-game-assumption',
      contractStatus:'game-assumption',gameContractEndYear:old?.contractEndYear||2026,contractBasis:old?'preserved-unverified-legacy':'single-year-game-assumption',
      entryType:old?.entryType||'不明',...(draft?{draftYear:Number(draft[1]),entryRoute:'domestic-draft',draftDescription:f.draft}:{entryRoute:'unknown'}),
      history:history.sort((a,b)=>a.year-b.year||a.teamName.localeCompare(b.teamName)),
      ...reviewed,
      sourceIds:[...sourceIds]};
  });
  return {schemaVersion:1,asOf:'2026-03-27',status:'candidate',sources:[...sources.values()],
    teams:codes.map((code,teamId)=>({teamId,controlled:players.filter(p=>p.teamId===teamId&&p.registration==='controlled').length,
      development:players.filter(p=>p.teamId===teamId&&p.registration==='development').length,verified:false})),players:result};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [referenceFile,factsFile,output]=process.argv.slice(2);
 if(!output||resolve(output).startsWith(resolve('src')+'/'))throw Error('Use a new staging path outside src');
 const result=assemble(JSON.parse(await readFile(referenceFile,'utf8')),JSON.parse(await readFile(factsFile,'utf8')));
 await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({players:result.players.length,legacy:result.players.filter(p=>p.legacyPlayerId).length,history:result.players.reduce((n,p)=>n+p.history.length,0)}));
}
