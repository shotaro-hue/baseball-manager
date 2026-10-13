import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import { ScheduleTab } from '../../../src/components/tabs/ScheduleTab';
import { TeamDetailScreen } from '../../../src/components/TeamDetailScreen';
const state = new URLSearchParams(location.search).get('state') || 'normal';
const team = { id: 0, name: '東京ヤクルトスワローズ', short: 'ヤクルト', league: 'セ', players: [], farm: [], wins: 1, losses: 1, draws: 1 };
const opponent = { ...team, id: 1, name: state === 'long' ? 'とても長い相手球団名・表示確認ベースボールクラブ' : '阪神タイガース', short: '阪神' };
const schedule = [null, {date:{month:3,day:31},matchups:[{homeId:0,awayId:1}]}, {date:{month:4,day:1},matchups:[{homeId:1,awayId:0}]}, {date:{month:4,day:2},matchups:[{homeId:0,awayId:1}]}];
const batter = {id:0,name:state === 'long'?'長い選手名アレクサンダー・ベースボールプレイヤー':'佐藤 海斗',pos:'捕手',AB:4,H:0,HR:0,RBI:0,BB:0,K:1};
const pitcher = {id:1,name:'高橋 玲',ip:0,H:0,ER:0,BB:0,K:0,result:'S'};
const record = {homeId:0,awayId:1,won:true,drew:false,myScore:2,oppScore:0,oppName:opponent.name,inningScores:Array.from({length:12},(_,i)=>({inning:i+1,away:0,home:i===11?null:i===0?2:0})),myBatting:[batter],oppBatting:[{...batter,id:2,name:'相手 打者'}],myPitching:[pitcher],oppPitching:[{...pitcher,id:3,name:'相手 投手',result:'L'}]};
if(state==='missing'){delete record.myBatting;delete record.oppBatting;delete record.myPitching;delete record.oppPitching;delete record.inningScores;}
if(state==='partial'){delete record.myBatting;delete record.myPitching;delete record.inningScores;delete record.oppBatting[0].BB;}
const results = state === 'empty' ? {} : {1:record,2:{...record,homeId:1,awayId:0,won:false,drew:true,myScore:0,oppScore:0}};
const archive = [{year:2025,schedule,gameResultsMap:results,myTeamResultsMap:results}];
function Fixture(){return state === 'club' ? <TeamDetailScreen team={team} myTeam={team} allTeams={[team,opponent]} year={2026} schedule={schedule} allTeamResultsMap={{0:results}} allTeamBoxScoresMap={{0:results}} onBack={()=>{document.body.dataset.action='back';}} onOpenTrade={()=>{document.body.dataset.action='trade';}}/> : <main style={{maxWidth:1320,margin:'0 auto',padding:16}}><ScheduleTab myTeam={team} teams={[team,opponent]} schedule={state==='loading'?null:state==='empty'?[null]:schedule} year={2026} gameDay={2} gameResultsMap={results} scheduleArchive={archive}/></main>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
