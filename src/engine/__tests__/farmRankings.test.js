import {it,expect} from 'vitest';
import {selectFarmRanking,selectFarmYears,calcMeasuredFarmAwards} from '../farmRankings';
import {record} from './farmRankingFixtures';
import {calcSeasonAwards} from '../awards';

const state=c=>({year:2027,teams:[],seasonHistory:{farmArchives:[c]}});
it('ranks retired ID0 by historical league stints with exact ties and stable competition ranks',()=>{
 const s=state(record()),r=selectFarmRanking(s,{year:2026,league:'セ',kind:'batting',metric:'AVG',qualifiedOnly:true});
 expect(r.minPA).toBe(31);expect(r.rows.map(p=>[p.playerId,p.rank])).toEqual([[0,1],[1,1],[2,null]]);
 expect(r.rows[0].stats).toMatchObject({HR:3,H:10,AB:31,PA:33});expect(r.rows[0].teamIds).toEqual([0,1]);
 expect(selectFarmRanking(s,{year:2026,league:'パ',kind:'batting',metric:'HR'}).rows[0].stats.HR).toBe(7);
 expect(selectFarmRanking(s,{year:2026,league:'セ',teamId:0,kind:'batting',metric:'HR'}).rows[0].stats.HR).toBe(3);
 const all=selectFarmRanking(s,{year:2026,league:'セ',kind:'batting',metric:'HR'}).rows;expect(all.map(p=>p.rank)).toEqual([1,1,3,3]);
});
it('keeps a PA-qualified all-walk hitter in count rankings while AVG is uncomputable and titles exclude him',()=>{
 const c=record(),s=state(c),options={year:2026,league:'セ',qualifiedOnly:true};
 const walks=selectFarmRanking(s,{...options,metric:'BB'});expect(walks.rows[0]).toMatchObject({playerId:2,qualified:true,value:31});
 const avg=selectFarmRanking(s,{...options,metric:'AVG'}).rows.find(p=>p.playerId===2);expect(avg).toMatchObject({qualified:true,value:null,rank:null});
 expect(calcMeasuredFarmAwards(c,2026).eastern.batting.winners.map(p=>p.playerId)).not.toContain(2);
});
it('returns null rates for zero denominators and uses integer outs for ERA/IP',()=>{
 const s=state(record()),r=selectFarmRanking(s,{year:2026,league:'セ',kind:'pitching',metric:'ERA'});
 expect(r.rows.map(p=>p.playerId)).toEqual([4,5,6]);expect(r.rows[0].value).toBe(0);expect(r.rows[2]).toMatchObject({value:null,rank:null});
 expect(selectFarmRanking(s,{year:2026,league:'セ',kind:'batting',metric:'AVG'}).rows.at(-1).value).toBeNull();
});
it('lists measured years without creating a year from legacy estimates',()=>{
 expect(selectFarmYears({...state(record()),farmCompetition:{year:2027}})).toEqual([2027,2026]);
 expect(selectFarmYears({year:2027,teams:[]})).toEqual([]);
 expect(selectFarmRanking({}, {year:2026}).status).toBe('unrecorded');
});
it('ceil-qualifies by the whole league even for a low-game club filter, and does not mutate records',()=>{
 const c=record();c.standings[1].played=143;
 const before=structuredClone(c),r=selectFarmRanking(state(c),{year:2026,league:'セ',teamId:0,metric:'AVG',qualifiedOnly:true});
 expect(r.minPA).toBe(444);expect(r.rows).toEqual([]);expect(c).toEqual(before);
});
it('awards all tied measured league leaders, without the legacy 30 inning condition or current membership',()=>{
 const c=record(),r=calcMeasuredFarmAwards(c,2026);
 expect(r.status).toBe('complete');expect(r.eastern.minPA).toBe(31);
 expect(r.eastern.batting.winners.map(p=>p.playerId)).toEqual([0,1]);expect(r.eastern.hr.winners).toHaveLength(2);
 expect(r.eastern.wins.winners.map(p=>p.playerId)).toEqual([4,5]);
 expect(r.eastern.hr).toMatchObject({playerId:0,teamId:0,teamName:'東A／東B',value:3});
 expect(r.western.hr.value).toBe(7);
 const ts=[{id:0,name:'東A',league:'セ',players:[],farm:[],wins:0}];
 expect(calcSeasonAwards(ts,2026,{farmCompetition:c}).farmAwards).toEqual(r);
 expect(calcSeasonAwards(ts,2026,{farmCompetition:c}).titles).toEqual(calcSeasonAwards(ts,2026).titles);
});
it('does not grant annual titles for partial years, in-progress years, wrong years or all-zero leagues',()=>{
 for(const patch of [{startRound:20},{nextRound:40},{year:2025}]) {
  const r=calcMeasuredFarmAwards({...record(),...patch},2026);expect(r.status).not.toBe('complete');expect(r.eastern.hr).toBeNull();
 }
 const c=record();c.players=[];c.standings.forEach(t=>t.played=0);
 const r=calcMeasuredFarmAwards(c,2026);expect(r.eastern).toMatchObject({batting:null,hr:null,wins:null,minPA:0});
 const zero=record();zero.players.forEach(p=>p.teams.forEach(t=>{if(t.batting)t.batting.HR=0;if(t.pitching)t.pitching.W=0;}));
 expect(calcMeasuredFarmAwards(zero,2026).eastern.hr).toBeNull();expect(calcMeasuredFarmAwards(zero,2026).eastern.wins).toBeNull();
});
