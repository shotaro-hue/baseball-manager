import React from 'react';
import {create,act} from 'react-test-renderer';
import {readFileSync} from 'node:fs';
import {it,expect,vi,afterEach} from 'vitest';
import {RosterTab} from './tabs/RosterTab';
import {MAX_ROSTER,MAX_SHIHAKA_TOTAL,TALK_COOLDOWN_DAYS} from '../constants';

const source=JSON.parse(readFileSync(new URL('../../e2e/fixtures/ui02b/team.json',import.meta.url)));
const views=[];
afterEach(()=>views.splice(0).forEach(v=>act(()=>v.unmount())));
const text=n=>n==null?'':typeof n==='object'?(Array.isArray(n)?n:n.children||[]).map(text).join(''):String(n);
function render(team=structuredClone(source),callbacks={}){
 let v;act(()=>v=create(React.createElement(RosterTab,{team,allTeams:[team],farmState:{year:2026},gameDay:20,...callbacks})));views.push(v);
 return v;
}
function click(v,name){act(()=>v.root.findAllByType('button').find(b=>text(b)===name).props.onClick());}
const farm=v=>{click(v,'🌿 二軍');return v.root.findByProps({'aria-label':'二軍育成・起用'});};
const talk=v=>{click(v,'💬 会話');return v.root.findByProps({'aria-label':'選手コミュニケーション'});};

