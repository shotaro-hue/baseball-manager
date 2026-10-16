import { evaluateRosterCapacity, isIkuseiPlayer } from '../engine/rosterCapacity';
import {MAX_ROSTER,MAX_SHIHAKA_TOTAL,MAX_外国人_一軍,MIN_SALARY_SHIHAKA,TALK_COOLDOWN_DAYS} from '../constants';

// Read-only explanations of the existing callbacks. Actions remain authoritative.
export function promotionReasons(team,player) {
 const reasons=[];
 if(isIkuseiPlayer(player))reasons.push('先に支配下登録が必要');
 if((player.injuryDaysLeft??0)>0)reasons.push('負傷中');
 if((player.registrationCooldownDays??0)>0)reasons.push(`再登録まで${player.registrationCooldownDays}日`);
 if(team.players.length>=MAX_ROSTER)reasons.push('一軍枠満杯');
 if(player.isForeign){
  const foreigners=team.players.filter(p=>p.isForeign);
  if(foreigners.length>=MAX_外国人_一軍)reasons.push('外国人枠満杯');
  else if(foreigners.length===MAX_外国人_一軍-1&&foreigners.every(p=>Boolean(p.isPitcher)===Boolean(player.isPitcher)))reasons.push('外国人枠を投手のみ・野手のみにできません');
 }
 return reasons;
}
export function registrationPreview(team,player,draftContext={}) {
 const capacity=evaluateRosterCapacity(team,draftContext);
 const count=capacity.ok?capacity.controlledCount:null;
 const salary=Number.isFinite(player.salary)?Math.max(player.salary,MIN_SALARY_SHIHAKA):null;
 const difference=salary===null?null:salary-player.salary;
 const remaining=difference!==null&&Number.isFinite(team.budget)?team.budget-difference:null;
 const reasons=[];
 if(!isIkuseiPlayer(player))reasons.push('既に支配下登録済み');
 if(!capacity.ok)reasons.push('支配下人数は未確認');
 if(capacity.ok&&capacity.remainingSlots<=0)reasons.push('支配下上限に到達');
 // Preserve this existing handler constraint even though shihaka and active slots differ.
 if(team.players.length>=MAX_ROSTER)reasons.push('一軍枠満杯のため現在の登録処理では実行不可');
 if(salary===null||remaining===null)reasons.push('年俸・予算が未記録');
 else if(difference>0&&team.budget<difference)reasons.push('予算不足');
 return {count,salary,difference,remaining,reasons,capacity};
}
export function talkCooldown(player,gameDay=0) {
 const last=player.lastTalkGameDay??0;
 return last>0?Math.max(0,TALK_COOLDOWN_DAYS-(gameDay-last)):0;
}
