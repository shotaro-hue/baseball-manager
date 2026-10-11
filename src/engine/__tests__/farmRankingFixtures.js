import {emptyFarmStats,BAT_KEYS,PITCH_KEYS} from '../farmRecordStats';
const bat=(teamId,league,stats)=>({teamId,league,batting:{...emptyFarmStats(BAT_KEYS),G:10,...stats}});
const pitch=(teamId,league,stats)=>({teamId,league,pitching:{...emptyFarmStats(PITCH_KEYS),G:1,...stats}});
export const record=()=>({year:2026,startRound:1,nextRound:144,teams:[{teamId:0,league:'セ',name:'東A'},{teamId:1,league:'セ',name:'東B'},{teamId:6,league:'パ',name:'西A'}],standings:[{teamId:0,league:'セ',played:10},{teamId:1,league:'セ',played:9},{teamId:6,league:'パ',played:2}],players:[
 {playerId:0,name:'退団打者',isPitcher:false,teams:[bat(0,'セ',{PA:32,AB:30,H:10,HR:3}),bat(1,'セ',{PA:1,AB:1,H:0}),bat(6,'パ',{PA:9,AB:9,H:9,HR:7})]},
 {playerId:1,name:'同率打者',isPitcher:false,teams:[bat(1,'セ',{PA:62,AB:62,H:20,HR:3})]},
 {playerId:2,name:'分母なし',isPitcher:false,teams:[bat(0,'セ',{PA:31,BB:31})]},
 {playerId:3,name:'規定未達',isPitcher:false,teams:[bat(0,'セ',{PA:30,AB:30,H:29,HR:0})]},
 {playerId:4,name:'短回投手',isPitcher:true,teams:[pitch(0,'セ',{W:2,outs:15,ER:0,BF:15})]},
 {playerId:5,name:'同率投手',isPitcher:true,teams:[pitch(1,'セ',{W:2,outs:6,ER:2,BF:8})]},
 {playerId:6,name:'0アウト投手',isPitcher:true,teams:[pitch(0,'セ',{outs:0,BF:1,Hp:1})]},
]});
