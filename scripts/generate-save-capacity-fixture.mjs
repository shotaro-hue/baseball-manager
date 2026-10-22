// Real 2026 Hanshin progression; no supplied user save is accessed.
import {createServer} from 'vite';
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
const vite=await createServer({server:{middlewareMode:true},cacheDir:'/tmp/save-capacity-fixture-vite'});
const originalRandom=Math.random;
try {
  let seed=20261022;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const {createInitialTeams}=await vite.ssrLoadModule('/src/engine/bootstrapTeams.js');
  const {generateSeasonSchedule}=await vite.ssrLoadModule('/src/engine/scheduleGen.js');
  const {createFarmCompetition}=await vite.ssrLoadModule('/src/engine/farmRecords.js');
  const {simulateSeasonBatch}=await vite.ssrLoadModule('/src/workers/seasonBatchCore.js');
  const {mergeMatchResultPatch}=await vite.ssrLoadModule('/src/engine/matchHistory.js');
  const {validateFarmArchive}=await vite.ssrLoadModule('/src/engine/farmMigration.js');
  const {farmStandings}=await vite.ssrLoadModule('/src/engine/farmRecordStats.js');
  const teams=createInitialTeams(),year=2026,saveId='capacity-hanshin-2026',myId=teams.find(t=>t.name.includes('阪神')).id;
  let state={teams,year,saveId,myId,gameDay:1,faPool:[],faYears:{},news:[],mailbox:[],
    seasonHistory:{awards:[],records:{},hallOfFame:[],championships:[],standingsHistory:[],transfers:[]},
    schedule:generateSeasonSchedule(year,teams),gameResultsMap:{},allTeamResultsMap:{},allTeamBoxScoresMap:{},scheduleArchive:[],
    farmCompetition:createFarmCompetition({teams,year,saveId}),farmCompetitionVersion:1,offseasonPlan:null};
  const fixture={seed:20261022,initial:structuredClone(state)};
  for(const count of [105,38]) {
    const result=simulateSeasonBatch({snapshot:state,count,autoManageMyTeam:true});
    state={...state,...result.nextState,...mergeMatchResultPatch(state,result)};
    if(count===105)fixture.hanshin106=structuredClone(state);
  }
  fixture.completed=state;
  const c=state.farmCompetition;
  fixture.farmArchive={version:1,saveId:c.saveId,modelVersion:c.modelVersion,year:c.year,startRound:c.startRound,nextRound:144,source:c.source,fullYearEligible:c.startRound===1,teams:c.teams,players:c.players,standings:farmStandings(c)};
  validateFarmArchive(fixture.farmArchive,saveId);
  writeFileSync('e2e/fixtures/save-capacity-generated.json.gz',gzipSync(JSON.stringify(fixture),{level:9}));
  console.log('Capacity fixture: Hanshin gameDay',fixture.hanshin106.gameDay,'completed',state.gameDay,'seed',fixture.seed);
} finally {Math.random=originalRandom;await vite.close();}
