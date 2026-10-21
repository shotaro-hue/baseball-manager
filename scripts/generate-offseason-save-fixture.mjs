// Reproducible game logic, no mocked standings or manually constructed offseason.
// Run: node scripts/generate-offseason-save-fixture.mjs (takes one real season).
import {createServer} from 'vite';
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
const vite=await createServer({server:{middlewareMode:true},cacheDir:'/tmp/offseason-fixture-vite'});
try {
 let seed=20261021;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const {createInitialTeams}=await vite.ssrLoadModule('/src/engine/bootstrapTeams.js');
 const {generateSeasonSchedule}=await vite.ssrLoadModule('/src/engine/scheduleGen.js');
 const {createFarmCompetition}=await vite.ssrLoadModule('/src/engine/farmRecords.js');
 const {simulateSeasonBatch}=await vite.ssrLoadModule('/src/workers/seasonBatchCore.js');
 const {initPlayoff,encodePlayoff}=await vite.ssrLoadModule('/src/engine/playoff.js');
 const teams=createInitialTeams(),year=2026,saveId='offseason-save-repro',myId=teams.find(t=>t.name.includes('DeNA')).id;
 let state={teams,year,saveId,myId,gameDay:1,faPool:[],faYears:{},news:[],mailbox:[],seasonHistory:{awards:[],records:{},hallOfFame:[],championships:[],standingsHistory:[],transfers:[]},schedule:generateSeasonSchedule(year,teams),gameResultsMap:{},allTeamResultsMap:{},allTeamBoxScoresMap:{},scheduleArchive:[],farmCompetition:createFarmCompetition({teams,year,saveId}),farmCompetitionVersion:1,offseasonPlan:null};
 const output={seed:20261021,initial:structuredClone(state)};
 for(const count of [72,71]){
  const r=simulateSeasonBatch({snapshot:state,count,autoManageMyTeam:true});
  const merge=(a,b)=>Object.fromEntries([...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].map(k=>[k,{...a?.[k],...b?.[k]}]));
  state={...state,...r.nextState,gameResultsMap:{...state.gameResultsMap,...r.gameResultsMapPatch},allTeamResultsMap:merge(state.allTeamResultsMap,r.allTeamResultsPatch),allTeamBoxScoresMap:merge(state.allTeamBoxScoresMap,r.allTeamBoxScoresPatch)};
  if(count===72)output.midseason=structuredClone(state);
 }
 state.offseasonPlan={version:1,year,myId,stage:'postseason',resumeScreen:'playoff',playoff:encodePlayoff(initPlayoff(state.teams,{year}))};
 output.postseason=state;
 writeFileSync('e2e/fixtures/offseason-save-2026.json.gz',gzipSync(JSON.stringify(output),{level:9}));
 console.log('Generated rounds',output.initial.gameDay,output.midseason.gameDay,state.gameDay,'seed',output.seed);
}finally{await vite.close();}
