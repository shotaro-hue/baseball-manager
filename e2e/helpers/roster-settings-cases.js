import { test, expect } from '@playwright/test';
import { loadFixture, mainNavigation, readSave, saveHub, reloadAndLoad, runSingle } from './progression';

export function registerRosterSettingsCases() {
  for (const width of [360,390,760,761,1023,1024,1440]) {
    test(`UI-02B settings layout and controls ${width}`, async ({page}) => {
      test.setTimeout(90_000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.setViewportSize({width,height:900});
      for (const state of ['normal','long','zero','missing','empty','injured']) {
        await page.goto(`/baseball-manager/e2e/fixtures/ui02b/index.html?state=${state}`);
        const root = page.locator('.roster-full-settings');
        await root.locator('summary').click();
        await expect(root.getByRole('heading',{name:'詳細編成・起用設定'})).toBeVisible();
        expect(await root.locator('.settings-heading').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(14, 38, 59)');
        const checkLayout = async () => {
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        const tooSmall = await root.locator('.roster-settings-ui').evaluateAll(nodes => nodes.flatMap(n=>[...n.querySelectorAll('button,select,input')]).filter(n=>n.getClientRects().length && n.getBoundingClientRect().height<44).map(n=>n.getAttribute('aria-label')||n.textContent));
        expect(tooSmall).toEqual([]);
        };
        await checkLayout();
        const table = root.locator('.settings-lineup-scroll');
        if (state !== 'empty') {
          const rows = root.locator('.detail-lineup-table tbody tr');
          if (state === 'injured') await expect(rows.first().getByRole('combobox').first()).toBeDisabled();
          if (state === 'missing') { await expect(table).toContainText('未記録'); await expect(table).not.toContainText('NaN'); }
          if (state === 'zero') await expect(table).toContainText('0.000');
          await table.focus();
          await expect(table).toBeFocused();
          await table.evaluate(n=>{n.scrollLeft=n.scrollWidth;});
          expect(await table.evaluate((n,mobile)=>{
            const a=n.querySelector('tbody td:first-child').getBoundingClientRect();
            const b=n.querySelector('tbody td:nth-child(2)').getBoundingClientRect();
            return n.scrollLeft>0 && (mobile ? Math.abs(b.left-n.getBoundingClientRect().left)<3
              : Math.abs(a.left-n.getBoundingClientRect().left)<3 && Math.abs(b.left-a.right)<3);
          }, width<=760)).toBe(true);
          const field=rows.first().getByRole('combobox').nth(1);
          await field.scrollIntoViewIfNeeded();
          await table.evaluate(n=>{
            const field=n.querySelector('tbody td:nth-child(3) select');
            // Expose the whole control to the right of the fixed names (not just its right edge).
            const left=n.getBoundingClientRect().left;
            n.scrollLeft+=field.getBoundingClientRect().right-(left+n.clientWidth);
          });
          expect(await field.evaluate(n=>{
            const box=n.getBoundingClientRect(), frame=n.closest('[role=region]');
            const fixed=frame.querySelector('tbody td:nth-child(2)').getBoundingClientRect();
            return box.left>=fixed.right-1 && box.right<=frame.getBoundingClientRect().right+1;
          })).toBe(true);
          await field.click(); await field.press('Escape');
          await table.evaluate(n=>{n.scrollLeft=0;});
        }
        await root.locator('.detail-roster-toolbar').getByRole('button',{name:/投手・継投/}).click();
        await checkLayout();
        const pitchers = root.locator('.settings-pitchers');
        if (state === 'zero') await expect(pitchers).toContainText('0.00');
        if (state === 'missing') { await expect(pitchers).toContainText('未記録'); await expect(pitchers).not.toContainText('NaN'); }
        if (state === 'empty') await expect(pitchers).toContainText('先発投手が未設定');
        for (const name of [/二軍/,/会話/]) {
          await root.locator('.detail-roster-toolbar').getByRole('button',{name}).click();
          await expect(root.locator('.card').last()).toBeVisible();
          await checkLayout();
        }
        await root.getByRole('button',{name:'編成概要へ戻る',exact:true}).first().click();
        await expect(root.locator('summary')).toBeFocused();
        expect(await root.getAttribute('open')).toBeNull();
      }
      expect(errors).toEqual([]);
    });
  }
  for (const width of [360,390,1440]) {
    test(`UI-02B actual settings match save load resume ${width}`, async ({page},testInfo) => {
      test.setTimeout(120_000);
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await page.setViewportSize({width,height:width===360?800:width===390?844:900});
      await loadFixture(page,'opening');
      const initial=await readSave(page), team0=initial.teams.find(t=>t.id===initial.myId);
      const nav=mainNavigation(page,width<1024);
      await nav.getByRole('button',{name:/^編成/}).click();
      await page.locator('.tabs-nav').getByRole('button',{name:'ロスター',exact:true}).click();
      const root=page.locator('.roster-full-settings'); await root.locator('summary').click();
      await root.getByLabel('起用方針',{exact:true}).focus();
      await root.getByLabel('起用方針',{exact:true}).press('Home');
      await root.getByLabel('編成モード',{exact:true}).selectOption('manual');
      const policySave=await saveHub(page); const getTeam=s=>s.teams.find(t=>t.id===initial.myId);
      expect(getTeam(policySave).managementPolicyId).not.toBe(team0.managementPolicyId);
      expect(getTeam(policySave).rosterAutomationMode).toBe('manual');
      await root.getByRole('button',{name:'DHあり',exact:true}).click();
      await root.locator('.settings-batters').getByRole('button',{name:'自動編成',exact:true}).click();
      const dh=await saveHub(page), team=getTeam(dh);
      expect(team.rosterDhMode).toBe(true); expect(team.lineup).toHaveLength(9);
      const first=team.players.find(p=>p.id===team.lineup[0]);
      await root.getByLabel(`${first.name}の打順`,{exact:true}).selectOption('2');
      const fielding=root.getByLabel(`${first.name}の守備位置`,{exact:true});
      const actualPos=team.fieldingDh[first.id];
      // Show the existing duplicate-position warning, then restore a valid defense.
      const duplicate=Object.values(team.fieldingDh).find(p=>p!==actualPos && p!=='DH');
      await fielding.selectOption(duplicate); await expect(root.locator('.detail-lineup-table')).toContainText('同守備が重複');
      await fielding.selectOption(actualPos);
      const ordered=await saveHub(page); expect(getTeam(ordered).lineup[1]).toBe(first.id);
      await root.getByRole('button',{name:'DHなし',exact:true}).click();
      await root.locator('.settings-batters').getByRole('button',{name:'自動編成',exact:true}).click();
      await root.locator('.detail-roster-toolbar').getByRole('button',{name:/投手・継投/}).click();
      const rotation=root.locator('.settings-pitchers');
      const sp=team.players.find(p=>p.id===team.rotation[0]);
      await rotation.getByRole('button',{name:`${sp.name}の先発順を下げる`,exact:true}).click();
      const moved=await saveHub(page); expect(getTeam(moved).rotation[1]).toBe(sp.id);
      const lastId=getTeam(moved).rotation.at(-1), last=team.players.find(p=>p.id===lastId);
      await rotation.getByRole('button',{name:`${last.name}を先発ローテーションから外す`,exact:true}).click();
      await rotation.getByLabel('先発追加',{exact:true}).selectOption(lastId);
      const closer=rotation.getByLabel('🔒 抑え（9回）',{exact:true});
      const middle=team.players.find(p=>p.isPitcher&&!team.rotation.includes(p.id)&&![team.pitchingPattern?.setupId,team.pitchingPattern?.seventhId,team.pitchingPattern?.closerId].includes(p.id));
      await closer.selectOption(middle.id);
      const patched=await saveHub(page); expect(getTeam(patched).pitchingPattern.closerId).toBe(middle.id);
      await expect(rotation.getByLabel('⚙️ セットアッパー（8回）',{exact:true}).locator(`option[value="${middle.id}"]`)).toBeDisabled();
      const candidates=getTeam(patched).players.filter(p=>p.isPitcher&&!getTeam(patched).rotation.includes(p.id)&&![getTeam(patched).pitchingPattern.closerId,getTeam(patched).pitchingPattern.setupId,getTeam(patched).pitchingPattern.seventhId].includes(p.id));
      const priority=candidates.find(p=>!getTeam(patched).pitchingPattern.middleOrder.includes(p.id));
      await rotation.getByRole('button',{name:`${priority.name}を継投優先順へ追加`,exact:true}).click();
      const added=await saveHub(page); expect(getTeam(added).pitchingPattern.middleOrder).toContain(priority.id);
      if (getTeam(added).pitchingPattern.middleOrder.length>1) {
        const oldIndex=getTeam(added).pitchingPattern.middleOrder.indexOf(priority.id);
        await rotation.getByRole('button',{name:`${priority.name}の継投順を上げる`,exact:true}).click();
        expect(getTeam(await saveHub(page)).pitchingPattern.middleOrder[oldIndex-1]).toBe(priority.id);
      }
      await rotation.getByRole('button',{name:`${priority.name}を継投優先順から外す`,exact:true}).click();
      expect(getTeam(await saveHub(page)).pitchingPattern.middleOrder).not.toContain(priority.id);
      await rotation.getByRole('button',{name:'自動編成',exact:true}).click();
      const beforePlan=await saveHub(page);
      await root.getByRole('button',{name:'🔄 一括自動編成を確認',exact:true}).click();
      await expect(root.locator('.settings-recommendations')).toContainText('未反映');
      expect((await saveHub(page)).teams).toEqual(beforePlan.teams);
      await root.getByRole('button',{name:/プランを一括反映/}).click();
      const applied=await saveHub(page); expect(getTeam(applied).lineup).toHaveLength(8);
      await page.screenshot({path:testInfo.outputPath(`actual-settings-${width}.png`),fullPage:true});
      await root.getByRole('button',{name:'編成概要へ戻る',exact:true}).last().click();
      await expect(root.locator('summary')).toBeFocused();
      await nav.getByRole('button',{name:'ホーム',exact:true}).click();
      await runSingle(page,width<=760);
      const saved=await saveHub(page); expect(saved.gameDay).toBe(2);
      await reloadAndLoad(page);
      expect((await saveHub(page)).teams).toEqual(saved.teams);
      await runSingle(page,width<=760);
      const resumed=await saveHub(page); expect(resumed.gameDay).toBe(3);
      expect(resumed.farmCompetition.nextRound).toBe(3);
      expect(errors).toEqual([]);
    });
  }
  test('UI-02B invalid full roster plan cannot apply',async({page})=>{
    await page.goto('/baseball-manager/e2e/fixtures/ui02b/index.html?state=empty');
    const root=page.locator('.roster-full-settings'); await root.locator('summary').click();
    await root.getByRole('button',{name:'🔄 一括自動編成を確認',exact:true}).click();
    await expect(root).toContainText('反映不可');
    await expect(root.getByRole('button',{name:/プランを一括反映/})).toBeDisabled();
    await root.getByRole('button',{name:/閉じる/}).click();
    await expect(root.locator('.settings-recommendations')).toHaveCount(0);
  });
}
