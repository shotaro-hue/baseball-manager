// Isolated comparison servers; no existing dev-server session is reused.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
const ports = { before: 5187, after: 5188 };
const servers = Object.entries(ports).map(([stage, port]) => {
  const root = stage === 'before' ? '/tmp/ui04-before' : process.cwd();
  const configPath = resolve(tmpdir(), `ui04-${stage}-vite.config.mjs`);
  // The baseline can symlink node_modules, but must not share .vite with the
  // working tree or the concurrently running browser regressions.
  writeFileSync(configPath, `import base from ${JSON.stringify(resolve(root, 'vite.config.js'))};\nexport default {...base, cacheDir: ${JSON.stringify(resolve(tmpdir(), `ui04-${stage}-vite-cache`))}};\n`);
  return spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--config', configPath,
    '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
});
process.on('exit', () => servers.forEach(server => server.kill()));
for (const port of Object.values(ports)) {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/baseball-manager/`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw Error(`capture server ${port} did not start`);
  console.log(`capture server ${port} ready`);
}
const evidence = resolve('docs/validation/ui-04a');
mkdirSync(evidence, { recursive: true });
const fixture = JSON.parse(gunzipSync(readFileSync('e2e/fixtures/new-game.json.gz')));
fixture.mailbox = []; fixture.news = [];
const browser = await chromium.launch();
const results = [];
for (const stage of ['before', 'after']) for (const width of [360, 390, 1440]) {
  console.log(`capturing ${stage} ${width}px`);
  const page = await browser.newPage({ viewport: { width, height: width === 360 ? 800 : width === 390 ? 844 : 900 } });
  // Comparison uses the same installed Japanese fallback on both trees.
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  page.on('pageerror', error => console.log(`${stage} ${width}px: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') console.log('browser error:', message.text()); });
  await page.goto(`http://127.0.0.1:${ports[stage]}/baseball-manager/`);
  await page.getByRole('button', { name: '読売ジャイアンツ', exact: true }).waitFor({ timeout: 10000 }).catch(async error => {
    console.log('capture page:', await page.locator('body').innerText()); throw error;
  });
  console.log(`title ready ${stage} ${width}px`);
  await page.evaluate(async fixture => {
    const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { startClubFinance } = await import('/baseball-manager/src/engine/clubFinance.js');
    const { generateSeasonSchedule } = await import('/baseball-manager/src/engine/scheduleGen.js');
    fixture.teams = fixture.teams.map(t => startClubFinance(t, fixture.year));
    fixture.schedule = generateSeasonSchedule(fixture.year, fixture.teams);
    if (!(await saveGame(fixture)).ok) throw Error('fixture save failed');
  }, fixture);
  console.log(`fixture saved ${stage} ${width}px`);
  await page.reload(); await page.getByRole('button', { name: '続きから', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).waitFor();
  await page.screenshot({ path: `${evidence}/${stage}-home-${width}.png`, fullPage: true });
  const nav = width < 1024 ? page.getByRole('navigation', { name: 'メインメニュー' }) : page.getByRole('complementary', { name: '監督メニュー' });
  await nav.getByRole('button', { name: stage === 'before' ? /^その他/ : /^経営/ }).click();
  await page.screenshot({ path: `${evidence}/${stage}-management-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: stage === 'before' ? '球団運営' : '財務', exact: true }).click();
  await page.getByText('予算 / 年俸上位', { exact: true }).waitFor();
  await page.screenshot({ path: `${evidence}/${stage}-finance-${width}.png`, fullPage: true });
  const data = await page.evaluate(async () => {
    const { loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const state = await loadGame();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(state.teams)));
    return { teamsHash: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''),
      year: state.year, gameDay: state.gameDay, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  results.push({ stage, width, ...data }); await page.close();
}
await browser.close();
for (const server of servers) server.kill();
if (new Set(results.map(r => r.teamsHash)).size !== 1) throw Error('comparison states differ');
writeFileSync(`${evidence}/comparison.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
