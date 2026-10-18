import {evaluateRosterCapacity} from './rosterCapacity';

export const newDraftRules = () => ({version:2,maxPicks:10});
export const draftRulesFor = rules => rules?.version===2 && rules.maxPicks===10
  ? newDraftRules() : {version:1,maxPicks:6};

export function draftNominationCount(teamId,pool,drafted={},log=[],confirmedPicks={}) {
  const ids=new Set(),same=id=>id!=null&&String(id)===String(teamId);
  for(const p of pool) if((p._drafted&&same(p._r1winner)) || same(drafted[p.id])) ids.add(String(p.id));
  const valid=new Set(pool.map(p=>String(p.id)));
  for(const row of log) {
    const owner=row.team?.id ?? row.team, id=row.player?.id ?? row.player;
    if(same(owner)&&id!=null&&valid.has(String(id))) ids.add(String(id));
  }
  const winner=confirmedPicks[teamId];
  const id=winner?.id ?? winner;
  if(id!=null&&valid.has(String(id)))ids.add(String(id));
  return ids.size;
}

export function draftParticipation(team,pool,drafted={},context={}) {
  const {maxPicks}=draftRulesFor(context.rules);
  const count=draftNominationCount(team.id,pool,drafted,context.log,context.confirmedPicks);
  const result=reason=>({eligible:reason==null,reason,count,maxPicks});
  if(context.endedTeams?.[team.id])return result(context.endedTeams[team.id]);
  if(count>=maxPicks)return result('pick-limit');
  const capacity=evaluateRosterCapacity(team,{...context,draftPool:pool,drafted});
  if(!capacity.ok)return result('invalid-capacity');
  if(capacity.remainingSlots<=0)return result('roster-full');
  const used=new Set(Object.values(context.confirmedPicks || {}).map(p=>String(p?.id ?? p)));
  if(!pool.some(p=>!p._drafted&&!Object.hasOwn(drafted,p.id)&&!used.has(String(p.id))))return result('pool-exhausted');
  return result(null);
}

export const draftEndLabel = reason => ({manual:'選択終了', 'no-upgrade':'戦力更新候補なし',
  'roster-full':'支配下枠が満員','pick-limit':'指名上限に到達','pool-exhausted':'候補なし',
  'catcher-reserve':'捕手補充用の枠を留保','normal-target':'通常の補強目標に到達','rookie-budget':'新人年俸の留保不足','draft-opportunity':'新人獲得機会を留保','budget-missing':'予算を確認できません',
  'invalid-capacity':'人数データを確認できません'})[reason] || reason;
