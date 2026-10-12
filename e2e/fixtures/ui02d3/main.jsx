import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';
import '../../../src/calm-details.css';
import source from '../ui02b/team.json';
import {FarmRankings} from '../../../src/components/FarmRankings';
import {PlayerModal} from '../../../src/components/PlayerModal';
import {record} from '../../../src/engine/__tests__/farmRankingFixtures';

const scenario=new URLSearchParams(location.search).get('state')||'normal';
const team=structuredClone(source), live=team.farm.find(p=>!p.isPitcher);
live.id=0;live.name='現役打者';live.stats2={PA:900,HR:99};
// Use only one live identity; other saved records represent departed players.
team.players=[];team.farm=[live];
const current={...record(),year:2027,nextRound:11},archive=record();
current.players[0].name=archive.players[0].name='現役打者';
current.standings=current.standings.map(t=>({...t,scheduled:12,unplayed:12-t.played,W:3,L:2,T:0}));
archive.standings=structuredClone(current.standings);
current.legacy={entries:[{playerId:0,stats:{PA:900,HR:99},year:null}]};
if(scenario==='long')current.players.forEach(p=>p.name+='・ロングネーム確認ロングネーム');
if(scenario==='partial')current.startRound=6;
if(scenario==='unplayed')current.cards=[{round:1,league:'セ',homeId:0,awayId:1,status:'unplayed',reasons:[{teamId:1,code:'insufficient-catcher',available:0,required:1}]}];
if(scenario==='empty')current.players=[];
const state={year:2027,teams:[team],farmCompetition:scenario==='legacy'?undefined:current,seasonHistory:{farmArchives:scenario==='legacy'?[]:[archive]}};
const before=JSON.stringify(state);
function Fixture(){
 const [profile,setProfile]=useState(null),[roster,setRoster]=useState(false);
 return <div className="app calm-shell" style={{padding:16}}>
  <FarmRankings state={state} onPlayerClick={(p,name,tab)=>setProfile({p,name,tab})}/>
  {roster&&<p role="status">編成へ戻りました</p>}
  <button onClick={()=>{if(JSON.stringify(state)!==before)throw new Error('閲覧がstateを変更');}}>閲覧データ非変更を確認</button>
  {profile&&<PlayerModal player={profile.p} teamName={profile.name} year={2027} teams={state.teams} farmState={state} isMyTeam initialSection={profile.tab} onClose={()=>setProfile(null)} onNavigate={()=>{setProfile(null);setRoster(true);}}/>}
 </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
