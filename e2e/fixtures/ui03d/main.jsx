import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import {GrowthSummaryScreen} from '../../../src/components/OffseasonReviewScreens';
const params=new URLSearchParams(location.search),state=params.get('state')||'normal';
const base=(id,name,pos,age,ability)=>({id,name,pos,age,salary:1000,stats:{},personality:{money:50},contractYearsLeft:1,batting:ability});
const old=[base(0,'佐藤 海斗','遊撃手',23,{contact:72,power:64,speed:75}),{...base(1,'田中 悠真','先発',26,{}),isPitcher:true,pitching:{velocity:145,control:60,stamina:70}},base(2,'小林 樹','捕手',24,{defense:65,contact:50}),base(3,'山田 翔','外野手',35,{speed:70,power:60,arm:60})];
const current=[{...old[0],batting:{contact:78,power:68,speed:78}},{...old[1],pitching:{velocity:145,control:64,stamina:73}},{...old[2],batting:{defense:68,contact:51}},{...old[3],batting:{speed:65,power:57,arm:59}}];
let summary={breakout:[{p:old[0],diff:13}],growth:[{p:old[1],diff:7},{p:old[2],diff:4}],decline:[{p:old[3],diff:-9}]};
if(state==='long')old[0].name=current[0].name='アレクサンダー・とても長い選手名・成長確認';
if(state==='empty')summary={breakout:[],growth:[],decline:[]};
if(state==='missing')summary=null;
if(state==='partial')summary={...summary,decline:null};
if(state==='orphan')summary={breakout:[],growth:[{p:null,diff:4}],decline:[]};
if(state==='zero'){old[0].batting={contact:0,power:60};current[0].batting={contact:0,power:62,arm:50};summary={breakout:[],growth:[{p:old[0],diff:2}],decline:[]};}
if(state==='many'){summary={breakout:[],growth:[],decline:[]};current.length=0;for(let i=0;i<28;i++){const batting=Object.fromEntries(['contact','power','eye','speed','arm','defense','stealSkill','baseRunning','clutch','catching','vsLeft','breakingBall','recovery','durability'].map(key=>[key,60]));const p=base(i,`記録選手${i}`,'捕手',24,batting);summary.growth.push({p,diff:9});const after={...batting};for(const key of ['contact','power','eye','speed','arm','defense','stealSkill','baseRunning','clutch'])after[key]++;current.push({...p,batting:after});}}
const embedded=params.get('embedded')!=='false';
function Fixture(){const[open,setOpen]=useState(true);return open?<GrowthSummaryScreen teams={[{id:0,name:'東京ヤクルト',players:state==='missing-current'?[]:current,farm:[]}]} summary={summary} year={2026} myId={0} saveId="ui03d" embedded={embedded} onClose={()=>{document.body.dataset.action='close';setOpen(false);}} onNext={async()=>{document.body.dataset.action='advance';return state!=='failure';}}/>:<button onClick={()=>setOpen(true)}>成長結果を確認する</button>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
