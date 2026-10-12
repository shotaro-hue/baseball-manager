import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MobileHome} from '../../../src/components/MobileHome';
import {DashboardTab} from '../../../src/components/DashboardTab';
import HubHeader from '../../../src/components/hub/HubHeader';
import {regularSeasonRequest} from '../../../src/engine/seasonProgress';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';
import '../../../src/home-ui.css';
const player={id:0,name:'状態確認選手',pos:'二',age:25,condition:50,injuryDaysLeft:2,contractYearsLeft:1,batting:{contact:60,power:60,speed:60},stats:{AB:1,H:0}};
const base={id:0,name:'状態確認球団',short:'自軍',league:'セ',players:[player],lineup:[0],farm:[],wins:2,losses:1,draws:1};
const opponent={...base,id:1,name:'対戦相手',short:'相手',players:[]};
const schedule={5:{date:{month:4,day:1},matchups:[{homeId:0,awayId:1}]}};
function App(){
 const [state,setState]=useState('no-schedule');
 const myTeam=state==='complete'?{...base,wins:143,losses:0,draws:0}:base;
 const gameDay=state==='complete'?144:state==='blocked'?6:5;
 const currentSchedule=state==='no-schedule'?null:schedule;
 const request=regularSeasonRequest({teams:[myTeam,opponent],myId:0,year:2026,gameDay,schedule:currentSchedule},1);
 const props={myTeam,teams:[myTeam,opponent],schedule:currentSchedule,gameDay,year:2026,canSim:request.count>0,simReason:request.reason,batchProgress:state==='processing'?{phase:'試合を進行中',current:2,total:5}:null,recentResults:[],onTabSwitch:()=>{},onStartGame:()=>{},onBatchSim:()=>{},onSeasonSim:()=>{}};
 return <div className="app calm-shell calm-home" data-ds="home-shell" style={{maxWidth:1320,margin:'auto',padding:'0 16px 100px'}}>
  <p style={{fontSize:12}}>表示状態fixture。実試合・保存処理の成功を示すものではありません。</p>
  <label>表示状態<select style={{minHeight:44,fontSize:16,maxWidth:'100%'}} value={state} onChange={event=>setState(event.target.value)}>{[['no-schedule','日程なし'],['blocked','進行位置不一致'],['processing','処理中'],['complete','通常シーズン終了']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
  <HubHeader {...props} home remain={state==='complete'?0:139} saveDirty saveQueueState={{isSaving:false}} onSave={()=>{}}/>
  <MobileHome {...props}/><div className="desktop-dashboard"><DashboardTab {...props} disableStart={!props.canSim}/></div>
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
