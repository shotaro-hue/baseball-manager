import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';
import '../../../src/calm-details.css';
import {RosterTab} from '../../../src/components/tabs/RosterTab';
import teamSource from '../ui02b/team.json';
import {record} from '../../../src/engine/__tests__/farmRankingFixtures';
import {MAX_SHIHAKA_TOTAL} from '../../../src/constants';
const state=new URLSearchParams(location.search).get('state')||'normal',team=structuredClone(teamSource);
if(state==='long')for(const p of [...team.players,...team.farm])p.name+='・長い選手名を含む表示確認';
if(state==='empty'){team.players=[];team.farm=[];team.lineup=[];team.rotation=[];}
if(state==='missing')for(const p of [...team.players,...team.farm]){delete p.morale;delete p.condition;delete p.potential;delete p.age;delete p.salary;}
if(state==='zero')for(const p of [...team.players,...team.farm]){p.morale=0;p.condition=0;p.potential=0;}
if(state==='injured')for(const p of team.farm)p.injuryDaysLeft=4;
if(state==='cooldown')for(const p of team.farm)p.registrationCooldownDays=5;
if(state==='talk-wait')for(const p of team.players)p.lastTalkGameDay=19;
if(['register','budget','limit'].includes(state)){
 team.players=team.players.slice(0,27);Object.assign(team.farm[0],{育成:true,salary:240});team.budget=state==='budget'?0:1000;
 if(state==='limit')team.farm.push(...Array.from({length:MAX_SHIHAKA_TOTAL},(_,i)=>({...team.farm[1],id:'limit'+i,name:'支配下'+i,育成:false})));
}
if(state==='foreign'){team.players=team.players.slice(0,3).map(p=>({...p,isForeign:true,isPitcher:true}));Object.assign(team.farm[0],{育成:false,isForeign:true,isPitcher:true});}
const farmState={year:2026,teams:[team]};
if(state==='legacy')for(const p of team.farm)p.stats2={PA:10,H:4,HR:1};
if(state==='partial'||state==='measured'){
 const r=record();r.startRound=state==='partial'?6:1;
 const batter=team.farm.find(p=>!p.isPitcher),pitcher=team.farm.find(p=>p.isPitcher);
 r.players=[{...r.players[3],playerId:batter.id,name:batter.name},{...r.players[4],playerId:pitcher.id,name:pitcher.name}];
 farmState.farmCompetition=r;
}
const recordAction=(name,args)=>{const actions=JSON.parse(document.body.dataset.actions||'[]');actions.push({name,args});document.body.dataset.actions=JSON.stringify(actions);};
const callbacks=Object.fromEntries(['Promo','ConvertIkusei','SetDevGoal','PlayerClick','PlayerTalk'].map(name=>['on'+name,(...args)=>recordAction(name,args)]));
createRoot(document.getElementById('root')).render(<div className="app calm-shell" style={{maxWidth:1320,margin:'auto',padding:16}}>
 <RosterTab team={team} allTeams={[team]} farmState={farmState} gameDay={20} {...callbacks}/>
</div>);
