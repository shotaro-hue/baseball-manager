import {useEffect,useMemo,useRef,useState} from 'react';
import {ensureDraftEvaluation,startDraftEvaluation} from '../engine/draftReports';

export function useDraftEvaluation({evaluation,onEvaluationChange,teams,pool,year,myId,draftAllocation,savedState,started=false}) {
  const [local,setLocal]=useState(()=>{
    let s=ensureDraftEvaluation({existing:evaluation || savedState?.evaluation,teams,pool,year,myId,allocation:draftAllocation,legacy:savedState});
    // Old later-round saves already contain the automatic/manual disclosure set.
    if(!evaluation && !savedState?.evaluation && Array.isArray(savedState?.scouted)) s={...s,locked:true};
    return started?startDraftEvaluation(s,pool,draftAllocation):s;
  });
  const session=useMemo(()=>{
    const raw=evaluation?.locked || !started ? (evaluation || local) : local;
    const checked=ensureDraftEvaluation({existing:raw,teams,pool,year,myId,allocation:draftAllocation,legacy:savedState});
    return started?startDraftEvaluation(checked,pool,draftAllocation):checked;
  },[evaluation,local,teams,pool,year,myId,started]);
  const current=useRef(session), callback=useRef(onEvaluationChange);
  current.current=session;callback.current=onEvaluationChange;
  useEffect(()=>{if(evaluation!==session)callback.current?.(session);},[evaluation,session]);
  const update=updater=>{
    const next=updater(current.current);
    if(next===current.current)return;
    current.current=next;setLocal(next);callback.current?.(next);
  };
  return {session,update};
}
