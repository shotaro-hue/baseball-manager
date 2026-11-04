import { parseContractDate } from './contractCalendar';
import { contractEmploymentAt } from './contractLedger';
import { employmentContractId, isLegacyOpening } from './seasonContract';
import { getFaProgress } from './contract';
import { isIkuseiPlayer } from './rosterCapacity';
import { removeDepartingPlayers } from './tradeTransaction';
import { validateMarketPlayer } from './annualAcquisitions';

const fail = (message='FA宣言・元契約・資格・補償根拠・確定証跡を確認してください。') => { throw new Error(message); };
const id = n => (typeof n === 'string' && n.trim()) || (Number.isSafeInteger(n) && n >= 0);
const stable = value => JSON.stringify(value,(_,v)=>v && !Array.isArray(v) && typeof v==='object'
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
const day = (year,suffix) => `${String(year).padStart(4,'0')}-${suffix}`;
const owned = t => [...t.players,...t.farm];
const declarations = s => s.faDeclarations === undefined ? [] : s.faDeclarations;
const ordered = list => [...list].sort((a,b)=>stable(a.contractId)<stable(b.contractId)?-1:1);
export const isFaDeclarationCommand = c => c?.type === 'declare-fa';
export function normalizeFaDeclarationCommand(c) {
  if (!c || c.type!=='declare-fa' || ![c.id,c.teamId,c.playerId,c.contractId].every(id)
    || !['domestic-fa','overseas-fa'].includes(c.kind)
    || Object.keys(c).some(k=>!['id','type','teamId','playerId','contractId','kind'].includes(k))) fail();
  return {id:c.id,type:c.type,teamId:c.teamId,playerId:c.playerId,contractId:c.contractId,kind:c.kind};
}

// Explicit game history, not a claim about real-life FA exercises. Missing old
// v2/migration origins stay unknown. Initial market evidence survives acceptance.
export function nativeFaExerciseOrigins(world) {
  return [...world.contractEconomy.engine.spending.ledger.records.map(r=>({playerId:r.contract.playerId,sourceType:'contract',
    sourceId:employmentContractId(r.contract),basis:'native-new-game',count:0})),
  ...world.faPool.map(p=>({playerId:p.id,sourceType:'market',sourceId:p.marketEntry.id,sourceEntry:structuredClone(p.marketEntry),basis:'native-new-game',count:0}))];
}
function inspectOrigins(state) {
  const origins=state.faExerciseOrigins===undefined?[]:state.faExerciseOrigins,seen=new Set();
  if (!Array.isArray(origins)) fail();
  const saveId=state.economyIdentity?.saveId;
  const records=new Map(state.spending.ledger.records.map(r=>[employmentContractId(r.contract),r]));
  const legacyPlayers=new Set(state.spending.ledger.records.filter(r=>isLegacyOpening(r.contract)).map(r=>r.contract.playerId));
  for (const o of origins) {
    if (!o || !id(o.playerId) || seen.has(String(o.playerId)) || o.basis!=='native-new-game' || o.count!==0
      || !['contract','market'].includes(o.sourceType) || Object.keys(o).sort().join(',')!==(o.sourceType==='market'?'basis,count,playerId,sourceEntry,sourceId,sourceType':'basis,count,playerId,sourceId,sourceType')) fail();
    if (legacyPlayers.has(o.playerId)) fail('旧移行契約の行使歴を新規ゲームの0回へ変換できません。');
    seen.add(String(o.playerId));
    const expected=JSON.stringify([o.sourceType==='contract'?'initial-contract':'initial-market',saveId,o.playerId]);
    if (o.sourceId!==expected) fail();
    if (o.sourceType==='contract') {
      const r=records.get(o.sourceId);
      if (!r || isLegacyOpening(r.contract) || r.contract.playerId!==o.playerId
        || r.actionId!==JSON.stringify(['initial-sign',saveId,o.playerId])) fail();
    } else {
      // A birth record outlives delisting/relisting, retirement and acquisition.
      // Never require the original listing to remain live. Its immutable source
      // snapshot is seeded only at new-game construction and frozen on overwrite.
      if (records.get(JSON.stringify(['initial-contract',saveId,o.playerId]))?.actionId===JSON.stringify(['initial-sign',saveId,o.playerId])) fail();
      const date=parseContractDate(o.sourceEntry?.enteredDate);
      if(date.year>state.season || stable(o.sourceEntry)!==stable({id:o.sourceId,kind:'released',enteredDate:day(date.year,'02-01')}))fail();
    }
  }
  return origins;
}
function exerciseFor(state,playerId,season,origins) {
  const origin=origins.find(o=>o.playerId===playerId);
  const prior=declarations(state).filter(d=>d.player?.id===playerId && d.season<season).sort((a,b)=>a.season-b.season);
  const countBefore=origin?prior.length:null;
  return {origin:origin?structuredClone(origin):null,priorDeclarationIds:prior.map(d=>d.id),countBefore,
    countAfter:countBefore===null?null:countBefore+1,exercise:prior.length?'repeat':origin?'first':'legacy-conservative-max'};
}
function employmentLookup(state) {
  const dates=new Map();
  return season=>{if(!dates.has(season))dates.set(season,contractEmploymentAt(state.spending.ledger,day(season,'11-30')));return dates.get(season);};
}
function classificationPlayers(state) {
  return [...state.teams.flatMap(owned),
    ...(state.offseasonDepartures??[]).map(d=>d.player),...(state.retirementReservations??[]).flatMap(r=>r.finalization?[r.finalization.player]:[]),
    ...declarations(state).map(d=>d.player),...(state.acquisitions??[]).map(a=>a.player),
    ...(state.faPersonnelMoves??[]).map(m=>m.player),...state.faPool];
}
function rankingFor(state,teamId,season,at) {
  const metadata=at.metadata??=classificationPlayers(state);
  const members=at(season).filter(e=>e.teamId===teamId).map(e=>{
    const p=metadata.find(p=>p?.id===e.contract.playerId && p.contractId===employmentContractId(e.contract));
    if(!p)fail('年俸順位の元名簿・外国人区分を確認できません。');
    return {playerId:e.contract.playerId,contractId:employmentContractId(e.contract),annualSalaryManYen:e.annualSalaryManYen,
      registrationType:e.registrationType,isForeign:Boolean(p.isForeign)};
  });
  return {season,teamId,date:day(season,'11-30'),members:ordered(members)};
}
function inspectRanking(state,r,at) {
  const b=r.ranking;
  if (!b || b.season!==r.season || b.teamId!==r.teamId || b.date!==day(r.season,'11-30') || !Array.isArray(b.members)) fail();
  const actual=at(r.season).filter(e=>e.teamId===r.teamId).map(e=>({playerId:e.contract.playerId,contractId:employmentContractId(e.contract),
    annualSalaryManYen:e.annualSalaryManYen,registrationType:e.registrationType}));
  if (stable(ordered(b.members.map(({isForeign,...m})=>m)))!==stable(ordered(actual))
    || b.members.some(m=>typeof m.isForeign!=='boolean') || stable(ordered(b.members))!==stable(b.members)) fail();
  if (r.season===state.season) {
    const metadata=at.metadata??=classificationPlayers(state);
    for (const member of b.members) {
      const p=metadata.find(p=>p?.id===member.playerId && p.contractId===member.contractId);
      if (!p || Boolean(p.isForeign)!==member.isForeign) fail('FA順位の外国人区分が元名簿・退団証跡と一致しません。');
    }
  }
  const own=b.members.find(m=>m.playerId===r.player.id && m.contractId===r.sourceContractId);
  if(!own || own.isForeign!==Boolean(r.player.isForeign) || own.registrationType!=='controlled')fail();
  if(own.isForeign)return 'exempt';
  const peers=b.members.filter(m=>m.registrationType==='controlled' && !m.isForeign);
  const first=1+peers.filter(m=>m.annualSalaryManYen>own.annualSalaryManYen).length;
  const last=first+peers.filter(m=>m.annualSalaryManYen===own.annualSalaryManYen).length-1;
  const rank=n=>n<=3?'A':n<=10?'B':'C';
  if(rank(first)!==rank(last))fail('同額年俸がFA補償ランク境界をまたぐため、宣言を確定できません。');
  return rank(first);
}
function expectedRecord(state,c,player,season,ranking,origins,at) {
  const source=state.spending.ledger.records.find(r=>employmentContractId(r.contract)===c.contractId);
  const e=at(season).find(e=>employmentContractId(e.contract)===c.contractId);
  const eligibility=getFaProgress(player);
  if(!source || !e || e.teamId!==c.teamId || e.contract.playerId!==c.playerId || e.contract.endSeason!==season
    || e.registrationType!=='controlled' || player?.id!==c.playerId || player.contractId!==c.contractId
    || player.isRetired || player._retireNow || isIkuseiPlayer(player) || !eligibility.recorded
    || !eligibility[c.kind==='domestic-fa'?'domestic':'overseas'].eligible) fail('FA宣言の所属・満了契約・支配下区分・資格を確認してください。');
  const r={id:c.id,season,teamId:c.teamId,player:structuredClone(player),sourceContractId:c.contractId,sourceRecord:structuredClone(source),
    sourceAnnualSalaryManYen:e.annualSalaryManYen,kind:c.kind,notifiedDate:day(season,'12-01'),effectiveDate:day(season,'12-01'),
    eligibility,ranking:structuredClone(ranking),exercise:exerciseFor(state,c.playerId,season,origins)};
  const rank=inspectRanking(state,r,at);
  r.marketEntry={id:JSON.stringify([c.id,'fa-market']),kind:c.kind,enteredDate:r.notifiedDate,originTeamId:c.teamId,compensationRank:rank,
    ...(['A','B'].includes(rank)?{compensationBasis:{previousAnnualSalaryManYen:e.annualSalaryManYen,exercise:r.exercise.exercise}}:{})};
  return r;
}
const reason = d=>d.kind==='domestic-fa'?'国内FA宣言':'海外FA宣言';
const history = d=>({...d.player,exitYear:d.season,exitReason:reason(d),tenure:d.player.serviceYears??1,faDeclarationId:d.id,marketEntry:d.marketEntry});

export function inspectAnnualFaDeclarations(state) {
  const list=declarations(state),origins=inspectOrigins(state),at=employmentLookup(state),seen=new Set(),people=new Set();
  const contexts=state.faDeclarationContexts===undefined?[]:state.faDeclarationContexts;
  if(!Array.isArray(list) || !Array.isArray(contexts) || (state.version!==2 && (list.length||origins.length||contexts.length)))fail();
  const contextIds=new Set(),contextKeys=new Set();
  for(const b of contexts){
    const key=stable([b?.teamId,b?.season]);
    if(!b || !id(b.id) || contextIds.has(String(b.id)) || contextKeys.has(key)
      || Object.keys(b).sort().join(',')!=='date,id,members,season,teamId'
      || !list.some(d=>b.id===JSON.stringify([d.id,'fa-ranking']) && d.teamId===b.teamId && d.season===b.season && d.ranking?.id===b.id))fail();
    contextIds.add(String(b.id));contextKeys.add(key);
  }
  for(const d of list) {
    if(!d || !id(d.id) || seen.has(String(d.id)) || !Number.isInteger(d.season) || d.season<1 || d.season>state.season
      || (d.season===state.season && (state.phase!=='offseason' || state.date<d.notifiedDate)))fail();
    const identity=JSON.stringify([String(d.player?.id),d.season]);if(people.has(identity))fail();people.add(identity);seen.add(String(d.id));
    const receipts=state.transactions.filter(t=>t.id===d.id),receipt=receipts[0];let c;
    try{c=normalizeFaDeclarationCommand(JSON.parse(receipt?.signature));}catch{fail();}
    const context=contexts.find(b=>b.id===d.ranking?.id && b.teamId===d.teamId && b.season===d.season);
    if(!context || stable(context)!==stable(d.ranking))fail('FA年俸順位の独立した確定根拠が一致しません。');
    const expected=expectedRecord(state,c,d.player,d.season,context,origins,at);
    if(receipts.length!==1 || c.id!==d.id || receipt.signature!==stable(c) || stable(receipt.faDeclaration)!==stable(d) || stable(expected)!==stable(d))fail();
    const alumni=state.teams.find(t=>t.id===d.teamId)?.history?.filter(p=>p.faDeclarationId===d.id)??[];
    if(alumni.length!==1 || stable(alumni[0])!==stable(history(d)))fail();
    const acquired=state.spending.resolvedReservations.some(h=>h.kind==='offer' && h.resolution==='accepted'
      && h.proposal.contract.playerId===d.player.id && stable(h.proposal.marketEntry)===stable(d.marketEntry));
    if(!acquired) {
      const p=state.faPool.find(p=>p.id===d.player.id && stable(p.marketEntry)===stable(d.marketEntry));
      if(!p || p.faDeclarationId!==d.id || p.contractId!==d.sourceContractId || p.isFA!==true || p.isWaiverReleased!==false
        || p.departureReason!==d.kind || p.faPreviousSalary!==d.sourceAnnualSalaryManYen || p.marketEntryReason!==reason(d)
        || p.faEnteredYear!==d.season || p.faOriginTeamId!==d.teamId)fail();
      validateMarketPlayer(p);
    }
  }
  for(const t of state.transactions) {
    let c;try{c=JSON.parse(t.signature);}catch{/* opaque legacy */}
    if((isFaDeclarationCommand(c)||t.faDeclaration!==undefined) && !seen.has(String(t.id)))fail();
  }
  for(const p of [...state.teams.flatMap(t=>t.history??[]),...state.faPool,...(state.acquisitions??[]).map(a=>a.player)])
    if(p?.faDeclarationId!==undefined && !list.some(d=>d.id===p.faDeclarationId && d.player.id===p.id))fail();
  return list;
}

export function createFaDeclaration(state,c,signature) {
  if(state.version!==2 || state.phase!=='offseason' || state.date!==day(state.season,'12-01'))fail('FA宣言は同年度12月1日のオフに確定してください。');
  const team=state.teams.find(t=>t.id===c.teamId),player=team && owned(team).find(p=>p.id===c.playerId);
  if(!player || declarations(state).some(d=>d.player.id===c.playerId && d.season===state.season))fail();
  if(state.spending.reservations.some(h=>h.proposal.contract.playerId===c.playerId))fail('回答待ちの正式留保を解決してからFA宣言してください。');
  if(state.spending.ledger.records.some(r=>r.contract.playerId===c.playerId && r.effectiveDate>state.date
    && contractEmploymentAt(state.spending.ledger,r.effectiveDate).some(e=>employmentContractId(e.contract)===employmentContractId(r.contract))))
    fail('受諾済み将来契約があるためFA宣言できません。');
  const at=employmentLookup(state),contexts=state.faDeclarationContexts??[];
  const ranking=contexts.find(b=>b.teamId===c.teamId && b.season===state.season)
    ?? {id:JSON.stringify([c.id,'fa-ranking']),...rankingFor(state,c.teamId,state.season,at)};
  const d=expectedRecord(state,c,player,state.season,ranking,inspectOrigins(state),at);
  const p={...player,salary:d.sourceAnnualSalaryManYen,isFA:true,isWaiverReleased:false,contractYearsLeft:0,marketEntry:d.marketEntry,
    faDeclarationId:d.id,departureReason:c.kind,marketEntryReason:reason(d),faPreviousSalary:d.sourceAnnualSalaryManYen,
    marketLastStats:player.stats,faEnteredYear:state.season,faOriginTeamId:team.id,faOriginTeamName:team.name,
    faOriginRoster:team.farm.some(p=>p.id===player.id)?'farm':'active'};
  return {...state,teams:state.teams.map(t=>t===team?{...removeDepartingPlayers(t,new Set([player.id])),history:[...(t.history??[]),history(d)]}:t),
    faDeclarationContexts:contexts.some(b=>b.id===ranking.id)?contexts:[...contexts,structuredClone(ranking)],
    faPool:[...state.faPool,p],faDeclarations:[...declarations(state),d],transactions:[...state.transactions,{id:c.id,signature,faDeclaration:structuredClone(d)}]};
}
