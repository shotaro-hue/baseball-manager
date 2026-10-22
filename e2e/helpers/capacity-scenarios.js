import {farmChecksum,sealFarmCompetition} from '../../src/engine/farmRecordStats';
import {matchHistoryForSave} from '../../src/engine/matchHistory';

// Capacity fixtures repeat a real season's statistics. They are NOT 20-year simulations.
export function capacityScenario(fixture,years) {
  const state=structuredClone(fixture.hanshin106);
  if(!years)return state;
  const history=matchHistoryForSave(fixture.completed);
  state.scheduleArchive=Array.from({length:Math.min(5,years)},(_,i)=>({year:2025-i,schedule:fixture.completed.schedule,
    gameResultsMap:history.gameResultsMap,myTeamResultsMap:history.allTeamResultsMap[state.myId]}));
  state.seasonHistory.farmArchives=Array.from({length:years},(_,i)=>({...structuredClone(fixture.farmArchive),year:2026-years+i}));
  state.farmCompetition.archiveSignature=farmChecksum(state.seasonHistory.farmArchives);sealFarmCompetition(state.farmCompetition);
  for(const team of state.teams) {
    const template=team.players.slice(0,8);
    team.history=Array.from({length:years},(_,i)=>template.map((p,index)=>({ ...structuredClone(p),id:`capacity-alumnus-${team.id}-${i}-${index}`,
      exitYear:2026-years+i,exitReason:'引退',tenure:10,careerLog:[],recentCareerLog:[],
    }))).flat();
    for(const player of [...team.players,...team.farm]) {
      player.careerLog=Array.from({length:years},(_,i)=>({year:2026-years+i,teamName:team.name,teamId:team.id,stats:{...player.stats,sprayPoints:[],battedBallEvents:[]}}));
      delete player.recentCareerLog;
    }
  }
  state.seasonHistory.standingsHistory=Array.from({length:years},(_,i)=>({year:2026-years+i,central:state.teams.filter(t=>t.league==='セ').map(t=>({id:t.id,wins:t.wins,losses:t.losses})),pacific:state.teams.filter(t=>t.league==='パ').map(t=>({id:t.id,wins:t.wins,losses:t.losses}))}));
  return state;
}

export async function capacitySignature(s) {
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).join(',');
  return {year:s.year,day:s.gameDay,myId:s.myId,
    players:await digest(s.teams.map(t=>[t.id,t.players.map(p=>[p.id,p.salary,p.contractYearsLeft,p.stats]),t.farm.map(p=>[p.id,p.salary,p.stats]),t.history])),
    history:await digest(s.seasonHistory),matches:await digest(s.scheduleArchive),farm:await digest(s.farmCompetition),
    results:await digest(matchHistoryForSave(s).gameResultsMap),mail:await digest(s.mailbox),news:await digest(s.news),fa:await digest(s.faPool)};
}
