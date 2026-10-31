import {expect,it} from 'vitest';
import {indexReviewedFacts,applyReviewedFacts,updateMasterFacts} from './reviewedPlayerFacts';

const fixture=()=>({schemaVersion:1,asOf:'2026-03-27',sources:[{id:'report',url:'https://example.org/renewal',publishedOn:'2025-12-01',knownBy:'2025-12-01',dateEvidence:'dated renewal report'}],
  players:[{playerId:'npb:12345678',legacyPlayerId:'legacy:1',teamId:2,salaryStatus:'reported',salaryManYen:1250,salarySeason:2026,salaryBasis:'reported-annual',contractStatus:'reported',contractStartYear:2025,contractEndYear:2027,contractBasis:'explicit-three-year-term',evidence:{salary:['report'],contract:['report']}}]});
it('updates the same stable player through full and legacy inputs without altering saved/source objects',()=>{
  const index=indexReviewedFacts(fixture()),legacy={playerId:'legacy:1',teamId:2,salary:5000,contractEndYear:2026,dataQuality:{history:'legacy'}};
  const before=structuredClone(legacy),a=applyReviewedFacts(legacy,index),b=applyReviewedFacts({...legacy,playerId:'npb:12345678'},index);
  expect(a).toEqual(b);expect(a).toMatchObject({playerId:'npb:12345678',salary:1250,contractEndYear:2027,dataQuality:{salary:'reported',contract:'reported',history:'legacy'}});
  expect(legacy).toEqual(before);expect(()=>applyReviewedFacts({...legacy,teamId:3},index)).toThrow(/team mismatch/);
});
it('does not turn annual salary evidence into a one-year contract',()=>{
  const journal=fixture(),p=journal.players[0];
  for(const key of ['contractStatus','contractStartYear','contractEndYear','contractBasis'])delete p[key];
  delete p.evidence.contract;
  expect(applyReviewedFacts({playerId:p.playerId,teamId:2,contractEndYear:2029},indexReviewedFacts(journal)).contractEndYear).toBe(2029);
});
it('does not carry an old contract option or total into newly reviewed terms',()=>{
  const result=applyReviewedFacts({playerId:'npb:12345678',teamId:2,contractOption:{year:2030},reportedContractTotalManYen:90000},indexReviewedFacts(fixture()));
  expect(result.contractOption).toBeUndefined();expect(result.reportedContractTotalManYen).toBeUndefined();
});
it.each([
 ['future publication',j=>j.sources[0].knownBy='2026-04-01'],
 ['undated publication',j=>delete j.sources[0].knownBy],
 ['wrong salary season',j=>j.players[0].salarySeason=2027],
 ['missing field evidence',j=>delete j.players[0].evidence.salary],
 ['annual-equivalent fact',j=>j.players[0].salaryBasis='reported-annual-equivalent-of-total'],
 ['duplicate identity',j=>j.players.push({...j.players[0]})],
 ['legacy alias collides with stable identity',j=>j.players[0].legacyPlayerId='npb:12345678'],
 ['unbound evidence',j=>j.players[0].evidence.foreignQuota=['missing']],
 ['fractional salary',j=>j.players[0].salaryManYen=12.5],
 ['unsupported mutation',j=>j.players[0].history=[]],
])('rejects %s',(_,mutate)=>{const j=fixture();mutate(j);expect(()=>indexReviewedFacts(j)).toThrow();});
it('keeps total/year annual equivalents as game assumptions and preserves source licensing status',()=>{
  const j=fixture();Object.assign(j.players[0],{salaryStatus:'game-assumption',gameSalaryManYen:100000,salaryBasis:'annual-equivalent-of-total'});delete j.players[0].salaryManYen;
  const m={asOf:'2026-03-27',players:[{playerId:'npb:12345678',teamId:2,salaryManYen:5000,salaryStatus:'reported'}],sources:[]},before=structuredClone(m);
  const updated=updateMasterFacts(m,indexReviewedFacts(j));
  expect(updated.players[0]).toMatchObject({salaryStatus:'game-assumption',gameSalaryManYen:100000});
  expect(updated.players[0].salaryManYen).toBeUndefined();expect(updated.sources[0].redistribution).toBe('unconfirmed');expect(m).toEqual(before);
});
it('rejects reusing a cleared source identity for a different URL',()=>{
 const j=fixture(),m={asOf:'2026-03-27',players:[{playerId:'npb:12345678',teamId:2}],sources:[{id:'report',url:'https://example.org/different',redistribution:'cleared',rightsEvidence:'only this URL'}]};
 expect(()=>updateMasterFacts(m,indexReviewedFacts(j))).toThrow(/source URL/);
});
