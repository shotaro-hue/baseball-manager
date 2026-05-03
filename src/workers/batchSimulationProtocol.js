// バッチシムWorkerのメッセージ定義【＝主スレッドとWorker間の通信ルール】
export const BATCH_SIM_MESSAGE_TYPE = Object.freeze({
  START: 'START',
  PROGRESS: 'PROGRESS',
  DONE: 'DONE',
  ERROR: 'ERROR',
  CANCEL: 'CANCEL',
});

export const BATCH_SIM_PROGRESS_INTERVAL_PA = 100;

export function isValidMessageType(type) {
  return typeof type === 'string' && Object.values(BATCH_SIM_MESSAGE_TYPE).includes(type);
}

