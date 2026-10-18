const histogram=values=>values.reduce((out,k)=>(out[k]=(out[k]||0)+1,out),{});
const range=values=>values.length?{min:Math.min(...values),max:Math.max(...values),mean:values.reduce((n,x)=>n+x,0)/values.length}:null;
const opportunity=p=>(p.PA??0)+(p.BF??0)+(p.farmPA??0)+(p.farmBF??0);
export function summarizeAi03(runs){
 const annual=[],cohorts=[],streaks=new Map(),zeroStreaks=[],decisionCounts={};
 let unplayedFarmCards=0;
 for(const run of runs){
  for(const season of run.seasons){
   unplayedFarmCards+=season.farmCards.unplayed;
   for(const d of season.cpuDecisions||[])if(d.teamId!==0){const key=`${d.type}:${d.reason??d.contractResult??'recorded'}`;decisionCounts[key]=(decisionCounts[key]||0)+1;}
   for(const t of season.afterOffseason.filter(t=>t.id!==0)){
    const picks=season.decisions.filter(d=>d.teamId===t.id),owned=t.playerUsage.filter(p=>!p.development);
    const key=`${run.seed}/${t.id}`,streak=picks.length===0?(streaks.get(key)||0)+1:0;
    streaks.set(key,streak);zeroStreaks.push(streak);
    annual.push({seed:run.seed,year:season.year,teamId:t.id,controlled:t.controlled,pitchers:t.pitchers,batters:t.controlled-t.pitchers,
     catchers:owned.filter(p=>!p.isPitcher&&p.pos==='捕手').length,positions:histogram(owned.filter(p=>!p.isPitcher).map(p=>p.pos)),
     nominations:picks.length,accepted:picks.filter(d=>!d.refused).length,refused:picks.filter(d=>d.refused).length,
     endReason:season.endedTeams[t.id]??null,zeroDraftStreak:streak,budget:t.budget,payroll:t.payroll,
     ageMean:owned.reduce((n,p)=>n+p.age,0)/Math.max(1,owned.length),
     ageBands:histogram(owned.map(p=>p.age<=24?'18-24':p.age<=29?'25-29':p.age<=34?'30-34':'35+')),
     marketClaims:season.phases.market.find(r=>r.id===t.id).marketClaims,
     departures:season.events.filter(e=>e.teamId===t.id&&e.type==='departure')});
    for(const d of picks.filter(d=>!d.refused)){
     let longest=0,current=0,first=null,observed=0;
     for(const later of run.seasons.filter(s=>s.year>season.year)){
      const p=later.seasonEnd.flatMap(t=>t.playerUsage).find(p=>p.id===d.id);
      if(!p){current=0;continue;}
      const usage=opportunity(p);observed++;first??=usage;
      current=usage===0?current+1:0;longest=Math.max(longest,current);
     }
     cohorts.push({seed:run.seed,id:d.id,teamId:t.id,draftedYear:season.year,observedSeasons:observed,firstOpportunity:first,longestZero:longest});
    }
   }
  }
 }
 const population=runs.flatMap(r=>r.seasons.flatMap(s=>s.afterOffseason.filter(t=>t.id!==0).flatMap(t=>t.playerUsage.filter(p=>!p.development))));
 const contingencies=runs.flatMap(r=>r.seasons.flatMap(s=>s.decisions.filter(d=>d.teamId!==0&&d.projectedCount>67)));
 const market=annual.flatMap(r=>r.marketClaims),departures=annual.flatMap(r=>r.departures),observed=cohorts.filter(c=>c.observedSeasons>0);
 return {completedSeasons:runs.reduce((n,r)=>n+r.seasons.length,0),cpuClubSeasons:annual.length,
  checkpoints:runs.reduce((n,r)=>n+r.checkpoints.length,0),controlledDistribution:histogram(annual.map(r=>r.controlled)),
  seventyRate:annual.length?annual.filter(r=>r.controlled===70).length/annual.length:null,
  nominations:range(annual.map(r=>r.nominations)),totalNominations:annual.reduce((n,r)=>n+r.nominations,0),
  accepted:range(annual.map(r=>r.accepted)),longestZeroDraft:Math.max(0,...zeroStreaks),fourYearZeroOccurrences:annual.filter(r=>r.zeroDraftStreak>=4).length,
  contingencyReasons:histogram(contingencies.map(d=>d.rosterReason)),zeroFutureBaselineContingencies:contingencies.filter(d=>d.rosterReason==='future-upgrade'&&d.futureBaseline===0).length,
  ageMean:range(annual.map(r=>r.ageMean)),ageBands:histogram(population.map(p=>p.age<=24?'18-24':p.age<=29?'25-29':p.age<=34?'30-34':'35+')),
  payroll:range(annual.map(r=>r.payroll)),budget:range(annual.map(r=>r.budget)),catchers:range(annual.map(r=>r.catchers)),pitchers:range(annual.map(r=>r.pitchers)),
  marketSignings:market.length,marketSpending:market.reduce((n,p)=>n+p.salary,0),departures:departures.length,departureReasons:histogram(departures.map(p=>p.reason??'unrecorded')),
  observedRookieCohorts:observed.length,rookieFirstZero:observed.filter(c=>c.firstOpportunity===0).length,
  rookieMultipleZero:observed.filter(c=>c.longestZero>=2).length,longestRookieZero:Math.max(0,...observed.map(c=>c.longestZero)),
  unplayedFarmCards,negativeBudget:annual.filter(r=>r.budget<0).length,decisionCounts,annual,cohorts};
}
