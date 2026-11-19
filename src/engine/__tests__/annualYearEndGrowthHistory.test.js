import { expect,it } from 'vitest';
import { createInitialTeams } from '../bootstrapTeams';
import { budgetForecastWorld } from './fixtures/budgetForecast';
import { closeNativePostseason } from './fixtures/openOffseason';
import { releaseCommand } from './fixtures/inSeasonDepartures';
import { wrap } from './fixtures/annualRetirements';
import { growthCommand } from './fixtures/yearEndGrowth';
import { economyClockFor } from '../economyCalendar';
import { reduceEconomyCommand, toAnnualState } from '../contractEconomy';
import { openOffseasonRequest,reduceOpenOffseasonRequest } from '../annualOpenOffseason';
import { yearEndRetirementCandidates,yearEndRetirementsId } from '../annualYearEndRetirements';
import { createSeasonContract } from '../seasonContract';
import { validateEconomySave } from '../economyPersistence';
it('grows a player released and re-acquired under another contract in the closing year',()=>{
 let w=budgetForecastWorld(createInitialTeams());
 w.gameDay=100;w.contractEconomy.clock=economyClockFor({season:w.year,phase:'season',gameDay:w.gameDay,schedule:w.schedule});
 const t=w.teams[0],p=t.farm.find(p=>!p.isPitcher&&p.pos!=='捕手'&&!p.育成&&!p.isIkusei);
 expect(p).toBeDefined();
 let r=reduceEconomyCommand(w,releaseCommand(w,p.id));expect(r.ok,r.error).toBe(true);w=r.world;
 expect(validateEconomySave(w)).toBe('annual');
 const listed=w.faPool.find(q=>q.id===p.id);
 const proposal={id:'review-reacquire',type:'sign',teamId:t.id,offeredDate:w.contractEconomy.clock.date,effectiveDate:w.contractEconomy.clock.date,marketEntry:listed.marketEntry,
 contract:createSeasonContract({contractId:'review-new-contract',playerId:p.id,signedSeason:w.year,agreementPhase:'season',purpose:'acquisition',termYears:1,annualSalaryManYen:p.salary,guaranteed:true,registrationType:'controlled'})};
 r=reduceEconomyCommand(w,wrap(w,{id:'review-offer',type:'offer-fa',proposal}));expect(r.ok,r.error).toBe(true);w=r.world;
 r=reduceEconomyCommand(w,wrap(w,{id:'review-accept',type:'accept-fa',proposalId:proposal.id}));expect(r.ok,r.error).toBe(true);w=r.world;
 expect(w.teams[0].farm.some(q=>q.id===p.id)).toBe(true);expect(validateEconomySave(w)).toBe('annual');
 closeNativePostseason(w);r=reduceOpenOffseasonRequest(w,openOffseasonRequest(w));expect(r.ok,r.error).toBe(true);w=r.world;
 const decisions=yearEndRetirementCandidates(toAnnualState(w),w.myId).filter(p=>p.teamId===w.myId).map(p=>({playerId:p.playerId,choice:'accept'}));
 r=reduceEconomyCommand(w,wrap(w,{id:yearEndRetirementsId(w.year),type:'prepare-year-end-retirements',humanTeamId:w.myId,decisions}));expect(r.ok,r.error).toBe(true);w=r.world;
 r=reduceEconomyCommand(w,growthCommand(w));expect(r.ok,r.error).toBe(true);
 expect(r.world.contractEconomy.engine.transactions.at(-1).yearEndGrowth.rows.find(q=>q.playerId===p.id)?.inputs.contractId).toBe('review-new-contract');
 expect(validateEconomySave(r.world)).toBe('annual');
},60000);

import { growthSource } from './fixtures/yearEndGrowth';
it('keeps growth population after a subsequent real posting departure',()=>{
 let w=growthSource(),r=reduceEconomyCommand(w,growthCommand(w));expect(r.ok,r.error).toBe(true);w=r.world;
 const report=structuredClone(w.contractEconomy.engine.transactions.at(-1).yearEndGrowth),t=w.teams[2],p=t.players[0];p.postingRequested=true;
 r=reduceEconomyCommand(w,wrap(w,{id:'review-post-growth-posting',type:'end-contract',reason:'posting',teamId:t.id,playerId:p.id,contractId:p.contractId,settlement:'retain'}));
 expect(r.ok,r.error).toBe(true);expect(validateEconomySave(r.world)).toBe('annual');
 expect(r.world.contractEconomy.engine.transactions.find(t=>t.yearEndGrowth).yearEndGrowth).toEqual(report);
});
