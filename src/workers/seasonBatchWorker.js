import {
  simulateSeasonBatch,
  SeasonBatchCancelledError,
} from './seasonBatchCore.js';
import { simulateSingleDay } from './singleDayCore.js';

let activeTaskId = null;
let cancelRequested = false;

self.onmessage = (event) => {
  const message = event?.data;
  if (!message || typeof message !== 'object') return;

  try {
    if (message.type === 'CANCEL') {
      if (activeTaskId && message.payload?.taskId === activeTaskId) {
        cancelRequested = true;
      }
      return;
    }

    if (message.type !== 'START') return;

    const {
      taskId,
      mode = 'batch',
      snapshot,
      count,
      autoManageMyTeam,
      gameContext,
    } = message.payload || {};
    if (!taskId) {
      throw new Error('taskId is required');
    }

    activeTaskId = taskId;
    cancelRequested = false;

    const commonArgs = {
      isCancelled: () => cancelRequested || activeTaskId !== taskId,
      onProgress: (progress) => {
        if (cancelRequested || activeTaskId !== taskId) return;
        self.postMessage({
          type: 'PROGRESS',
          payload: {
            taskId,
            ...progress,
          },
        });
      },
    };

    const result = mode === 'singleDay'
      ? simulateSingleDay({
          snapshot,
          gameContext,
          ...commonArgs,
        })
      : simulateSeasonBatch({
          snapshot,
          count,
          autoManageMyTeam,
          ...commonArgs,
        });

    if (cancelRequested || activeTaskId !== taskId) {
      self.postMessage({ type: 'CANCEL', payload: { taskId } });
      activeTaskId = null;
      return;
    }

    self.postMessage({
      type: 'DONE',
      payload: {
        taskId,
        result,
      },
    });
    activeTaskId = null;
  } catch (error) {
    const taskId = message?.payload?.taskId || activeTaskId || null;
    if (error instanceof SeasonBatchCancelledError || cancelRequested) {
      self.postMessage({ type: 'CANCEL', payload: { taskId } });
    } else {
      self.postMessage({
        type: 'ERROR',
        payload: {
          taskId,
          message: error instanceof Error ? error.message : 'Worker error',
        },
      });
    }
    activeTaskId = null;
  }
};
