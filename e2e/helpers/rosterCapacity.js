import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
export function capacityFixture({controlled=69,reserved=false,screen='offseason_planning'}={}) {
 const s=JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/new-game.json.gz',import.meta.url))));
 const t=s.teams.find(t=>t.id===s.myId), template=t.farm.find(p=>!p.isPitcher&&!p.isForeign);
 t.players=t.players.slice(0,27);t.farm=Array.from({length:controlled-t.players.length},(_,i)=>({...template,id:`capacity-owned-${i}`,name:`枠確認${i}`,育成:false,isIkusei:false,contractYearsLeft:1,contractSignedYear:s.year-1}));
 const devs=[{...template,id:'capacity-dev-a',name:'旧形式育成',育成:false,isIkusei:true,salary:240,injuryDaysLeft:0,registrationCooldownDays:0},
 {...template,id:'capacity-dev-b',name:'育成契約選手',育成:true,isIkusei:false,salary:240,injuryDaysLeft:0,registrationCooldownDays:0}];
 t.farm.push(...devs);t.budget=100000;t.history=t.history||[];
 const candidate={...template,id:'capacity-pick',name:'確定指名候補',育成:false,isIkusei:false};
 if(screen!=='hub'){s.gameDay=144;s.teams=s.teams.map(t=>({...t,wins:0,losses:0,draws:143}));}
 s.offseasonPlan={version:1,year:s.year,myId:s.myId,stage:'open',resumeScreen:screen,tab:'roster',intents:[],releasedIds:[],demands:{},draftPool:[candidate],...(reserved?{draftViews:{lottery:{confirmedPicks:{[s.myId]:candidate.id}}}}:{})};
 if(screen==='hub')s.offseasonPlan=null;
 s.faPool=[{...template,id:'capacity-fa',name:'枠確認FA',salary:500,isForeign:false,育成:false,isIkusei:false}];
 return s;
}
export async function installCapacityFixture(page,options={}) {
 const s=capacityFixture(options);await page.goto('/');
 await page.evaluate(async state=>{const {saveGame}=await import('/baseball-manager/src/engine/saveload.js');if(!(await saveGame(state)).ok)throw Error('capacity save failed');},s);
 await page.reload();await page.getByRole('button',{name:'続きから',exact:true}).click();return s;
}
