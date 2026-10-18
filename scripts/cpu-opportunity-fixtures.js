import { FIELDING_POSITIONS, MAX_ROSTER, OPTIMAL_PITCHER_COUNT } from '../src/constants';
import { buildAutoManagedRoster } from '../src/engine/rosterAutomation';
import { batter, pitcher } from '../src/engine/__tests__/farmFixtures';

const stats=PA=>({PA,AB:PA,H:Math.floor(PA/4),HR:0,BB:0,HBP:0,K:0,BF:0,IP:0});
const hit=(id,pos,ability,PA=20)=>batter(id,pos,{age:24,potential:ability,stats:stats(PA),
  batting:Object.fromEntries(['contact','power','eye','stamina','speed','arm','defense','catching'].map(k=>[k,ability]))});

export function opportunityFixture(){
  const regulars=FIELDING_POSITIONS.map((pos,i)=>hit(`regular-${i}`,pos,pos==='捕手'?40:90,100));
  const target=hit('unused-dh','三塁手',70,0),catchers=[hit('reserve-c1','捕手',30),hit('reserve-c2','捕手',30)];
  const batters=[...regulars,target,...catchers];
  while(batters.length<MAX_ROSTER-OPTIMAL_PITCHER_COUNT)batters.push(hit(`reserve-${batters.length}`,'一塁手',30));
  const farm=[hit('replacement','三塁手',60,0),...Array.from({length:3},(_,i)=>hit(`farm-c${i}`,'捕手',25,0)),
    ...FIELDING_POSITIONS.filter(pos=>!['捕手','三塁手'].includes(pos)).map((pos,i)=>hit(`farm-b${i}`,pos,20,0)),
    ...Array.from({length:6},(_,i)=>pitcher(`farm-p${i}`))];
  const source={id:1,name:'CPU',league:'セ',dhEnabled:false,rosterDhMode:false,managementPolicyId:'results',managementTraitId:'speed',
    players:[...batters,...Array.from({length:OPTIMAL_PITCHER_COUNT},(_,i)=>pitcher(`active-p${i}`,{stats:stats(0)}))],farm};
  const t=buildAutoManagedRoster(source),farmUsage=Object.fromEntries(farm.filter(p=>!p.isPitcher).map(p=>[p.id,{battingGames:40,battingPA:150}]));
  return {t,farmUsage};
}
