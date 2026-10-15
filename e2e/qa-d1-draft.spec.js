import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readSave,reloadAndLoad,waitSaveIdle} from './helpers/progression';

const EVIDENCE='docs/validation/qa-d1';
const SOURCE=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const BASE_SHA='a14a5c888dca3cfe07c7338482e4130290a6257b';
const SOURCE_FILES=Object.fromEntries(['src/components/DraftCandidates.jsx','src/engine/draftReports.js','src/components/Draft.jsx','src/components/DraftPreview.jsx'].map(path=>[path,execFileSync('git',['hash-object',path],{encoding:'utf8'}).trim()]));
const SOURCE_SHA256=Object.fromEntries(Object.keys(SOURCE_FILES).map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const SEED=20261015;
function evidence(name,data){if(process.env.QA_D1_CAPTURE){mkdirSync(EVIDENCE,{recursive:true});writeFileSync(`${EVIDENCE}/${name}.json`,JSON.stringify({stage:process.env.QA_D1_STAGE||'after',baseSha:BASE_SHA,sourceSha:SOURCE,sourceFiles:SOURCE_FILES,sourceSha256:SOURCE_SHA256,seed:SEED,timingAttribution:'Reference values only: host CPU load was not isolated from other validation processes.',...data},null,2)+'\n');}}

// Test-only response instrumentation counts the real App path. Production files
// and saved state are unchanged; rendered code receives counters only.
async function instrument(page){
  await page.addInitScript(()=>{
    window.__qa={commits:0,candidateRenders:0,parentStateUpdates:0,publicTierCalls:0,publicRankingSorts:0,saves:0};
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(renderer){this.renderers.set(1,renderer);return 1;},onScheduleFiberRoot:()=>{},onCommitFiberRoot:()=>{window.__qa.commits++;},onCommitFiberUnmount:()=>{}};
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k==='baseball_manager_save_perf_logs')window.__qa.saves++;return set.call(this,k,v);};
    const sort=Array.prototype.sort;
    Array.prototype.sort=function(compare){
      if(this.length>=80&&Array.isArray(this[0])&&this[0][1]?.skills&&Number.isFinite(this[0][1]?.value))window.__qa.publicRankingSorts++;
      return sort.call(this,compare);
    };
  });
  for(const [path,needle,replacement] of [
    ['components/DraftCandidates.jsx',/const\s*\[view,\s*setView\]\s*=\s*useState/,'window.__qa.candidateRenders++; $&'],
    ['hooks/useGameState.js',/setOffseasonPlanState\(value\);/,'window.__qa.parentStateUpdates++; $&'],
    ['engine/draftReports.js',/function publicDraftTier\s*\([^)]*\)\s*\{/,'$& window.__qa.publicTierCalls++;'],
  ])await page.route(`**/src/${path}*`,async route=>{
    const response=await route.fetch();let body=await response.text();
    // JSX's transformed formatting differs from the authored source.
    if(!needle.test(body))throw new Error(`instrumentation target missing: ${path}: ${needle}`);
    await route.fulfill({response,body:body.replace(needle,replacement)});
  });
}

