// Deterministic display fixture only. Not an application route or save format.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';
import { ResultScreen } from '../../../src/components/ResultScreen';
const team = {id:0,name:'自球団',short:'自球団',emoji:'⚾',players:[],farm:[],wins:1,losses:0,draws:0};
const opponent = {...team,id:1,name:'対戦球団',short:'対戦球団'};
const result = {score:{my:3,opp:2},isHome:true,gameNo:1,log:[],inningSummary:Array.from({length:9},(_,i)=>[{inning:i+1,isTop:true,runs:i===2?2:0},{inning:i+1,isTop:false,runs:i===4?3:0}]).flat()};
createRoot(document.getElementById('root')).render(<ResultScreen isPostGameProcessing={false} gsResult={result} myTeam={team} oppTeam={opponent} onNext={()=>{document.body.dataset.returned='true';}}/>);
