import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import source from '../ui02b/team.json';
import { emptyStats } from '../../../src/engine/playerCore';
import { StatsTab } from '../../../src/components/tabs/StatsTab';
import { LeaderboardTab } from '../../../src/components/tabs/LeaderboardTab';
import { PlayerModal } from '../../../src/components/PlayerModal';
import { PlayerComparisonDialog, PlayerComparisonTray } from '../../../src/components/PlayerComparisonTray';
import { CareerTable } from '../../../src/components/tabs/CareerTable';
import { saveGame, loadGame } from '../../../src/engine/saveload';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';
import '../../../src/calm-details.css';

const stats = { ...emptyStats(), PA:500, AB:450, H:129, D:25, T:3, HR:14, BB:40, HBP:5, SF:5, OPS:.8 };
const team = structuredClone(source), base = team.players.find(p=>!p.isPitcher);
const log = [{year:2026,teamId:team.id,teamName:team.name,stats,playoffStats:{...emptyStats(),PA:4,AB:4,H:1}}];
team.players = [
  {...base,id:'s3-low',name:'佐藤海斗',stats,recentCareerLog:log},
  {...base,id:'s3-high',name:'精度比較',stats:{...stats,H:130,D:26},recentCareerLog:[]},
  {...base,id:'s3-tie',name:'同値比較',stats:{...stats,H:130,D:26},recentCareerLog:[]},
  {...base,id:'s3-missing',name:'部分欠測',stats:{...emptyStats(),PA:20,AB:20,H:null},recentCareerLog:[]},
];
team.farm=[];
function Fixture() {
  const [ready,setReady]=useState(false),[teams,setTeams]=useState([team]),[view,setView]=useState('stats'),[profile,setProfile]=useState(null),[compared,setCompared]=useState([]),[open,setOpen]=useState(false),[status,setStatus]=useState('');
  useEffect(()=>{
    saveGame({saveId:'fix-s3-browser',year:2026,gameDay:144,myId:team.id,teams:[team],seasonHistory:{},news:[],mailbox:[],gameResultsMap:{}},
      {initialCareerLogs:[{playerId:'s3-low',careerEntries:log}]}).then(result=>{if(!result.ok)throw new Error('fixture save failed');setReady(true);});
  },[]);
  const toggle=p=>setCompared(prev=>prev.some(x=>x.id===p.id)?prev.filter(x=>x.id!==p.id):prev.length<2?[...prev,{...p,_teamName:team.name}]:prev);
  const restore=async()=>{
    const state={saveId:'fix-s3-browser',year:2026,gameDay:144,myId:team.id,teams,seasonHistory:{},news:[],mailbox:[],gameResultsMap:{}};
    const saved=await saveGame(state,{initialCareerLogs:[{playerId:'s3-low',careerEntries:log}]});
    if(!saved.ok)throw new Error(saved.error||'save failed');
    const loaded=await loadGame();setTeams(loaded.teams);setStatus('保存・再開済み');
    window.s3Snapshot={before:state.teams,after:loaded.teams};
  };
  if(!ready)return <p>検証用の旧履歴を保存中</p>;
  return <div className="app calm-shell" style={{padding:12,maxWidth:1320,margin:'auto'}}>
    <h1>OPS 表示整合性</h1>
    <nav aria-label="検証画面">{[['stats','一軍成績'],['league','ランキング'],['career','年度別・通算']].map(([key,label])=><button key={key} onClick={()=>setView(key)}>{label}</button>)}<button onClick={restore}>保存して再開</button></nav><p role="status">{status}</p>
    {view==='stats'&&<StatsTab teams={teams} myId={team.id} year={2026} onPlayerClick={setProfile} onToggleCompare={toggle} comparePlayerIds={compared.map(p=>p.id)}/>}
    {view==='league'&&<LeaderboardTab teams={teams} myId={team.id} year={2026} gameDay={144} onPlayerClick={setProfile} onToggleCompare={toggle} comparePlayerIds={compared.map(p=>p.id)}/>}
    {view==='career'&&<CareerTable player={teams[0].players[0]} year={2026} saveId="fix-s3-browser"/>}
    <PlayerComparisonTray players={compared} onRemove={id=>setCompared(c=>c.filter(p=>p.id!==id))} onClear={()=>setCompared([])} onOpen={()=>setOpen(true)}/>
    {profile&&<PlayerModal key={profile.id} player={profile} teams={teams} teamName={team.name} year={2026} saveId="fix-s3-browser" isMyTeam onClose={()=>setProfile(null)} onToggleCompare={toggle} isCompared={compared.some(p=>p.id===profile.id)}/>}
    {open&&<PlayerComparisonDialog year={2026} teams={teams} players={compared} onRemove={id=>{setCompared(c=>c.filter(p=>p.id!==id));setOpen(false);}} onClose={()=>setOpen(false)}/>}
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
