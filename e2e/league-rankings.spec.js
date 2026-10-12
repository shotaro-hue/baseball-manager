import {test,expect} from '@playwright/test';

async function layout(page,root) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await root.locator('button,select,summary,.league-qualified').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length&&(n.getBoundingClientRect().height<44||n.getBoundingClientRect().width<44)).map(n=>n.textContent))).toEqual([]);
}
for(const width of [360,390,760,761,1023,1024,1440]) {
  test(`UI-02D2 ranking states and operations ${width}`,async({page})=>{
    test.setTimeout(90_000);await page.setViewportSize({width,height:width===360?800:width===390?844:900});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const state of ['normal','zero','missing','denominator','legacy','long','injured']) {
      await page.goto(`/baseball-manager/e2e/fixtures/ui02d2/index.html?state=${state}`);
      const root=page.locator('.league-rankings');
      await expect(root).toContainText('一軍・2026年');await expect(root).toContainText('二軍所属の一軍記録');await expect(root).not.toContainText('二軍だけの旧推定');
      for(const kind of ['打者','投手']) {
        await root.getByRole('tab',{name:kind,exact:true}).click();await layout(page,root);
        await expect(root).not.toContainText('NaN');
        const labels={zero:['実測0野手','実測0投手'],missing:['欠測野手','欠測投手'],denominator:['分母0野手','分母0投手'],legacy:['旧記録野手','旧記録投手']};
        const target=labels[state]?root.locator('table').getByRole('row',{name:`${labels[state][kind==='打者'?0:1]}の詳細を開く`,exact:true}):null;
        const primary=kind==='打者'?'OPS':'ERA';
        if(state==='zero')await expect(target.locator(`[data-metric="${primary}"]`)).toHaveText(kind==='打者'?'0.000':'0.00');
        if(['missing','legacy'].includes(state))await expect(target.locator(`[data-metric="${primary}"]`)).toHaveText('— 未記録');
        if(state==='injured')await expect(root).toContainText('負傷中');
        if(state==='denominator'){await root.getByRole('button',{name:'詳細指標',exact:true}).click();await expect(target.locator(`[data-metric="${kind==='打者'?'OPS':'Kpct'}"]`)).toHaveText('— 算出不可');}
        const frame=root.getByRole('region',{name:'成績表。横にスクロールできます',exact:true});await frame.focus();await expect(frame).toBeFocused();
        if(width<=760)expect(await frame.evaluate(n=>n.scrollWidth>n.clientWidth)).toBe(true);
        if(await frame.evaluate(n=>n.scrollWidth>n.clientWidth)){await frame.evaluate(n=>{n.scrollLeft=240;});await expect(frame.locator('.league-player-button').first()).toBeInViewport();expect(await frame.evaluate(n=>Math.abs(n.getBoundingClientRect().left-n.querySelector('tbody td').getBoundingClientRect().left)<2)).toBe(true);await frame.evaluate(n=>{n.scrollLeft=0;});}
        if(state==='normal'&&[360,390,1440].includes(width)){await root.getByRole('button',{name:'主要指標',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`docs/validation/ui02d2/after-${kind==='打者'?'batter':'pitcher'}-${width}.png`});}
      }
    }
    expect(errors).toEqual([]);
  });
}
test('UI-02D2 qualification filters sort and compare keyboard preserve list position',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/baseball-manager/e2e/fixtures/ui02d2/index.html');const root=page.locator('.league-rankings');
  await root.getByRole('tab',{name:'打者',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(root.getByRole('tab',{name:'投手',exact:true})).toBeFocused();await page.keyboard.press('Home');await expect(root.getByRole('tab',{name:'打者',exact:true})).toBeFocused();
  await root.getByLabel('規定達成のみ').check();await expect(root).toContainText('この条件に該当する選手はいません');
  await root.getByLabel('順位指標').selectOption('HR');await expect(root.getByLabel('規定達成のみ')).toBeDisabled();await expect(root).toContainText('計数指標では規定条件を適用しません');
  await root.getByRole('button',{name:'パリーグ',exact:true}).click();await root.getByRole('button',{name:'詳細指標',exact:true}).click();await root.getByRole('button',{name:'並び順を反転',exact:true}).click();
  await root.getByRole('button',{name:'主要指標',exact:true}).click();await expect(root).toContainText('本塁打 昇順');
  const frame=root.getByRole('region',{name:'成績表。横にスクロールできます',exact:true});await frame.evaluate(n=>{n.scrollTop=160;});
  const opener=frame.locator('.league-player-button').nth(3);await opener.focus();const position=await frame.evaluate(n=>({top:n.scrollTop,left:n.scrollLeft,page:window.scrollY}));await page.keyboard.press('Enter');
  const detail=page.locator('.player-modal-card');await expect(detail.getByRole('tab',{name:'打球分析',exact:true})).toHaveAttribute('aria-selected','true');
  await detail.getByRole('button',{name:'＋ 比較',exact:true}).click();await page.keyboard.press('Escape');await expect(opener).toBeFocused();expect(await frame.evaluate(n=>({top:n.scrollTop,left:n.scrollLeft,page:window.scrollY}))).toEqual(position);
  await frame.locator('.compare-add-button').nth(4).focus();await page.keyboard.press('Space');await expect(detail).toHaveCount(0);
  const compareOpen=page.getByRole('button',{name:'2人を比較',exact:true});await compareOpen.click();const dialog=page.getByRole('dialog',{name:'選手比較',exact:true});
  const close=dialog.getByRole('button',{name:'選手比較を閉じる',exact:true});await close.focus();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'元の画面に戻る',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();await page.keyboard.press('Escape');await expect(compareOpen).toBeFocused();
  await compareOpen.click();await dialog.getByRole('button',{name:/を比較から外す/}).first().click();await expect(dialog).toHaveCount(0);await page.getByRole('button',{name:'クリア',exact:true}).click();
  await expect(root.getByRole('button',{name:'パリーグ',exact:true})).toHaveAttribute('aria-pressed','true');await expect(root).toContainText('本塁打 昇順');
});
