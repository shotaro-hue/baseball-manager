// Browser-only fixture: isolated profiles, never import into production.
import { createBattedBallRunEmitter, emptyBattedBallReceipt } from '../../src/engine/battedBallRun.js';
import { createBattedBallReceiptRun, readBattedBallReceipt } from '../../src/engine/battedBallReceipts.js';
import { openBaseballManagerDb } from '../../src/engine/baseballManagerDb.js';
export { emptyBattedBallReceipt };
export async function stage({ runId, speed = 140, previousReceipt, saveId = 'source', gameId = 'same-game' }) {
  const run = createBattedBallReceiptRun({ saveId, runId, previousReceipt });
  const emitter = createBattedBallRunEmitter(chunk => run.append(chunk), { runId });
  emitter.add([{ id: `${saveId}:2026:${gameId}:p`, saveId, year: 2026, gameDay: 1, gameId, playerId: 'p',
    createdAt: 1, events: [{ result: 's', evKmh: speed, laDeg: 15 }] }]);
  return { run, receipt: await run.seal(emitter.finish()) };
}
export const state = (receipt, day) => ({ saveId: receipt.saveId, battedBallReceipt: receipt,
  teams: [{ id: 0, players: [], farm: [] }], myId: 0, gameDay: day, year: 2026, news: [], mailbox: [], seasonHistory: {} });
export async function capture(receipt) {
  const speeds = [];
  const result = await readBattedBallReceipt(receipt, { onChunk: rows => speeds.push(...rows.flatMap(row => row.events.map(e => e.evKmh))) });
  return { ...result, speeds };
}
export async function snapshot(storeName) {
  const db = await openBaseballManagerDb();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly'), store = tx.objectStore(storeName), keys = store.getAllKeys(), values = store.getAll();
    tx.oncomplete = () => resolve(keys.result.map((key, i) => [key, values.result[i]])); tx.onabort = tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}