// Observe the real manual-save callback payload without changing storage or
// game behavior. This distinguishes a stale request from a later autosave.
async function observeManualSavePositions(page){
  await page.addInitScript(()=>{window.__qaManualSavePositions=[];});
  await page.route('**/src/hooks/useGameState.js*',async route=>{
    const response=await route.fetch(),body=await response.text();
    const entry=/const handleSave = useCallback\(async \(options = \{\}\)\s*=>\s*\{/;
    if(!entry.test(body))throw new Error('manual-save instrumentation target missing');
    await route.fulfill({response,body:body.replace(entry,'$& if(!options.silent)window.__qaManualSavePositions.push(offseasonPlan?.draftViews?.lottery?.candidateView?.listScroll);')});
  });
}

async function seedGenerated(page,screen='draft_preview',options={}){
  const state=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz',import.meta.url))));
  state.gameDay=144;
  await page.goto('/');
  const info=await page.evaluate(async({state,screen,options,seed})=>{
    const {initDraftPool}=await import('/baseball-manager/src/engine/draft.js');
    const {ensureDraftEvaluation}=await import('/baseball-manager/src/engine/draftReports.js');
    const {saveGame}=await import('/baseball-manager/src/engine/saveload.js');
    const original=Math.random;let x=seed>>>0;
    Math.random=()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};
    const mine=state.teams.find(t=>t.id===state.myId),pool=initDraftPool(mine);
    Math.random=original;
    for(const t of state.teams){t.wins=t.id===state.myId?0:60+t.id;t.losses=143-t.wins;t.draws=0;}
    state.offseasonPlan={version:1,year:state.year,myId:state.myId,stage:'results',resumeScreen:screen,draftPool:pool};
    if(options.duel){
      // Generated abilities/reports stay intact. Limit roster slots so one rival
      // nominates the same actual generated candidate and exercise the lottery.
      const rival=state.teams.find(t=>t.id!==state.myId);
      for(const t of state.teams){
        const target=t.id===state.myId?64:t.id===rival.id?69:70;
        const template=t.farm[0];
        t.farm=Array.from({length:target-t.players.length},(_,i)=>({...template,id:`browser-full-${t.id}-${i}`,育成:false,isIkusei:false}));
      }
      const evaluation=ensureDraftEvaluation({teams:state.teams,pool,year:state.year,myId:state.myId});
      const {chooseDraftProspect}=await import('/baseball-manager/src/engine/draftRules.js');
      Math.random=()=>.99;
      const rivalPick=chooseDraftProspect(rival,pool,1,[],{teams:state.teams,evaluation});
      Math.random=original;
      state.offseasonPlan.draftEvaluation=evaluation;
      options.rivalPick=rivalPick.id;
    }
    if(!(await saveGame(state)).ok)throw new Error('generated draft fixture save failed');
    return {pool:pool.map(p=>({id:p.id,name:p.name,role:p.subtype||p.pos,type:p.prospectType})),myId:state.myId,year:state.year,rivalPick:options.rivalPick};
  },{state,screen,options,seed:SEED});
  expect(info.pool.length).toBeGreaterThanOrEqual(80);
  await reloadAndLoad(page);return info;
}
async function saveDraft(page){await page.getByRole('button',{name:'途中保存',exact:true}).click();await waitSaveIdle(page);return readSave(page);}
async function openId(page,id){await page.locator(`#draft-candidate-${id}`).click();}
async function capture(page,name){if(process.env.QA_D1_CAPTURE){mkdirSync(EVIDENCE,{recursive:true});await page.screenshot({path:`${EVIDENCE}/${name}.png`,fullPage:true});}}
async function layout(page){return page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth,
  undersizedPrimaryControls:[...document.querySelectorAll('.draft-experience button,.draft-experience select,.draft-experience input')].filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height<43.5).map(el=>({text:el.textContent?.trim(),height:el.getBoundingClientRect().height}))}));}

