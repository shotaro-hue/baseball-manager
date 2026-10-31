// A field-level journal, separate from source snapshots and game estimates.
// Only new-game adapters and the explicit staging command apply these facts.
const OPENING='2026-03-27';
const groups={
  salary:['salaryStatus','salaryManYen','gameSalaryManYen','salaryBasis','salarySeason'],
  contract:['contractStatus','contractStartYear','contractEndYear','gameContractEndYear','contractBasis','contractOption','reportedContractTotalManYen'],
  foreignQuota:['foreignQuotaStatus','gameIsForeign','foreignQuotaBasis'],
};
export const REVIEWED_FACT_FIELDS=Object.freeze(Object.values(groups).flat());
const fail=message=>{throw new Error(`Reviewed player facts: ${message}`);};
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const amount=n=>Number.isSafeInteger(n)&&n>0;

export function indexReviewedFacts(journal) {
  if(journal?.schemaVersion!==1||journal.asOf!==OPENING||!Array.isArray(journal.players)||!Array.isArray(journal.sources))fail('opening journal required');
  const sources=new Map(),byId=new Map(),byLegacyId=new Map();
  for(const s of journal.sources) {
    if(!s.id||sources.has(s.id)||!/^https:\/\//.test(s.url))fail('unique source ID / HTTPS URL required');
    if(!date(s.knownBy)||s.knownBy>OPENING||!s.dateEvidence)fail(`pre-opening date evidence required: ${s.id}`);
    if(s.publishedOn!=null&&(!date(s.publishedOn)||s.publishedOn>s.knownBy))fail(`source date inconsistent: ${s.id}`);
    sources.set(s.id,s);
  }
  for(const p of journal.players) {
    if(!/^npb:\d{8}$/.test(p.playerId)||byId.has(p.playerId)||!Number.isInteger(p.teamId)||p.teamId<0||p.teamId>11)fail('unique stable identity / opening team required');
    if(p.legacyPlayerId&&(typeof p.legacyPlayerId!=='string'||p.legacyPlayerId.startsWith('npb:')||byLegacyId.has(p.legacyPlayerId)))fail('invalid or duplicate legacy identity');
    const allowed=new Set(['playerId','legacyPlayerId','teamId','evidence',...Object.values(groups).flat()]);
    if(Object.keys(p).some(key=>!allowed.has(key)))fail(`${p.playerId}: unsupported fact field`);
    for(const [group,fields] of Object.entries(groups)) {
      const present=fields.some(key=>Object.hasOwn(p,key));
      const refs=p.evidence?.[group];
      if(present&&(!Array.isArray(refs)||!refs.length||refs.some(id=>!sources.has(id))))fail(`${p.playerId}: ${group} evidence missing`);
      if(!present&&refs!==undefined)fail(`${p.playerId}: ${group} evidence has no corresponding facts`);
    }
    if(p.salaryStatus!=null) {
      if(!['official','reported','game-assumption'].includes(p.salaryStatus)||p.salarySeason!==2026||!p.salaryBasis)fail(`${p.playerId}: annual salary confidence / season required`);
      if(!amount(p.salaryStatus==='game-assumption'?p.gameSalaryManYen:p.salaryManYen))fail(`${p.playerId}: annual salary amount required`);
      if(p.salaryStatus==='game-assumption'?p.salaryManYen!=null:p.gameSalaryManYen!=null)fail(`${p.playerId}: salary fact and assumption must be separate`);
      if(p.salaryStatus!=='game-assumption'&&/equivalent|divid|total/i.test(p.salaryBasis))fail(`${p.playerId}: total divided by years is not a reported annual salary`);
    } else if(groups.salary.some(key=>Object.hasOwn(p,key)))fail(`${p.playerId}: salary status missing`);
    if(p.contractStatus!=null) {
      const end=p.contractStatus==='game-assumption'?p.gameContractEndYear:p.contractEndYear;
      if(!['official','reported','game-assumption'].includes(p.contractStatus)||!Number.isInteger(end)||end<2026||end>2032||!p.contractBasis)fail(`${p.playerId}: contract confidence / end required`);
      if(p.contractStartYear!=null&&(!Number.isInteger(p.contractStartYear)||p.contractStartYear>2026||p.contractStartYear>end))fail(`${p.playerId}: contract start invalid`);
    } else if(groups.contract.some(key=>Object.hasOwn(p,key)))fail(`${p.playerId}: contract status missing`);
    if(p.foreignQuotaStatus!=null) {
      if(!['counts','domestic','exempt','unknown'].includes(p.foreignQuotaStatus)||!p.foreignQuotaBasis||typeof p.gameIsForeign!=='boolean')fail(`${p.playerId}: quota confidence / assumption required`);
      if(p.foreignQuotaStatus!=='unknown'&&p.gameIsForeign!==(p.foreignQuotaStatus==='counts'))fail(`${p.playerId}: quota flag contradicts status`);
    } else if(groups.foreignQuota.some(key=>Object.hasOwn(p,key)))fail(`${p.playerId}: quota status missing`);
    if(!Object.keys(p.evidence||{}).length||Object.keys(p.evidence).some(key=>!groups[key]))fail(`${p.playerId}: invalid evidence groups`);
    byId.set(p.playerId,p);if(p.legacyPlayerId)byLegacyId.set(p.legacyPlayerId,p);
  }
  return {byId,byLegacyId,sources};
}

export function applyReviewedFacts(player,index) {
  const p=index.byId.get(player.playerId)||index.byLegacyId.get(player.playerId);
  if(!p)return player;
  if(Number(player.teamId)!==p.teamId)fail(`${p.playerId}: opening team mismatch`);
  const changes={};
  for(const key of Object.values(groups).flat())if(Object.hasOwn(p,key))changes[key]=p[key];
  const sourceIds=[...new Set([...(player.sourceIds||[]),...Object.values(p.evidence).flat()])];
  const result={...player,...changes,playerId:p.playerId,legacyPlayerId:p.legacyPlayerId||player.legacyPlayerId,
    sourceIds,reviewedEvidence:{...player.reviewedEvidence,...p.evidence},dataQuality:{...player.dataQuality}};
  // Each supplied group is a reviewed snapshot, not a partial merge with an
  // older contract's options, totals, or confidence fields.
  for(const [group,fields] of Object.entries(groups))if(p.evidence[group]) {
    for(const key of fields)if(!Object.hasOwn(p,key))delete result[key];
  }
  if(p.salaryStatus) {
    result.salary=p.salaryStatus==='game-assumption'?p.gameSalaryManYen:p.salaryManYen;
    if(p.salaryStatus==='game-assumption')delete result.salaryManYen;
    else delete result.gameSalaryManYen;
    result.dataQuality.salary=p.salaryStatus;
  }
  if(p.contractStatus) {
    // Normalized masters retain the distinction; adapters read the game value.
    if(p.contractStatus==='game-assumption')delete result.contractEndYear;
    else delete result.gameContractEndYear;
    result.dataQuality.contract=p.contractStatus;
  }
  if(p.foreignQuotaStatus) {
    result.isForeign=p.gameIsForeign;
    result.dataQuality.foreignQuota=p.foreignQuotaStatus==='unknown'?'game-assumption':p.foreignQuotaBasis;
  }
  result.dataQuality.identity='stable-source-id';
  return result;
}

export function updateMasterFacts(master,index) {
  if(master?.asOf!==OPENING||!Array.isArray(master.players)||!Array.isArray(master.sources))fail('opening master required');
  const sources=new Map(master.sources.map(s=>[s.id,s]));
  const players=master.players.map(p=>{
    const updated=applyReviewedFacts(p,index);
    for(const id of Object.values(updated.reviewedEvidence||{}).flat()) {
      const source=index.sources.get(id);
      if(source) {
        const previous=sources.get(id);
        if(previous&&previous.url!==source.url)fail(`source URL conflicts with existing identity: ${id}`);
        sources.set(id,{...previous,...source,redistribution:previous?.redistribution||'unconfirmed'});
      }
    }
    return updated;
  });
  return {...master,sources:[...sources.values()],players};
}
