// 1シーズン進行用の軽量ワーカー
// 非同期処理【＝複数の処理を同時に進める仕組み】で進捗通知のみを担当する
let timerId = null;
let currentTaskId = null;

function sanitizeInteger(value, fallback = 0, min = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

self.onmessage = (event) => {
  const message = event?.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'CANCEL') {
    stopTimer();
    if (currentTaskId) {
      self.postMessage({ type: 'CANCELLED', payload: { taskId: currentTaskId } });
    }
    currentTaskId = null;
    return;
  }

  if (message.type !== 'START') return;

  try {
    const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
    const taskId = typeof payload.taskId === 'string' && payload.taskId.trim() ? payload.taskId.trim() : '';
    const total = sanitizeInteger(payload.totalGames, 0, 1);
    const intervalMs = sanitizeInteger(payload.intervalMs, 120, 16);
    if (!taskId || total <= 0) throw new Error('不正なパラメータです');

    stopTimer();
    currentTaskId = taskId;
    let current = 0;
    self.postMessage({ type: 'PROGRESS', payload: { taskId, current, total, phase: '試合計算' } });

    timerId = setInterval(() => {
      if (currentTaskId !== taskId) {
        stopTimer();
        return;
      }
      current = Math.min(total, current + 1);
      self.postMessage({ type: 'PROGRESS', payload: { taskId, current, total, phase: current >= total ? '集計中' : '試合計算' } });
      if (current >= total) {
        stopTimer();
        self.postMessage({ type: 'DONE', payload: { taskId } });
      }
    }, intervalMs);
  } catch (error) {
    stopTimer();
    const messageText = error instanceof Error ? error.message : 'Workerエラー';
    self.postMessage({ type: 'ERROR', payload: { message: messageText } });
    currentTaskId = null;
  }
};