test('generated draft browser journey, persistence and candidate return',async({page},testInfo)=>{
  test.setTimeout(180_000); // Real large-state persistence is slower on WebKit.
  const started=Date.now(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await observeManualSavePositions(page);
  const info=await seedGenerated(page,'draft_preview',{duel:true});
  await expect(page.getByRole('heading',{name:/ドラフト展望/})).toBeVisible();
  await page.getByRole('button',{name:'各球団',exact:true}).click();
  await expect(page.getByRole('heading',{name:'各球団の補強ポイント',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'予算配分',exact:true}).click();
  await page.getByLabel('投手スカウト配分',{exact:true}).fill('70');
  const allocationSaved=await saveDraft(page);
  expect(allocationSaved.offseasonPlan.draftAllocation).toEqual({pitcher:70,batter:30});
  await reloadAndLoad(page);await expect(page.getByLabel('投手スカウト配分',{exact:true})).toHaveValue('70');
  await page.getByRole('button',{name:'ドラフト会議を開始する',exact:true}).click();
  await expect(page.getByRole('heading',{name:'1位指名',exact:true})).toBeVisible();
  await page.getByLabel('並び順',{exact:true}).selectOption('public');
  const selected=info.pool.find(p=>p.id===info.rivalPick);
  await page.getByLabel('位置・役割',{exact:true}).selectOption(selected.role);
  await page.getByLabel('区分',{exact:true}).selectOption(selected.type);
  expect(await page.locator('.draft-candidate-row').count()).toBe(info.pool.filter(p=>p.role===selected.role&&p.type===selected.type).length);
  await openId(page,selected.id);await page.getByRole('button',{name:'候補一覧に戻る',exact:true}).click();
  await expect(page.getByLabel('位置・役割',{exact:true})).toHaveValue(selected.role);
  await expect(page.getByLabel('区分',{exact:true})).toHaveValue(selected.type);
  await page.getByLabel('区分',{exact:true}).selectOption('all');
  await page.getByLabel('位置・役割',{exact:true}).selectOption('all');
  const list=page.locator('.draft-candidate-scroll');
  // Candidate at index 50 proves the generated list can be reached beyond 20.
  const far=page.locator('.draft-candidate-open').nth(50),farId=(await far.getAttribute('id')).replace('draft-candidate-','');
  await far.scrollIntoViewIfNeeded();
  const scrollBefore=await list.evaluate(el=>el.scrollTop);
  await far.click();await page.getByRole('button',{name:'比較に追加',exact:true}).click();
  await page.getByRole('button',{name:'候補一覧に戻る',exact:true}).click();
  await expect(page.locator(`#draft-candidate-${farId}`)).toBeFocused();
  expect(Math.abs((await list.evaluate(el=>el.scrollTop))-scrollBefore)).toBeLessThanOrEqual(2);
  await expect(page.getByLabel('並び順',{exact:true})).toHaveValue('public');
  const pendingScroll=await list.evaluate(el=>{el.scrollTop-=200;el.dispatchEvent(new Event('scroll',{bubbles:true}));return el.scrollTop;});
  const viewSaved=await saveDraft(page);
  expect(viewSaved.offseasonPlan.draftViews.lottery.candidateView.listScroll).toBe(pendingScroll);
  const immediateSave=page.getByRole('button',{name:'途中保存',exact:true});
  await expect(immediateSave).toBeEnabled();await immediateSave.focus();
  // Enter's default click may run before React's native-listener updates commit.
  // Keep keydown and click in one task so the CI race has a deterministic RED.
  const immediate=await list.evaluate(el=>{
    el.scrollTop-=120;el.dispatchEvent(new Event('scroll',{bubbles:true}));
    const expected=el.scrollTop,before=window.__qaManualSavePositions.length;
    const save=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='途中保存');
    save.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));
    save.click();
    return {expected,requested:window.__qaManualSavePositions.slice(before)};
  });
  expect(immediate.requested).toEqual([immediate.expected]);
  await waitSaveIdle(page);
  // A disabled save button loses focus during the first save. Wait for the
  // visible control to be usable and focus it again for a real Enter action.
  const keyboardSave=page.getByRole('button',{name:'途中保存',exact:true});
  await expect(keyboardSave).toBeEnabled();await keyboardSave.focus();
  const manualBefore=await page.evaluate(()=>window.__qaManualSavePositions.length);
  const keyboardScroll=await list.evaluate(el=>{el.scrollTop-=120;el.dispatchEvent(new Event('scroll',{bubbles:true}));return el.scrollTop;});
  await page.keyboard.press('Enter');await waitSaveIdle(page);
  expect(await page.evaluate(before=>window.__qaManualSavePositions.slice(before),manualBefore)).toEqual([keyboardScroll]);
  expect((await readSave(page)).offseasonPlan.draftViews.lottery.candidateView.listScroll).toBe(keyboardScroll);
  await reloadAndLoad(page);await expect(list).toBeVisible();
  expect(Math.abs((await list.evaluate(el=>el.scrollTop))-keyboardScroll)).toBeLessThanOrEqual(2);
  const listDimensions=await layout(page);expect(listDimensions.overflow).toBe(false);expect(listDimensions.undersizedPrimaryControls).toEqual([]);
  await capture(page,`browser-${testInfo.project.name}-list`);
  await openId(page,selected.id);
  await expect(page.getByRole('region',{name:'候補比較',exact:true})).toBeVisible();
  const beforeScout=await saveDraft(page),evaluation=beforeScout.offseasonPlan.draftEvaluation;
  // Choose an uninvestigated generated candidate for an actual point spend.
  if(evaluation.scouted.includes(selected.id)){
    await page.getByRole('button',{name:'候補一覧に戻る',exact:true}).click();
    const target=info.pool.find(p=>!evaluation.scouted.includes(p.id));await openId(page,target.id);
  }
  const scout=page.getByRole('button',{name:/を追加調査（1ポイント）/});await scout.click();await expect(scout).toBeDisabled();
  const scouted=await saveDraft(page);expect(scouted.offseasonPlan.draftEvaluation.points).toBe(4);
  const stable=scouted.offseasonPlan.draftEvaluation;
  await reloadAndLoad(page);await expect(page.locator('.draft-candidate-detail h2[tabindex]')).toBeFocused();
  expect((await readSave(page)).offseasonPlan.draftEvaluation).toEqual(stable);
  await capture(page,`browser-${testInfo.project.name}-detail`);
  const detailDimensions=await layout(page);expect(detailDimensions.overflow).toBe(false);expect(detailDimensions.undersizedPrimaryControls).toEqual([]);
  await page.getByRole('button',{name:'候補一覧に戻る',exact:true}).click();await openId(page,selected.id);
  await page.getByRole('button',{name:'指名内容を確認',exact:true}).click();
  await expect(page.getByRole('region',{name:'指名内容の確認',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'選び直す',exact:true}).click();
  await page.getByRole('button',{name:'指名内容を確認',exact:true}).click();
  await page.evaluate(()=>{Math.random=()=>.99;});
  await page.getByRole('button',{name:'指名を確定',exact:true}).click();
  const transitions=[];
  // Controlled event randomness chooses the same generated nominee and loses
  // the first lottery; the production algorithms and timers remain intact.
  for(let i=0;i<12;i++){
    const next=page.getByRole('button',{name:/2巡目以降へ/}),draw=page.getByRole('button',{name:'くじを引く！',exact:true});
    await expect.poll(async()=>await next.isVisible()?'done':await draw.isVisible()?'draw':await page.getByRole('button',{name:'発表を見る →',exact:true}).isVisible()?'announce':await page.getByRole('heading',{name:/外れ.*1位指名/}).isVisible()?'repick':'waiting',{timeout:15_000}).not.toBe('waiting');
    if(await next.isVisible()){transitions.push('first-round-done');await next.click();break;}
    if(await draw.isVisible()){transitions.push('lottery');await page.evaluate(()=>{Math.random=()=>.01;});await draw.click();await page.evaluate(()=>{Math.random=()=>.99;});await expect(draw).not.toBeVisible();}
    else if(await page.getByRole('button',{name:'発表を見る →',exact:true}).isVisible()){transitions.push('other-clubs-repick');await page.getByRole('button',{name:'発表を見る →',exact:true}).click();}
    else {transitions.push('my-repick');await page.locator('.draft-candidate-open').first().click();await page.getByRole('button',{name:'指名内容を確認',exact:true}).click();await page.getByRole('button',{name:'指名を確定',exact:true}).click();}
  }
  expect(transitions).toContain('lottery');
  await expect(page.getByRole('heading',{name:'2巡目',exact:true})).toBeVisible();
  await expect(page.getByText('あなたの指名です',{exact:true})).toBeVisible();
  await page.locator('.draft-candidate-open').first().click();await page.getByRole('button',{name:'指名内容を確認',exact:true}).click();await page.getByRole('button',{name:'指名を確定',exact:true}).click();
  await page.getByRole('button',{name:'残りを自動処理',exact:true}).click();
  await expect(page.getByRole('heading',{name:'ドラフト終了',exact:true})).toBeVisible();
  const later=await saveDraft(page);expect(later.offseasonPlan.draftEvaluation.points).toBe(4);
  expect(later.offseasonPlan.draftEvaluation.snapshots[selected.id]).toBeDefined();
  await page.getByRole('button',{name:'結果レビューへ →',exact:true}).click();
  await expect(page.getByRole('heading',{name:/ドラフト結果/})).toBeVisible();
  await capture(page,`browser-${testInfo.project.name}-results`);
  const results=await saveDraft(page);await reloadAndLoad(page);
  expect((await readSave(page)).offseasonPlan.draftEvaluation).toEqual(results.offseasonPlan.draftEvaluation);
  await page.getByRole('button',{name:'全球団結果',exact:true}).click();await expect(page.getByRole('heading',{name:'全球団 指名結果',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'指名漏れ',exact:true}).click();await expect(page.getByRole('heading',{name:/指名漏れ \(/})).toBeVisible();
  const dimensions=await layout(page);expect(dimensions.overflow).toBe(false);expect(dimensions.undersizedPrimaryControls).toEqual([]);expect(errors).toEqual([]);
  evidence(`browser-${testInfo.project.name}`,{browser:testInfo.project.name,browserVersion:page.context().browser().version(),candidateCount:info.pool.length,teamCount:12,activeCpuDraftTeams:1,fixture:'80 production-generated prospects; controlled roster capacity: own64, rival69, other10clubs70. Full12CPU draft measurements are separate.',transitions,allocation:{pitcher:70,batter:30},scoutPoints:4,saveReloadStable:true,listReturn:{farId,scrollBefore,pendingScroll},dimensions:{list:listDimensions,detail:detailDimensions,results:dimensions},errors,durationMs:Date.now()-started,hardware:'Playwright browser emulation; no iPhone hardware validation'});
});

test('generated draft scroll and repeated public ranking measurement',async({page},testInfo)=>{
  await instrument(page);const info=await seedGenerated(page,'draft_lottery');
  await expect(page.locator('.draft-candidate-open')).toHaveCount(80);
  await saveDraft(page);await page.waitForTimeout(1200);await waitSaveIdle(page);
  await page.evaluate(()=>{for(const key of Object.keys(window.__qa))window.__qa[key]=0;});
  const start=Date.now();
  const scrollFrames=await page.locator('.draft-candidate-scroll').evaluate(async el=>{
    // Programmatic scrollTop changes exercise the real rendered list. Native
    // and dispatched scroll events may coalesce; this is not a touch gesture.
    const started=performance.now(),frames=[];let last=started;
    for(let i=0;i<48;i++){el.scrollTop=40+(i%24)*120;el.dispatchEvent(new Event('scroll',{bubbles:true}));await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-last);last=now;}
    const sorted=[...frames].sort((a,b)=>a-b);
    return {elapsedMs:performance.now()-started,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...frames)};
  });
  await page.waitForTimeout(1200);await waitSaveIdle(page);
  const scrolling=await page.evaluate(()=>({...window.__qa}));
  const scrollElapsedMs=Date.now()-start;
  await page.evaluate(()=>{for(const key of Object.keys(window.__qa))window.__qa[key]=0;});
  const navStarted=Date.now(),far=page.locator('.draft-candidate-open').nth(50),farId=await far.getAttribute('id');
  await far.scrollIntoViewIfNeeded();await far.click();
  await expect(page.locator('.draft-candidate-detail h2[tabindex]')).toBeFocused();
  await page.getByRole('button',{name:'候補一覧に戻る',exact:true}).click();
  await expect(page.locator(`#${farId}`)).toBeFocused();
  const navigationActionsMs=Date.now()-navStarted;
  await page.waitForTimeout(1200);await waitSaveIdle(page);
  const navigation=await page.evaluate(()=>({...window.__qa}));
  const ranking=await page.evaluate(async()=>{
    const {loadGame}=await import('/baseball-manager/src/engine/saveload.js');
    const {publicDraftTier}=await import('/baseball-manager/src/engine/draftReports.js');
    const session=(await loadGame()).offseasonPlan.draftEvaluation,ids=Object.keys(session.public);
    const before=window.__qa.publicRankingSorts,start=performance.now();let sum=0;
    for(let round=0;round<100;round++)for(const id of ids)sum+=publicDraftTier(session,id).length;
    return {calls:100*ids.length,sorts:window.__qa.publicRankingSorts-before,elapsedMs:performance.now()-start,checksum:sum};
  });
  evidence(`browser-performance-${process.env.QA_D1_STAGE || 'after'}-${testInfo.project.name}`,{browser:testInfo.project.name,candidateCount:info.pool.length,scrollSteps:48,scrollInput:'scrollTop changes plus dispatched scroll events at requestAnimationFrame spacing',scrollElapsedMs,scrollFrames,scrolling,navigationActionsMs,navigation,ranking,instrumentation:'Test-only HTTP response counters + React DevTools commit hook + storage perf-log writes. Vite React StrictMode; no CPU throttle.',hardware:'Browser automation on host, not phone hardware'});
  if(process.env.QA_D1_STAGE!=='baseline'){
    // Includes the real save queue/status commits after the settled scroll.
    expect(scrolling.candidateRenders).toBeLessThanOrEqual(12);
    expect(scrolling.parentStateUpdates).toBeLessThanOrEqual(2);
    expect(scrolling.saves).toBeLessThanOrEqual(1);
    expect(ranking.sorts).toBeLessThanOrEqual(1);
  }
});

