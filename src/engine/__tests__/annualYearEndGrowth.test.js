import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { economyClockFor } from '../economyCalendar';
import { fromAnnualState } from '../contractEconomy';
import { savedYearEndSalary, growthCoachObservation } from '../annualYearEndGrowth';
import { calcPlayerDemand } from '../contract';
import { budgetForecastWorld } from './fixtures/budgetForecast';
import { createSeasonContract } from '../seasonContract';
import { expect, it, vi } from 'vitest';
import { yearEndReviewWorld } from './fixtures/yearEndRetirements';
import { wrap } from './fixtures/annualRetirements';
import { reduceEconomyCommand, toAnnualState } from '../contractEconomy';
import { yearEndRetirementCandidates, yearEndRetirementsId } from '../annualYearEndRetirements';
import { validateEconomySave } from '../economyPersistence';
import { calculateSalaryDemand } from '../salaryDemand';
import { createInitialTeams } from '../bootstrapTeams';

import { growthSource, growthCommand } from './fixtures/yearEndGrowth';

it('fixes growth and demands for all surviving active/farm players without changing salaries or old records', () => {
  const w = growthSource(createInitialTeams()), before = structuredClone(w), c = growthCommand(w);
  const rng = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('global RNG'); });
  let r; try { r = reduceEconomyCommand(w, c); } finally { rng.mockRestore(); }
  expect(r.ok, r.error).toBe(true);
  const g = r.world.contractEconomy.engine.transactions.at(-1).yearEndGrowth;
  const survivors = w.teams.flatMap(t => [...t.players, ...t.farm]).filter(p => !p.isRetired && !p._retireNow);
  expect(g.rows).toHaveLength(survivors.length); expect(new Set(g.rows.map(r => r.playerId)).size).toBe(survivors.length);
  expect(new Set(g.rows.map(r => r.teamId)).size).toBe(12);
  expect(g.rows.some(r => r.roster === 'farm' && r.teamId === w.myId)).toBe(true);
  expect(r.world.contractEconomy.engine.spending).toEqual(w.contractEconomy.engine.spending);
  for (const t of r.world.teams) for (const p of [...t.players, ...t.farm]) {
    const old = survivors.find(o => o.id === p.id), row = g.rows.find(r => r.playerId === p.id);
    expect(p.salary).toBe(old.salary); expect(p.stats).toEqual(old.stats); expect(p.age).toBe(old.age);
    expect(p.careerLog).toEqual(old.careerLog);
    expect(row.salary).toEqual(calculateSalaryDemand(old, { year: w.year, team: w.teams.find(x=>x.id===t.id), teams: w.teams }));
  }
  expect(g.rows.every(r => !(w.contractEconomy.engine.retirementReservations ?? []).some(x => x.finalization && x.playerId === r.playerId))).toBe(true);
  expect(reduceEconomyCommand(w, c)).toEqual(r); expect(w).toEqual(before);
  expect(reduceEconomyCommand(r.world, c)).toMatchObject({ ok: true, replayed: true });
  expect(validateEconomySave(JSON.parse(JSON.stringify(r.world)))).toBe('annual');
}, 60_000);

it('blocks posting between retirement and growth', () => {
  const w = growthSource();
  const r = reduceEconomyCommand(w, wrap(w, { id: JSON.stringify(['offseason-posting', w.year]), type: 'prepare-offseason-posting', humanTeamId: w.myId }));
  expect(r.ok).toBe(false); expect(r.error).toContain('成長');
});

it('keeps the opening year coaches after later staff edits, and validates history from saved inputs', () => {
  const w = growthSource();
  const opening = w.contractEconomy.cycle.transitionReceipts.find(r => r.kind === 'open-offseason');
  expect(opening.growthCoaches).toBeDefined();
  const a = reduceEconomyCommand(w, growthCommand(w)); expect(a.ok,a.error).toBe(true);
  const later = structuredClone(w); later.teams.forEach(t => { t.coaches = [{type:'batting',bonus:999,season:2027}]; });
  const b = reduceEconomyCommand(later,growthCommand(later)); expect(b.ok,b.error).toBe(true);
  expect(b.world.contractEconomy.engine.transactions.at(-1)).toEqual(a.world.contractEconomy.engine.transactions.at(-1));
  const n = a.world; n.teams.forEach(t => [...t.players,...t.farm].forEach(p => { p.age += 2; p.stats = {PA:0}; }));
  expect(validateEconomySave(n)).toBe('annual');
});

