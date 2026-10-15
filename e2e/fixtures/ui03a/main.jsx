import React,{useCallback,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import OffseasonPlanningScreen from '../../../src/components/OffseasonPlanningScreen';
const state=new URLSearchParams(location.search).get('state')||'normal';
const p=(id,extra={})=>({id,name:`選手${id}`,pos:id%2?'先発':'捕手',isPitcher:id%2===1,age:26,salary:1000,contractYearsLeft:1,daysOnActiveRoster:0,stats:{},personality:{money:50},...extra});
const players=Array.from({length:6},(_,id)=>p(id));
if(state==='long')players[0].name='アレクサンダー・とても長い選手名・表示確認';
if(state==='zero')players.forEach(p=>p.salary=0);
if(state==='missing')players.forEach(p=>p.salary=null);
const club={id:0,name:'東京ヤクルトスワローズ',league:'セ',players:players.slice(0,3),farm:players.slice(3).map((p,i)=>({...p,育成:i===2})),lineup:[0,2],rotation:[1],budget:state==='zero'?0:state==='missing'?null:82000};
if(state==='empty'){club.players=[];club.farm=[];}
const initial={version:1,year:2026,myId:0,stage:['open','review','error','throw'].includes(state)?'open':'planning',tab:state==='review'?'review':'roster',intents:[{id:2,value:'release'},{id:1,value:'retain'}],demands:Object.fromEntries(players.map(p=>[p.id,{demandSalary:1500,minAcceptSalary:1200}])),releasedIds:[],growth:{growth:[],decline:[],breakout:[]}};
const status=new URLSearchParams(location.search).get('status');
if(['cooldown','free_requested'].includes(status))initial.session={baseline:6000,others:[],entries:players.map(player=>({player,demand:initial.demands[player.id],status:player.id===0?status:'pending',salary:'1500',years:1,round:3,retries:0,logs:['保存された返答']}))};
let attempts=0;
function Fixture(){const[plan,setPlan]=useState(initial);const[teams,setTeams]=useState([club]);const handleSave=useCallback(async()=>{document.body.dataset.action='save';return {ok:true};},[]);
 const gs={offseasonPlan:state==='stale'?{...plan,year:2025}:plan,setOffseasonPlan:setPlan,teams,setTeams,myId:0,year:2026,saveId:'fixture',faPool:[],faYears:{},saveDirty:state==='dirty',saveQueueState:{isSaving:state==='saving'},saveResult:state==='save-error'?{ok:false}:state==='partial'?{ok:true,archive:{ok:false}}:state==='saved'?{ok:true}:null,handleSave,getSeasonHistory:()=>({}),notify:()=>{}};
 const os={handlePlanningRelease:()=>{document.body.dataset.action='release';attempts++;if(state==='throw'&&attempts===1)throw Error('fixture transaction failure');return state==='error'&&attempts===1?false:true;},handlePlanningFinish:()=>{document.body.dataset.action='finish';return state==='error'?false:true;},handleContractRenewalSign:()=>{}};
 return <OffseasonPlanningScreen gs={gs} os={os} myTeam={club} myId={0} year={2026}/>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
