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
  log: [{ batId: 'b1', batter: 'Slugger', scorer: true, result: 'hr', rbi: 2, pitcherId: 'p1', inning: 3, isTop: false }],
  inningSummary: [{ inning: 3, isTop: false, runs: 2 }],
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
  it('shows processing text and keeps the hub button enabled while details are loading', () => {
    const html = renderToStaticMarkup(
      React.createElement(ResultScreen, {
        gsResult,
        myTeam,
        oppTeam,
        gameDay: 12,
        onNext: () => {},
        nextLabel: 'ハブに戻る',
        isPostGameProcessing: true,
      }),
    );

    expect(html).toContain('試合詳細を整理中');
    expect(html).not.toContain('disabled=""');
  });

  it('hides the processing text after post-game work finishes', () => {
    const html = renderToStaticMarkup(
      React.createElement(ResultScreen, {
        gsResult,
        myTeam,
        oppTeam,
        gameDay: 12,
        onNext: () => {},
        nextLabel: 'ハブに戻る',
        isPostGameProcessing: false,
      }),
    );

    expect(html).not.toContain('試合詳細を整理中');
    expect(html).not.toContain('disabled=""');
  });

  it('shows a lightweight loading placeholder before deferred detail work completes', () => {
    const html = renderToStaticMarkup(
      React.createElement(ResultScreen, {
        gsResult,
        myTeam,
        oppTeam,
        gameDay: 12,
        onNext: () => {},
        nextLabel: 'ハブに戻る',
      }),
    );

    expect(html).toContain('打者成績を読み込み中');
  });
});
