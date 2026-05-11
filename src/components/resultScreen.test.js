import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultScreen } from './ResultScreen';
import { scheduleDeferredPostGameWork } from '../engine/postGameProcessing';

const myTeam = {
  id: 'my',
  name: 'My Team',
  short: 'MY',
  emoji: 'A',
  color: '#f5c842',
  wins: 10,
  losses: 5,
  draws: 1,
  players: [],
  farm: [],
};

const oppTeam = {
  id: 'opp',
  name: 'Opp Team',
  short: 'OPP',
  emoji: 'B',
  color: '#94a3b8',
  players: [],
  farm: [],
};

const gsResult = {
  score: { my: 3, opp: 2 },
  log: [],
  inningSummary: [],
  oppTeam,
  won: true,
  gameNo: 12,
};

describe('scheduleDeferredPostGameWork', () => {
  it('uses requestIdleCallback when available', () => {
    const task = vi.fn();
    const requestIdleCallbackImpl = vi.fn((callback) => {
      callback({ didTimeout: false, timeRemaining: () => 12 });
      return 77;
    });
    const setTimeoutImpl = vi.fn();

    const handle = scheduleDeferredPostGameWork(task, {
      requestIdleCallbackImpl,
      setTimeoutImpl,
    });

    expect(requestIdleCallbackImpl).toHaveBeenCalledTimes(1);
    expect(setTimeoutImpl).not.toHaveBeenCalled();
    expect(task).toHaveBeenCalledTimes(1);
    expect(handle).toEqual({ kind: 'idle', id: 77 });
  });

  it('falls back to setTimeout when requestIdleCallback is unavailable', () => {
    const task = vi.fn();
    const setTimeoutImpl = vi.fn((callback) => {
      callback();
      return 31;
    });

    const handle = scheduleDeferredPostGameWork(task, {
      requestIdleCallbackImpl: null,
      setTimeoutImpl,
    });

    expect(setTimeoutImpl).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
    expect(handle).toEqual({ kind: 'timeout', id: 31 });
  });
});

describe('ResultScreen post-game processing state', () => {
  it('shows processing text and disables the hub button while post-game work is running', () => {
    const html = renderToStaticMarkup(
      React.createElement(ResultScreen, {
        gsResult,
        myTeam,
        oppTeam,
        gameDay: 12,
        onNext: () => {},
        nextLabel: 'ハブに戻る',
        isPostGameProcessing: true,
      })
    );

    expect(html).toContain('試合後処理中');
    expect(html).toContain('disabled=""');
  });

  it('enables the hub button after post-game work finishes', () => {
    const html = renderToStaticMarkup(
      React.createElement(ResultScreen, {
        gsResult,
        myTeam,
        oppTeam,
        gameDay: 12,
        onNext: () => {},
        nextLabel: 'ハブに戻る',
        isPostGameProcessing: false,
      })
    );

    expect(html).not.toContain('試合後処理中');
    expect(html).not.toContain('disabled=""');
  });
});
