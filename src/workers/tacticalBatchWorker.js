import { quickSimGame } from '../engine/simulation';
import { BATCH_SIM_MESSAGE_TYPE, BATCH_SIM_PROGRESS_INTERVAL_PA } from './batchSimulationProtocol';

const sanitizeGames = (games) => Array.isArray(games) ? games.filter((g) => g && typeof g === 'object' && g.homeTeam && g.awayTeam) : [];

self.onmessage = (event) => {
  const message = event?.data;
  if (!message || message.type !== BATCH_SIM_MESSAGE_TYPE.START) return;
  const { taskId, games } = message.payload || {};
  try {
    if (!taskId || typeof taskId !== 'string') throw new Error('taskIdが不正です');
    const safeGames = sanitizeGames(games);
    self.postMessage({ type: BATCH_SIM_MESSAGE_TYPE.START, payload: { taskId } });
    const results = [];
    let paCounter = 0;
    let nextProgressPa = BATCH_SIM_PROGRESS_INTERVAL_PA;
    for (const game of safeGames) {
      const result = quickSimGame(game.homeTeam, game.awayTeam);
      results.push({ gameId: game.gameId, result });
      paCounter += Array.isArray(result?.log) ? result.log.length : 0;
      while (paCounter >= nextProgressPa) {
        self.postMessage({ type: BATCH_SIM_MESSAGE_TYPE.PROGRESS, payload: { taskId, completedPa: nextProgressPa } });
        nextProgressPa += BATCH_SIM_PROGRESS_INTERVAL_PA;
      }
    }
    self.postMessage({ type: BATCH_SIM_MESSAGE_TYPE.DONE, payload: { taskId, summary: { gameCount: results.length, totalPa: paCounter }, detailResults: results } });
  } catch (error) {
    self.postMessage({ type: BATCH_SIM_MESSAGE_TYPE.ERROR, payload: { taskId: taskId || null, message: error instanceof Error ? error.message : 'Workerエラー' } });
  }
};
