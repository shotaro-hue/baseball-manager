import {FIELDING_POSITIONS,MAX_SHIHAKA_TOTAL,MIN_TOTAL_BY_POS} from '../constants';
import {isIkuseiPlayer} from './rosterCapacity';

// Only new-game builders call this. Existing players and loaded saves are never changed.
export function initialRosterSlots(players) {
  const owned=players.filter(p=>!isIkuseiPlayer(p));
  if(owned.length>MAX_SHIHAKA_TOTAL)throw new Error('初期支配下人数が70人を超えています');
  const pitchers=owned.filter(p=>p.isPitcher),batters=owned.filter(p=>!p.isPitcher);
  // Protect defensive coverage before distributing the optional 32/33 target.
  // Minimums use primary positions and controlled players only; never rewrite
  // a real player's position or use development players to fill these slots.
  const missingBatters=FIELDING_POSITIONS.reduce((n,pos)=>n+Math.max(0,
    (pos==='捕手'?MIN_TOTAL_BY_POS['捕手']:1)-batters.filter(p=>p.pos===pos).length),0);
  const missingPitcher=Number(pitchers.length===0);
  const target=Math.max(65,owned.length+missingBatters+missingPitcher);
  if(target>MAX_SHIHAKA_TOTAL)throw new Error('初期守備を成立させる補充が支配下70人以内に収まりません');
  const available=target-owned.length;
  const pitcherCount=Math.max(missingPitcher,Math.min(Math.max(0,32-pitchers.length),available-missingBatters));
  const batterCount=available-pitcherCount;
  const roles=['先発','中継ぎ','抑え'],targets=[14,14,4];
  const counts=roles.map(role=>pitchers.filter(p=>(p.subtype||p.pos)===role).length),pitcherRoles=[];
  for(let i=0;i<pitcherCount;i++){
    const next=roles.map((role,j)=>({role,j,gap:targets[j]-counts[j]})).sort((a,b)=>b.gap-a.gap)[0];
    pitcherRoles.push(next.role);counts[next.j]++;
  }
  const byPos=new Map(FIELDING_POSITIONS.map(pos=>[pos,batters.filter(p=>p.pos===pos).length])),batterPositions=[];
  const add=pos=>{batterPositions.push(pos);byPos.set(pos,byPos.get(pos)+1);};
  while(batterPositions.length<batterCount&&byPos.get('捕手')<MIN_TOTAL_BY_POS['捕手'])add('捕手');
  for(const pos of FIELDING_POSITIONS)if(!byPos.get(pos)&&batterPositions.length<batterCount)add(pos);
  while(batterPositions.length<batterCount)add([...FIELDING_POSITIONS].sort((a,b)=>byPos.get(a)-byPos.get(b))[0]);
  return {pitcherRoles,batterPositions};
}
