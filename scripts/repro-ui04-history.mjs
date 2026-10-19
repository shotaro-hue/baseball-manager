// Isolates the WebKit history → reload failure without game/React/storage code.
// The old strategy may be fixed by a future browser; only the native strategy
// must pass. This script does not suppress any application E2E failures.
import http from 'node:http';
import { webkit } from 'playwright';
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><html><body><h1>History reload</h1></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await webkit.launch();
const results = [];
try {
  for (const strategy of ['push-state', 'native-fragment']) {
    const page = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(strategy => {
        history.replaceState({ step: 0 }, '');
        for (const [step, tab] of [[1, 'settings'], [2, 'balance']]) {
          if (strategy === 'push-state') history.pushState({ step }, '');
          else { location.hash = `hub/${tab}`; history.replaceState({ step }, ''); }
        }
      }, strategy);
      await page.goBack(); await page.goBack();
      await page.reload({ timeout: 10000 });
      if (await page.locator('h1').textContent() !== 'History reload') throw Error('unexpected document');
      results.push({ strategy, ok: true });
    } catch (error) {
      results.push({ strategy, ok: false, error: error.message });
    } finally { await page.close().catch(() => {}); }
  }
} finally { await browser.close(); server.close(); }
console.log(JSON.stringify(results, null, 2));
if (!results.find(result => result.strategy === 'native-fragment')?.ok) process.exitCode = 1;
