// Production builds, same fixture, same Chromium and fonts. No timing assertions in CI.
// node scripts/measure-ui04c-fix.mjs before /absolute/baseline-dist
// node scripts/measure-ui04c-fix.mjs after /absolute/final-dist
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { managementLoadFixture } from '../e2e/helpers/management-load-fixture.js';

const [stage, dist] = process.argv.slice(2);
const captureOnly = process.env.UI04C_CAPTURE_ONLY === '1';
if (!['before', 'after'].includes(stage) || !dist) throw Error('usage: before|after absolute-dist');
const out = resolve('docs/validation/ui-04c-fix'); mkdirSync(out, { recursive: true });
const seed = await build({ entryPoints: ['src/engine/saveload.js'], bundle: true, write: false, format: 'iife', globalName: '__fixtureStorage', define: { 'import.meta.env': '{"DEV":false}' } });
const server = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'preview', '--outDir', resolve(dist), '--host', '127.0.0.1', '--port', '5197', '--strictPort'], { stdio: 'ignore' });
let browser;
const pause = ms => new Promise(r => setTimeout(r, ms));
const rows = [];
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://127.0.0.1:5197/baseball-manager/')).ok) break; } catch {}
    await pause(100);
  }
  browser = await chromium.launch();
  for (const width of captureOnly ? [360, 390, 1440] : [360, 390, 760, 761, 1023, 1024, 1440]) {
    for (let run = 0; run < (width === 390 && !captureOnly ? 3 : 1); run++) {
      const height = width === 360 ? 800 : width === 390 ? 844 : 900;
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
      const page = await context.newPage(); page.setDefaultTimeout(12000);
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const f = managementLoadFixture(), inputHash = createHash('sha256').update(JSON.stringify(f.fixture.teams)).digest('hex');
      await page.goto('http://127.0.0.1:5197/baseball-manager/');
      await page.addScriptTag({ content: seed.outputFiles[0].text });
      await page.evaluate(async data => { if (!(await __fixtureStorage.saveGame(data)).ok) throw Error('seed failed'); }, f.fixture);
      await page.reload(); await page.getByRole('button', { name: '続きから', exact: true }).click();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const main = width < 1024 ? page.getByRole('navigation', { name: 'メインメニュー' }) : page.getByRole('complementary', { name: '監督メニュー' });
      await main.getByRole('button', { name: /^経営/ }).click();
      for (const tab of ['contract', 'trade', 'scout', 'fa']) {
        const nav = page.getByRole('navigation', { name: '経営メニュー', exact: true });
        await nav.getByRole('button', { name: '概要', exact: true }).click();
        const trace = !captureOnly && width === 390 && run === 0;
        if (trace) await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' });
        const start = await page.evaluate(() => performance.now());
        if (tab === 'contract') await nav.getByRole('button', { name: /^契約/ }).click();
        else await page.getByRole('button', { name: { trade: 'トレード', scout: 'スカウト', fa: 'FA市場' }[tab], exact: true }).click();
        const route = page.locator(`[data-hub-route="${tab}"]:not([hidden])`);
        if (tab === 'trade') await route.getByRole('button', { name: `${f.other.name}と交渉する`, exact: true }).click();
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const displayMs = (await page.evaluate(() => performance.now())) - start;
        await page.evaluate(() => scrollTo(0, 0));
        if (captureOnly) {
          const list = route.locator(tab === 'fa' ? '.fa-list' : tab === 'trade' && stage === 'before' ? '.decision-exchange' : '.decision-list').first();
          await list.evaluate((el, offset) => scrollTo(0, scrollY + el.getBoundingClientRect().top - offset), tab === 'trade' && stage === 'after' ? 140 : 8);
          await page.screenshot({ path: `${out}/${stage}-${tab}-${width}.png` });
          console.log(`${stage} ${width}px ${tab}: captured list controls and compact rows`);
          continue;
        }
        if (run === 0 && [360, 390, 1440].includes(width)) await page.screenshot({ path: `${out}/${stage}-${tab}-${width}.png` });
        const layout = await route.evaluate(el => ({ dom: el.querySelectorAll('*').length, height: el.scrollHeight, overflow: document.documentElement.scrollWidth > innerWidth,
          nestedScrollers: [...el.querySelectorAll('*')].filter(n => n.scrollHeight > n.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(n).overflowY)).length }));
        const scrollTarget = tab === 'trade' && stage === 'before' ? route.locator('.decision-trade-players').first() : route;
        if (tab === 'trade' && stage === 'before') await scrollTarget.scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          window.__scrollSamples = { frames: [], tasks: [], samplingStart: performance.now() }; let last = performance.now();
          window.__scrollObserver = new PerformanceObserver(list => __scrollSamples.tasks.push(...list.getEntries().map(e => ({ duration: e.duration, startTime: e.startTime }))));
          __scrollObserver.observe({ type: 'longtask', buffered: false });
          window.__sampling = true;
          function frame(t) { if (!__sampling) return; __scrollSamples.frames.push(t - last); last = t; requestAnimationFrame(frame); } requestAnimationFrame(frame);
        });
        const actualBox = await scrollTarget.boundingBox();
        const gesture = { x: tab === 'trade' && stage === 'before' ? Math.round(actualBox.x + actualBox.width / 2) : Math.round(width / 2), y: tab === 'trade' && stage === 'before' ? Math.round(Math.min(700, actualBox.y + actualBox.height / 2)) : 650, speed: 1200, gestureSourceType: 'mouse' };
        const position = () => scrollTarget.evaluate(el => ({ page: scrollY, list: el.scrollTop }));
        const scrollStart = await position();
        await cdp.send('Input.synthesizeScrollGesture', { ...gesture, yDistance: -1500 });
        const scrollDown = await position();
        await cdp.send('Input.synthesizeScrollGesture', { ...gesture, yDistance: 1000 });
        const scrollUp = await position();
        if (scrollStart.page === scrollDown.page && scrollStart.list === scrollDown.list) throw Error(`${tab}: scroll gesture did not move content`);
        const samples = await page.evaluate(() => { __sampling = false; __scrollObserver.disconnect(); return { ...__scrollSamples, scrollY, samplingEnd: performance.now() }; });
        if (trace) {
          const done = new Promise(r => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end');
          const { stream } = await done; let data = '';
          while (true) { const chunk = await cdp.send('IO.read', { handle: stream }); data += chunk.data; if (chunk.eof) break; }
          await cdp.send('IO.close', { handle: stream }); writeFileSync(`${out}/${stage}-${tab}-trace.json.gz`, gzipSync(data));
        }
        const frames = samples.frames.slice(1).sort((a, b) => a - b);
        await cdp.send('HeapProfiler.collectGarbage');
        const perf = await cdp.send('Performance.getMetrics'); const heap = perf.metrics.find(m => m.name === 'JSHeapUsedSize')?.value;
        let detailMs = null, detailDom = null, returnDelta = null;
        const selector = stage === 'after' ? '.player-list-row' : ['contract', 'scout'].includes(tab) ? '.decision-select' : tab === 'fa' ? '.fa-row' : null;
        if (selector) {
          const button = route.locator(selector).first(); await button.scrollIntoViewIfNeeded();
          // Playwright can move a covered row again when clicking below a sticky
          // summary. Compare against the actual selection event, as the UI does.
          await button.evaluate(el => el.addEventListener('click', () => { window.__selectionOriginY = scrollY; }, { once: true, capture: true }));
          const t = await page.evaluate(() => performance.now());
          await button.click(); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
          detailMs = (await page.evaluate(() => performance.now())) - t; detailDom = await route.locator('*').count();
          if (run === 0 && [360, 390, 1440].includes(width)) await page.screenshot({ path: `${out}/${stage}-${tab}-detail-${width}.png` });
          await route.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
          await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
          returnDelta = await page.evaluate(() => scrollY - window.__selectionOriginY);
        }
        rows.push({ width, viewportHeight: height, run, tab, displayMs, ...layout, frameP95Ms: frames[Math.floor(frames.length * .95)], frameMaxMs: frames.at(-1), frames: frames.length,
          longTasks: samples.tasks.length, longestTaskMs: Math.max(0, ...samples.tasks.map(t => t.duration)), taskSamples: samples.tasks, samplingStart: samples.samplingStart, samplingEnd: samples.samplingEnd, scrollY: samples.scrollY, scrollStart, scrollDown, scrollUp, heapBytes: heap, detailMs, detailDom, returnDelta, errors, inputHash });
        console.log(`${stage} ${width} #${run} ${tab}: DOM=${layout.dom}, p95=${rows.at(-1).frameP95Ms?.toFixed(1)}ms, longTasks=${samples.tasks.length}`);
      }
      await context.close();
    }
  }
  if (!captureOnly) writeFileSync(`${out}/${stage}-metrics.json`, JSON.stringify({ stage, browser: browser.version(), production: true, cpuThrottle: 4, hashScope: 'fixture.teams (including scoutResults); global faPool is fixed by management-load-fixture.js', gesture: 'CDP synthetic mouse wheel; actual iPhone touch scrolling is not verified', rows }, null, 2) + '\n');
} finally { await browser?.close(); server.kill(); }
