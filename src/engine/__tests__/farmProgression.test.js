import {it,expect} from 'vitest';
import {teams,freeze} from './farmFixtures';
import {createFarmCompetition} from '../farmRecords';
import {prepareFarmProgress,finishFarmProgress} from '../farmProgression';
const state=()=>{const ts=teams();return {teams:ts,saveId:'progress',year:2026,gameDay:1,farmCompetition:createFarmCompetition({teams:ts,saveId:'progress',year:2026})};};
it('uses pregame farm only, returns compact records, and keeps initial snapshot immutable',()=>{
 const s=state(),before=structuredClone(s),progress=prepareFarmProgress(freeze(s),s.teams,1);
 expect(progress.competition.nextRound).toBe(2);expect(progress.competition.cards).toHaveLength(6);
 expect(progress.workload.some(x=>x.PA>0)).toBe(true);expect(s).toEqual(before);
 expect(JSON.stringify(progress.competition)).not.toContain('runnersBefore');
});
it('applies fatigue to actual ID after promotion, preserves official stats and never repeats lifecycle ticks',()=>{
 const s=state(),p=s.teams[0].farm[0];p.condition=80;p.registrationCooldownDays=2;
 const progress=prepareFarmProgress(s,s.teams,1),next=structuredClone(s.teams);
 next[0].farm=next[0].farm.filter(x=>x.id!==p.id);next[0].players=[{...p,registrationCooldownDays:1,stats:{PA:42}}];
 const updated=finishFarmProgress(next,progress,1),after=updated[0].players[0];
 expect(after.condition).toBeLessThan(80);expect(after.registrationCooldownDays).toBe(1);expect(after.stats.PA).toBe(42);
 expect(next[0].players[0].condition).toBe(80);
});
it('excludes injury1 before play and recovers/rests without decrementing injury or cooldown again',()=>{
 const s=state();s.teams[0].farm[0].injuryDaysLeft=1;s.teams[0].farm[0].condition=60;
 const progress=prepareFarmProgress(s,s.teams,1);expect(progress.competition.cards.some(c=>c.status==='unplayed')).toBe(true);
 const next=structuredClone(s.teams);next[0].farm[0].injuryDaysLeft=0;next[0].farm[0].registrationCooldownDays=1;
 const after=finishFarmProgress(next,progress,1)[0].farm[0];
 expect(after.injuryDaysLeft).toBe(0);expect(after.registrationCooldownDays).toBe(1);expect(after.condition).toBe(66);
});
it('records pitched official round once and preserves rest history across membership changes',()=>{
 const s=state(),progress=prepareFarmProgress(s,s.teams,1),next=finishFarmProgress(s.teams,progress,1);
 const used=progress.workload.find(x=>x.BF>0),p=next.flatMap(t=>t.farm).find(p=>p.id===used.playerId);
 expect(p.recentPitchingDays).toEqual([1]);expect(p.condition).toBeLessThan(100);
 expect(()=>prepareFarmProgress({...s,farmCompetition:progress.competition},next,1)).toThrow();
});
it('does not introduce farm into historical isolated engine callers',()=>{
 const s=state();delete s.farmCompetition;expect(prepareFarmProgress(s,s.teams,1)).toBeNull();
 expect(finishFarmProgress(s.teams,null,1)).toBe(s.teams);
});
