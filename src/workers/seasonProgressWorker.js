// 進捗計算専用ワーカー
// 非同期処理【＝複数の処理を同時に進める仕組み】で ETA 計算をUIスレッドから分離する
let activeTaskId = null;
let smoothedAvgMsPerGame = 0;
const EMA_ALPHA = 0.25;

function sanitizeInteger(value, fallback = 0, min = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function sanitizePhase(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '試合計算';
}

function resetTask(taskId) {
  activeTaskId = taskId;
  smoothedAvgMsPerGame = 0;
}

self.onmessage = (event) => {
  const message = event?.data;
  if (!message || typeof message !== 'object') return;

  try {
    if (message.type === 'START') {
      const taskId = typeof message?.payload?.taskId === 'string' ? message.payload.taskId.trim() : '';
      if (!taskId) throw new Error('taskId が不正です');
      resetTask(taskId);
      return;
    }

    if (message.type === 'CANCEL') {
      activeTaskId = null;
      smoothedAvgMsPerGame = 0;
      return;
    }

    if (message.type !== 'TICK') return;

    const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
    const taskId = typeof payload.taskId === 'string' ? payload.taskId.trim() : '';
    if (!taskId || taskId !== activeTaskId) return;

    const total = sanitizeInteger(payload.total, 1, 1);
    const current = Math.min(total, sanitizeInteger(payload.current, 0, 0));
    const elapsedMs = Math.max(0, Number(payload.elapsedMs) || 0);
    const instantAvgMsPerGame = current > 0 ? elapsedMs / current : 0;
    smoothedAvgMsPerGame = smoothedAvgMsPerGame <= 0
      ? instantAvgMsPerGame
      : (EMA_ALPHA * instantAvgMsPerGame) + ((1 - EMA_ALPHA) * smoothedAvgMsPerGame);
    const etaSec = current >= total ? 0 : ((total - current) * smoothedAvgMsPerGame) / 1000;

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        taskId,
        current,
        total,
        avgMsPerGame: Number.isFinite(smoothedAvgMsPerGame) ? Math.max(0, smoothedAvgMsPerGame) : 0,
        etaSec: Number.isFinite(etaSec) ? Math.max(0, etaSec) : 0,
        phase: sanitizePhase(payload.phase),
      },
    });
  } catch (error) {
    // ⚠️ エラー詳細は機密情報を含めず最小限のみ返却する
    self.postMessage({
      type: 'ERROR',
      payload: { message: error instanceof Error ? error.message : '進捗計算エラー' },
    });
  }
};
