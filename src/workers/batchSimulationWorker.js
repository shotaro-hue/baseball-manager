import { simAtBat, DEFAULT_LEAGUE_ENV, resolveBattedBallOutcomeFromPhysicsForBalance, STADIUMS } from '../engine/simulation';
import { BATCH_SIM_MESSAGE_TYPE, BATCH_SIM_PROGRESS_INTERVAL_PA } from './batchSimulationProtocol';

const PROGRESS_INTERVAL_PA = BATCH_SIM_PROGRESS_INTERVAL_PA;
let activeTaskId = null;
let cancelRequested = false;
const createSeededRandom = (seed) => { let state = (seed >>> 0) || 1; return () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000); };
const sanitizePa = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1; };
function simulateProfile(batter, pitcher, totalPa, leagueEnv, randomFn) {
  const stadium = STADIUMS.tokyo_dome;
  const count = { pa: 0, bip: 0, hr: 0, k: 0, bb: 0, hbp: 0, out: 0, s: 0, d: 0, t: 0, evSum: 0, laSum: 0, distSum: 0, q: { weak: 0, normal: 0, solid: 0, hard: 0, barrel: 0 } };
  for (let i = 0; i < totalPa; i += 1) {
    if (cancelRequested) break;
    const atBat = simAtBat(batter, pitcher, 'normal', 0, { stadium: 'tokyo_dome' }, leagueEnv);
    const paResult = atBat?.result || 'out'; count.pa += 1;
    if (paResult === 'k' || paResult === 'bb' || paResult === 'hbp') { count[paResult] += 1; continue; }
    if (paResult !== 'inplay') continue;
    count.bip += 1;
    const resolved = resolveBattedBallOutcomeFromPhysicsForBalance(batter, pitcher, stadium, { rng: randomFn }, { leagueEnv });
    const resolvedResult = resolved?.result || 'out'; if (count[resolvedResult] !== undefined) count[resolvedResult] += 1;
    const meta = resolved?.physicsMeta || {}; const quality = ['weak', 'normal', 'solid', 'hard', 'barrel'].includes(meta.quality) ? meta.quality : 'normal';
    count.evSum += Number(meta.ev) || 0; count.laSum += Number(meta.la) || 0; count.distSum += Number(meta.distance) || 0; count.q[quality] += 1;
  }
  const denominatorBip = Math.max(1, count.bip);
  return { pa: count.pa, bip: count.bip, hrPerBip: count.hr / denominatorBip, hrPerPa: count.hr / Math.max(1, count.pa), teamHrPerGame: (count.hr / Math.max(1, count.pa)) * 38, avgEv: count.evSum / denominatorBip, avgLa: count.laSum / denominatorBip, avgDistance: count.distSum / denominatorBip, qualityRate: Object.fromEntries(Object.entries(count.q).map(([k, v]) => [k, v / denominatorBip])) };
}
self.onmessage = (event) => {
  const message = event.data;
  try {
    if (message?.type === BATCH_SIM_MESSAGE_TYPE.CANCEL) { if (activeTaskId && message.payload?.taskId === activeTaskId) cancelRequested = true; return; }
    if (message?.type !== BATCH_SIM_MESSAGE_TYPE.START) return;
    const { taskId, profiles, leagueEnv, seed } = message.payload || {};
    if (!taskId || !Array.isArray(profiles)) throw new Error('不正なSTARTメッセージです');

    self.postMessage({ type: BATCH_SIM_MESSAGE_TYPE.START, payload: { taskId } });

    activeTaskId = taskId; cancelRequested = false;
    const randomFn = Number.isFinite(Number(seed)) ? createSeededRandom(Number(seed)) : Math.random;
    const safeLeagueEnv = { ...DEFAULT_LEAGUE_ENV, ...(leagueEnv || {}) };
    const totalPaAll = profiles.reduce((sum, p) => sum + sanitizePa(p.totalPa), 0);
    let donePa = 0; const detailResults = [];
    for (const profile of profiles) {
      if (cancelRequested) break;
      const safePa = sanitizePa(profile.totalPa); const aggregate = []; let remaining = safePa;
      while (remaining > 0) {
        if (cancelRequested) break;
        const currentPa = Math.min(PROGRESS_INTERVAL_PA, remaining);
        aggregate.push(simulateProfile(profile.batter, profile.pitcher, currentPa, safeLeagueEnv, randomFn));
        remaining -= currentPa; donePa += currentPa;
        self.postMessage({ type: BATCH_SIM_MESSAGE_TYPE.PROGRESS, payload: { taskId, completedPa: donePa, totalPa: totalPaAll } });
      }
      const merged = aggregate.reduce((acc, row) => {
        if (!acc) return { ...row };
        const pa = acc.pa + row.pa; const bip = acc.bip + row.bip;
        const evSum = (acc.avgEv * Math.max(1, acc.bip)) + (row.avgEv * Math.max(1, row.bip));
        const laSum = (acc.avgLa * Math.max(1, acc.bip)) + (row.avgLa * Math.max(1, row.bip));
        const distSum = (acc.avgDistance * Math.max(1, acc.bip)) + (row.avgDistance * Math.max(1, row.bip));
        const hrApprox = (acc.hrPerPa * acc.pa) + (row.hrPerPa * row.pa);
        const q = {};
        for (const key of Object.keys(acc.qualityRate || {})) q[key] = ((acc.qualityRate[key] || 0) * Math.max(1, acc.bip) + (row.qualityRate?.[key] || 0) * Math.max(1, row.bip)) / Math.max(1, bip);
        return { pa, bip, hrPerBip: hrApprox / Math.max(1, bip), hrPerPa: hrApprox / Math.max(1, pa), teamHrPerGame: (hrApprox / Math.max(1, pa)) * 38, avgEv: evSum / Math.max(1, bip), avgLa: laSum / Math.max(1, bip), avgDistance: distSum / Math.max(1, bip), qualityRate: q };
      }, null);
      detailResults.push({ label: profile.label, ...(merged || simulateProfile(profile.batter, profile.pitcher, 1, safeLeagueEnv, randomFn)) });
    }
    if (cancelRequested) { self.postMessage({ type: BATCH_SIM_MESSAGE_TYPE.CANCEL, payload: { taskId } }); activeTaskId = null; return; }
    self.postMessage({ type: BATCH_SIM_MESSAGE_TYPE.DONE, payload: { taskId, summary: { profileCount: detailResults.length, totalPa: donePa }, detailResults } });
    activeTaskId = null;
  } catch (error) {
    self.postMessage({ type: BATCH_SIM_MESSAGE_TYPE.ERROR, payload: { taskId: message?.payload?.taskId || null, message: error instanceof Error ? error.message : 'Workerエラー' } }); activeTaskId = null;
  }
};