// The split list remains interactive while its desktop detail is open. This
// project-specific flow is assigned to the 1440px Chromium/WebKit projects.
test('desktop split view retains user scroll through compare, confirmation and return',async({page},testInfo)=>{
  await seedGenerated(page,'draft_lottery');
  const far=page.locator('.draft-candidate-open').nth(50),id=await far.getAttribute('id');await far.click();
  const list=page.locator('.draft-candidate-scroll');
  const sort=page.getByLabel('並び順',{exact:true});
  await sort.focus();await sort.selectOption('public');
  await expect(sort).toBeFocused();expect(await list.evaluate(el=>el.scrollTop)).toBe(0);
  await sort.selectOption('team');await expect(sort).toBeFocused();
  expect(await list.evaluate(el=>el.scrollTop)).toBe(0);
  const move=distance=>list.evaluate((el,distance)=>{el.scrollTop+=distance;el.dispatchEvent(new Event('scroll',{bubbles:true}));return el.scrollTop;},distance);
  const comparedScroll=await move(2000);await page.getByRole('button',{name:'比較に追加',exact:true}).click();
  expect((await saveDraft(page)).offseasonPlan.draftViews.lottery.candidateView.listScroll).toBe(comparedScroll);
  const confirmScroll=await move(500);await page.getByRole('button',{name:'指名内容を確認',exact:true}).click();
  await expect(page.getByRole('region',{name:'指名内容の確認',exact:true})).toBeVisible();
  expect((await saveDraft(page)).offseasonPlan.draftViews.lottery.candidateView.listScroll).toBe(confirmScroll);
  await page.getByRole('button',{name:'選び直す',exact:true}).click();
  const returnScroll=await move(500);await page.getByRole('button',{name:'候補一覧に戻る',exact:true}).click();
  await expect(page.locator(`#${id}`)).toBeFocused();
  const actualScroll=await list.evaluate(el=>el.scrollTop);
  expect(Math.abs(actualScroll-returnScroll)).toBeLessThanOrEqual(2);
  const saved=await saveDraft(page);expect(saved.offseasonPlan.draftViews.lottery.candidateView.listScroll).toBe(returnScroll);
  await reloadAndLoad(page);await expect(list).toBeVisible();
  expect(Math.abs((await list.evaluate(el=>el.scrollTop))-returnScroll)).toBeLessThanOrEqual(2);
  evidence(`browser-focus-${testInfo.project.name}`,{browser:testInfo.project.name,comparedScroll,confirmScroll,returnScroll,actualScroll,focusedCandidate:id,saveReloadStable:true,hardware:'Browser automation on host, not phone hardware'});
});
