// Usage: node scripts/benchmark-annual-transactions.mjs [--webkit] [--output=path.json]
// No timing thresholds: machine speed and JIT differ. Run baseline and final in the same environment.
import { createServer } from 'vite';
import { webkit, devices } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5178, strictPort: true } });
const result = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: process.version, platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0].model,
  input: { clubs: 12, players: 780, contractYears: 7, annualAuthorizations: 84, warmups: 1, measuredQuotes: 5,
    date: '2026-07-01', command: 'two-way cashless trade', minimumControlledCount: 67, salaryManYen: 1000 } };
let browser;
try {
  const { createTransactionLoad, measureQuotes } = await server.ssrLoadModule('/scripts/gm-01c-1/transaction-load.js');
  const { quoteAnnualTransaction } = await server.ssrLoadModule('/src/engine/annualTransactions.js');
  const scenario = createTransactionLoad();
  result.node = measureQuotes(quoteAnnualTransaction, scenario);
  if (process.argv.includes('--webkit')) {
    await server.listen();
    browser = await webkit.launch();
    result.browserVersion = browser.version();
    const context = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.route('http://127.0.0.1:5178/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>API benchmark</title>' }));
    await page.goto('http://127.0.0.1:5178/');
    result.webkit = await page.evaluate(async scenario => {
      const { measureQuotes } = await import('/scripts/gm-01c-1/transaction-load.js');
      const { quoteAnnualTransaction } = await import('/src/engine/annualTransactions.js');
      return measureQuotes(quoteAnnualTransaction, scenario);
    }, scenario);
    if (result.webkit.rows !== result.node.rows) throw new Error('Node and WebKit quote rows differ');
  }
  // Rows are checked above but do not need to inflate the saved report.
  delete result.node.rows;
  if (result.webkit) delete result.webkit.rows;
  const output = process.argv.find(a => a.startsWith('--output='))?.slice(9);
  const json = JSON.stringify(result, null, 2);
  if (output) writeFileSync(output, `${json}\n`);
  console.log(json);
} finally {
  await browser?.close();
  await server.close();
}
