import {expect,it} from 'vitest';
import {indexReviewedFacts} from '../../src/data/reviewedPlayerFacts.js';
import {compilePlayerMaster} from '../../src/data/playerMasterSchema.js';
import {applyJournal} from './apply-reviewed.mjs';

function fixture() {
 const players=Array.from({length:840},(_,i)=>({playerId:`npb:${String(i).padStart(8,'0')}`,name:`Fixture ${i}`,teamId:i%12,
  registration:i<720?'controlled':'development',kind:'pitcher',throws:'right',bats:'left',birthDate:'2000-01-01',pos:'先発',
  salaryStatus:'game-assumption',gameSalaryManYen:i<720?420:240,contractStatus:'game-assumption',gameContractEndYear:2026,
  foreignQuotaStatus:'domestic',sourceIds:['synthetic'],history:[]}));
 return {schemaVersion:1,asOf:'2026-03-27',status:'verified',players,
  sources:[{id:'synthetic',url:'https://example.org/fixture',redistribution:'unconfirmed'}],
  teams:Array.from({length:12},(_,teamId)=>({teamId,controlled:60,development:10,verified:true}))};
}
it('keeps population and records intact, reports exact changes, and preserves the publication gate',()=>{
 const master=fixture(),original=structuredClone(master),index=indexReviewedFacts({schemaVersion:1,asOf:master.asOf,
  sources:[{id:'renewal',url:'https://example.org/renewal',knownBy:'2025-12-01',dateEvidence:'fixture event'}],
  players:[{playerId:'npb:00000000',teamId:0,salaryStatus:'reported',salaryManYen:1200,salarySeason:2026,salaryBasis:'reported-annual',evidence:{salary:['renewal']}}]});
 expect(()=>applyJournal(master,undefined,index)).toThrow(/rights/);
 const result=applyJournal(master,undefined,index,{localImport:true});
 expect(result.report).toMatchObject({added:[],removed:[],changed:['npb:00000000'],confidence:{reportedSalary:1}});
 expect(result.report.changedValues[0].changes.salaryManYen).toEqual({before:null,after:1200});
 expect(result.master.players[0]).toMatchObject({gameContractEndYear:2026,history:[]});
 expect(master).toEqual(original);expect(()=>compilePlayerMaster(result.master)).toThrow(/rights/);
});
it('reports options and game quota flags even when statuses and end years stay the same',()=>{
 const master=fixture();Object.assign(master.players[0],{foreignQuotaStatus:'unknown',gameIsForeign:false,foreignQuotaBasis:'unknown',contractBasis:'unknown'});
 const index=indexReviewedFacts({schemaVersion:1,asOf:master.asOf,
  sources:[{id:'review',url:'https://example.org/review',knownBy:'2026-01-01',dateEvidence:'fixture'}],
  players:[{playerId:'npb:00000000',teamId:0,foreignQuotaStatus:'unknown',gameIsForeign:true,foreignQuotaBasis:'unknown',
   contractStatus:'game-assumption',gameContractEndYear:2026,contractBasis:'unknown',contractOption:{year:2027,holder:'club'},
   evidence:{foreignQuota:['review'],contract:['review']}}]});
 const {report}=applyJournal(master,undefined,index,{localImport:true});
 expect(report.changedValues[0].changes).toMatchObject({gameIsForeign:{before:false,after:true},contractOption:{before:null,after:{year:2027,holder:'club'}}});
});