it.each(['remove row','change result','change salary','move before retirement'])('rejects corrupt growth evidence: %s', edit => {
  const w = growthSource(), r = reduceEconomyCommand(w,growthCommand(w)); expect(r.ok,r.error).toBe(true);
  const n = r.world, ts = n.contractEconomy.engine.transactions, g = ts.at(-1).yearEndGrowth;
  if(edit==='remove row')g.rows.pop();
  if(edit==='change result')g.rows[0].growth.growthPhase='made-up';
  if(edit==='change salary')g.rows[0].salary.demandSalary++;
  if(edit==='move before retirement')ts.unshift(ts.pop());
  expect(()=>validateEconomySave(n)).toThrow();
});

it('uses measured zero and missing performance separately and recorded old-year awards only', () => {
  const w = growthSource();
  const ps = w.teams.slice(2,5).map(t=>t.players[0]);
  ps[0].stats = {}; ps[1].stats = {PA:0};
  ps[2].stats = {PA:550,AB:480,H:170,BB:60,HBP:5,SF:5,D:30,T:3,HR:20};
  const t = w.teams[4], league = t.league === 'セ' ? 'central' : 'pacific';
  w.seasonHistory={awards:[{version:2,year:w.year,mvp:{[league]:{playerId:ps[2].id}}}]};
  const r = reduceEconomyCommand(w,growthCommand(w));expect(r.ok,r.error).toBe(true);
  const rows=r.world.contractEconomy.engine.transactions.at(-1).yearEndGrowth.rows;
  expect(rows.find(r=>r.playerId===ps[0].id).salary.assessment.recorded).toBe(false);
  expect(rows.find(r=>r.playerId===ps[1].id).salary.assessment.recorded).toBe(true);
  expect(rows.find(r=>r.playerId===ps[2].id).salary.assessment.titleBonus).toBe(.15);
});

it('keeps per-player results invariant under club/player order and unrelated random draws', () => {
  const w=growthSource(),a=reduceEconomyCommand(w,growthCommand(w));expect(a.ok,a.error).toBe(true);
  const other=structuredClone(w);other.teams.reverse();other.teams.forEach(t=>{t.players.reverse();t.farm.reverse();});
  for(let i=0;i<30;i++)Math.random();
  const b=reduceEconomyCommand(other,growthCommand(other));expect(b.ok,b.error).toBe(true);
  expect(b.world.contractEconomy.engine.transactions.at(-1)).toEqual(a.world.contractEconomy.engine.transactions.at(-1));
});

it.each(['request-posting','end-contract','complete-posting'])('blocks a direct %s shortcut before growth', type => {
  const w = growthSource(), t = w.teams[2], p = t.players[0];
  p.postingRequested = true;
  const r = reduceEconomyCommand(w, wrap(w,{id:'shortcut',type,teamId:t.id,playerId:p.id,contractId:p.contractId,...(type==='end-contract'?{reason:'posting',settlement:'retain'}:{}),...(type==='complete-posting'?{settlement:'retain',overseasContract:{kind:'minor',signingBonusUsdCents:0}}:{})}));
  expect(r.ok).toBe(false);expect(r.error).toContain('成長');
});

const canonical = v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
it.each(['coach mismatch','salary mismatch','missing member'])('rejects independently reproduced historical evidence corruption: %s', edit=>{
 const w=growthSource(),r=reduceEconomyCommand(w,growthCommand(w));expect(r.ok,r.error).toBe(true);
 const n=r.world,t=n.contractEconomy.engine.transactions.at(-1),g=t.yearEndGrowth;
 if(edit==='coach mismatch')n.contractEconomy.cycle.transitionReceipts[0].growthCoaches[2].coaches.push({type:'batting',bonus:99});
 if(edit==='salary mismatch'){g.rows[0].inputs.salary=50000;g.rows[0].salary=calculateSalaryDemand(g.rows[0].inputs,{...g.context,year:g.season,team:g.context.teams.find(t=>t.id===g.rows[0].teamId)});}
 if(edit==='missing member'){g.rows.pop();const c=JSON.parse(t.signature);c.playerIds.pop();t.signature=canonical(c);}
 expect(()=>validateEconomySave(n)).toThrow();
});