it('provides named farm controls and preserves current-player identity, ID zero and input state',()=>{
 const t=structuredClone(source),p=t.farm[0];p.id=0;p.育成=false;
 const before=structuredClone(t),goal=vi.fn(),open=vi.fn(),v=render(t,{onSetDevGoal:goal,onPlayerClick:open});const root=farm(v);
 act(()=>root.findByProps({'aria-label':`${p.name}の育成目標`}).props.onChange({target:{value:'promotion'}}));
 act(()=>root.findByProps({'aria-label':`${p.name}の選手詳細を開く`}).props.onClick());
 expect(goal).toHaveBeenCalledWith(0,'promotion');expect(open).toHaveBeenCalledWith(p,t.name);expect(t).toEqual(before);
 expect(text(root)).toContain('二軍実測：未記録');
});
it('shows promotion reasons for full first-team, foreign composition, injury and registration wait',()=>{
 const t=structuredClone(source);t.players=t.players.slice(0,4).map(p=>({...p,isForeign:true,isPitcher:true}));
 const p=t.farm[0];Object.assign(p,{育成:false,isForeign:true,isPitcher:true,injuryDaysLeft:3,registrationCooldownDays:5});
 const v=render(t,{onPromo:vi.fn()}),root=farm(v),button=root.findByProps({'aria-label':`${p.name}を一軍へ`});
 expect(button.props.disabled).toBe(true);expect(text(root)).toContain('外国人枠');expect(text(root)).toContain('負傷中');expect(text(root)).toContain('再登録まで5日');
 act(()=>v.update(React.createElement(RosterTab,{team:{...t,players:Array.from({length:MAX_ROSTER},(_,i)=>({...t.players[0],id:5000+i,isForeign:false}))},allTeams:[],farmState:{year:2026},onPromo:vi.fn()})));
 expect(text(v.root.findByProps({'aria-label':'二軍育成・起用'}))).toContain('一軍枠満杯');
});
it('previews exact registration finances, cancels without action and confirms only once',()=>{
 const t=structuredClone(source);t.players=t.players.slice(0,27);const p=t.farm[0];Object.assign(p,{育成:true,salary:240});t.budget=1000;
 const convert=vi.fn(),v=render(t,{onConvertIkusei:convert});farm(v);click(v,'支配下登録');
 let dialog=v.root.findByProps({role:'dialog'});expect(text(dialog)).toContain('240万円');expect(text(dialog)).toContain('420万円');expect(text(dialog)).toContain('180万円');expect(text(dialog)).toContain('820万円');
 expect(convert).not.toHaveBeenCalled();click(v,'戻る');expect(convert).not.toHaveBeenCalled();expect(v.root.findAllByProps({role:'dialog'})).toHaveLength(0);
 click(v,'支配下登録');const confirm=v.root.findAllByType('button').find(b=>text(b)==='登録を確定');
 act(()=>{confirm.props.onClick();confirm.props.onClick();});expect(convert).toHaveBeenCalledTimes(1);expect(convert).toHaveBeenCalledWith(p.id);
 expect(text(v.root.findByProps({'aria-label':'二軍育成・起用'}))).not.toContain('登録済み');
});
it('disables registration for budget and shihaka limits without calling the action',()=>{
 const t=structuredClone(source);t.players=t.players.slice(0,27);const p=t.farm[0];Object.assign(p,{育成:true,salary:240});t.budget=0;
 let v=render(t,{onConvertIkusei:vi.fn()}),root=farm(v);expect(root.findAllByProps({'aria-label':`${p.name}を支配下登録する`})[0].props.disabled).toBe(true);expect(text(root)).toContain('予算不足');
 t.farm=[p,...Array.from({length:MAX_SHIHAKA_TOTAL},(_,i)=>({...p,id:6000+i,name:`支配下${i}`,育成:false}))];t.budget=10000;
 v=render(t,{onConvertIkusei:vi.fn()});root=farm(v);expect(text(root)).toContain('支配下上限');
});
it('keeps talk first-team-only, preserves morale zero and marks missing separately',()=>{
 const t=structuredClone(source);t.players=t.players.slice(0,3);t.players[0].morale=0;delete t.players[1].morale;t.farm[0].name='二軍会話対象外';
 const v=render(t,{onPlayerTalk:vi.fn()}),root=talk(v);expect(text(root)).toContain('一軍選手');expect(text(root)).not.toContain('二軍会話対象外');
 const zero=root.findByProps({'data-player-id':t.players[0].id});expect(text(zero)).toContain('モラル 0');
 expect(text(root)).toContain('モラル — 未記録');expect(text(root)).not.toContain('月1回');
});
it('opening and cancelling talk do not act, choice dispatches once, cooldown follows gameDay',()=>{
 const t=structuredClone(source);t.players=t.players.slice(0,2);const p=t.players[0];p.lastTalkGameDay=0;
 t.players[1].lastTalkGameDay=20-TALK_COOLDOWN_DAYS+1;
 const action=vi.fn(),v=render(t,{onPlayerTalk:action});let root=talk(v);expect(text(root)).toContain('あと1試合');
 act(()=>root.findByProps({'aria-label':`${p.name}と話す`}).props.onClick());expect(action).not.toHaveBeenCalled();click(v,'会話を閉じる');expect(action).not.toHaveBeenCalled();
 act(()=>root.findByProps({'aria-label':`${p.name}と話す`}).props.onClick());
 const choice=v.root.findByProps({'aria-label':`${p.name}を激励する`});act(()=>{choice.props.onClick();choice.props.onClick();});expect(action).toHaveBeenCalledTimes(1);expect(action).toHaveBeenCalledWith(p.id,'praise');
});
it('explains the four-of-one-kind foreign limit even with a spare foreign slot',()=>{
 const t=structuredClone(source);t.players=t.players.slice(0,3).map(p=>({...p,isForeign:true,isPitcher:true}));
 const p=t.farm[0];Object.assign(p,{育成:false,isForeign:true,isPitcher:true,injuryDaysLeft:0,registrationCooldownDays:0});
 const root=farm(render(t,{onPromo:vi.fn()}));expect(root.findByProps({'aria-label':`${p.name}を一軍へ`}).props.disabled).toBe(true);
 expect(text(root)).toContain('投手のみ・野手のみ');
});
it('allows registration before offering promotion only when canonical player state changes',()=>{
 const t=structuredClone(source);t.players=t.players.slice(0,27);const p=t.farm[0];Object.assign(p,{育成:true,salary:240,injuryDaysLeft:0,registrationCooldownDays:0});
 const callbacks={onConvertIkusei:vi.fn(),onPromo:vi.fn()},v=render(t,callbacks);farm(v);click(v,'支配下登録');click(v,'登録を確定');
 expect(v.root.findAllByProps({'aria-label':`${p.name}を一軍へ`})).toHaveLength(0);
 const updated={...t,farm:t.farm.map(x=>x.id===p.id?{...x,育成:false,salary:420}:x)};
 act(()=>v.update(React.createElement(RosterTab,{team:updated,allTeams:[updated],farmState:{year:2026},...callbacks})));
 expect(v.root.findByProps({'aria-label':`${p.name}を一軍へ`}).props.disabled).toBe(false);
});
it('offers a direct entry from the farm overview without changing the team',()=>{
 const t=structuredClone(source),before=structuredClone(t),v=render(t);
 click(v,'二軍');click(v,'二軍の育成・起用設定へ');
 expect(v.root.findByProps({'aria-label':'二軍育成・起用'})).toBeTruthy();expect(t).toEqual(before);
});
