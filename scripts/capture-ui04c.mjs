// Run from the repository: node scripts/capture-ui04c.mjs before /tmp/ui04c-before
//                         node scripts/capture-ui04c.mjs after .
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { managementFixture } from '../e2e/helpers/management-fixture.js';

const stage = process.argv[2], root = resolve(process.argv[3] || '.');
if (!['before', 'after'].includes(stage)) throw Error('stage must be before or after');
const evidence = resolve('docs/validation/ui-04c');
mkdirSync(evidence, { recursive: true });
const port = 5190;
const config = `/tmp/ui04c-${stage}-vite.config.mjs`;
writeFileSync(config, `import base from ${JSON.stringify(resolve(root, 'vite.config.js'))};\nexport default {...base,cacheDir:${JSON.stringify(`/tmp/ui04c-${stage}-vite-cache`)}};\n`);
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--config', config, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
process.on('exit', () => server.kill());
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/baseball-manager/`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!ready) throw Error('capture server failed');
  browser = await chromium.launch();
  const results = [];
  for (const width of [360, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 360 ? 800 : width === 390 ? 844 : 900 } });
    page.setDefaultTimeout(12000);
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const f = managementFixture();
    await page.goto(`http://127.0.0.1:${port}/baseball-manager/`);
    await page.evaluate(async fixture => {
      const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
      if (!(await saveGame(fixture)).ok) throw Error('fixture save failed');
    }, f.fixture);
    await page.reload(); await page.getByRole('button', { name: '続きから', exact: true }).click();
    const mainNav = width < 1024 ? page.getByRole('navigation', { name: 'メインメニュー' }) : page.getByRole('complementary', { name: '監督メニュー' });
    await mainNav.getByRole('button', { name: /^経営/ }).click();
    const nav = page.getByRole('navigation', { name: '経営メニュー' });
    const capture = async name => {
      await page.screenshot({ path: `${evidence}/${stage}-${name}-${width}.png`, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      results.push({ stage, width, screen: name, overflow, pageErrors: [...errors] });
      console.log(`${stage} ${width}px ${name}: overflow=${overflow}`);
    };
    await nav.getByRole('button', { name: '補強', exact: true }).click(); await capture('reinforcement');
    await nav.getByRole('button', { name: /^契約/ }).click(); await capture('contract');
    if (stage === 'after') {
      await page.getByRole('button', { name: `${f.contract.name}の契約を確認`, exact: true }).click(); await capture('contract-detail');
    }
    await nav.getByRole('button', { name: '補強', exact: true }).click();
    await page.getByRole('navigation', { name: '補強メニュー' }).getByRole('button', { name: /^スカウト/ }).click(); await capture('scout');
    if (stage === 'after') {
      await page.getByRole('button', { name: `${f.scout.name}の条件を見る`, exact: true }).click(); await capture('scout-detail');
    }
    await page.getByRole('navigation', { name: '補強メニュー' }).getByRole('button', { name: /^トレード/ }).click();
    if (stage === 'before') {
      await page.getByText(`${f.other.emoji} ${f.other.name}`, { exact: true }).click();
      await page.getByText(f.incoming.name, { exact: true }).first().locator('..').locator('..').locator('..').click();
    } else {
      await page.getByRole('button', { name: `${f.other.name}と交渉する`, exact: true }).click();
      await page.getByLabel(`${f.incoming.name}を獲得候補に選ぶ`, { exact: true }).check();
    }
    await page.locator('input[type=number]').fill('500'); await capture('trade');
    const data = await page.evaluate(async () => {
      const { loadGame } = await import('/baseball-manager/src/engine/saveload.js');
      const state = await loadGame(); return { teams: state.teams, year: state.year, gameDay: state.gameDay };
    });
    const teamsHash = createHash('sha256').update(JSON.stringify(data.teams)).digest('hex');
    for (const row of results.filter(r => r.width === width)) Object.assign(row, { teamsHash, year: data.year, gameDay: data.gameDay });
    await page.close();
  }
  if (results.some(r => r.overflow || r.pageErrors.length)) throw Error('capture found overflow or page errors');
  if (new Set(results.map(r => r.teamsHash)).size !== 1) throw Error('display changed saved clubs');
  writeFileSync(`${evidence}/${stage}-comparison.json`, JSON.stringify(results, null, 2) + '\n');
} finally { await browser?.close(); server.kill(); }