it('preserves saved growth after later ages, placement, stats and next-year engine projection',()=>{
 const w=growthSource(),r=reduceEconomyCommand(w,growthCommand(w));expect(r.ok,r.error).toBe(true);
 const n=r.world,g=structuredClone(n.contractEconomy.engine.transactions.at(-1).yearEndGrowth);
 const team=n.teams[2],p=team.players.pop();p.age+=2;p.stats={PA:0};team.farm.push(p);
 n.year=2027;n.gameDay=0;n.schedule=[];n.offseasonPlan=null;
 n.contractEconomy.clock=economyClockFor({season:2027,phase:'preseason'});n.contractEconomy.cycle.season=2027;n.contractEconomy.cycle.stage='new-season';
 const later=fromAnnualState(n,toAnnualState(n));expect(validateEconomySave(later)).toBe('annual');
 expect(later.contractEconomy.engine.transactions.at(-1).yearEndGrowth).toEqual(g);
 expect(reduceEconomyCommand(later,growthCommand(w))).toMatchObject({ok:true,replayed:true});
});

it('preserves formal reservations and future guaranteed contracts and reuses the fixed salary assessment',()=>{
 const source=budgetForecastWorld().teams.map(t=>({...t,players:t.players.map(p=>({...p,age:20,contractYearsLeft:1,stats:{PA:0}}))}));
 let w=growthSource(source);const p=w.teams[0].players[0];
 const proposal={id:'future-offer',type:'sign',teamId:w.myId,effectiveDate:'2027-02-01',contract:createSeasonContract({contractId:'future',playerId:p.id,signedSeason:2026,agreementPhase:'offseason',purpose:'renewal',termYears:2,annualSalaryManYen:2000,registrationType:'controlled',guaranteed:true})};
 let r=reduceEconomyCommand(w,wrap(w,{id:'future-reserve',type:'offer-renewal',contractId:p.contractId,proposal}));expect(r.ok,r.error).toBe(true);w=r.world;
 const before=structuredClone(w.contractEconomy.engine.spending);
 r=reduceEconomyCommand(w,growthCommand(w));expect(r.ok,r.error).toBe(true);expect(r.world.contractEconomy.engine.spending).toEqual(before);
 const fixed=savedYearEndSalary(r.world,p.id),changed={...r.world.teams[0].players[0],stats:{}};
 expect(calcPlayerDemand(changed,{},fixed)).toMatchObject(fixed);
 w=reduceEconomyCommand(r.world,wrap(r.world,{id:'future-accept',type:'accept-renewal',proposalId:proposal.id,contractId:p.contractId})).world;
 const future=structuredClone(w.contractEconomy.engine.spending);
 // Replay changes neither current salary nor the already accepted future contract.
 expect(reduceEconomyCommand(w,growthCommand(w))).toMatchObject({ok:true,replayed:true});
 expect(w.contractEconomy.engine.spending).toEqual(future);expect(validateEconomySave(w)).toBe('annual');
});

it('observes only the closing year coaches, retaining duplicate old bonuses',()=>{
 const coaches=[{type:'batting',bonus:5,season:2026},{type:'batting',bonus:3,season:2026},{type:'batting',bonus:99,season:2027}];
 expect(growthCoachObservation([{id:0,coaches}],2026)).toEqual([{teamId:0,coaches:[{type:'batting',bonus:5},{type:'batting',bonus:3}]}]);
});

it('loads the actual pre-growth opened native winter and adds growth without rewriting its opening',()=>{
 const w=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/yearEndGrowthOldOpen.json.gz',import.meta.url))));
 const opening=structuredClone(w.contractEconomy.cycle.transitionReceipts);
 expect(opening[0]).not.toHaveProperty('growthCoaches');expect(validateEconomySave(w)).toBe('annual');
 const r=reduceEconomyCommand(w,growthCommand(w));expect(r.ok,r.error).toBe(true);expect(validateEconomySave(r.world)).toBe('annual');
 expect(r.world.contractEconomy.cycle.transitionReceipts).toEqual(opening);
});
