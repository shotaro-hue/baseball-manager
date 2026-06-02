/* @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { TacticalGameScreen } from './TacticalGame';

vi.mock('../engine/simulation', () => ({
  initGameState: () => ({
    gameOver: true,
    stopped: true,
    score: { my: 1, opp: 0 },
    myLineup: [],
    opLineup: [],
    bases: [null, null, null],
    inningSummary: [],
    log: [
      { text: '単打', ev: 151.2, result: '1b' },
      { text: '凡打', ev: 120.1, la: 12, result: 'out' },
    ],
    liveStats: { batting: new Map(), pitching: new Map() },
  }),
  matchupScore: () => 0,
  calcEffectiveFatigue: () => 0,
  processAtBat: (prev) => prev,
  endHalfInning: (prev) => prev,
  checkStopCondition: () => null,
  STADIUMS: { tokyo_dome: {} },
  TEAM_STADIUM: { my: 'tokyo_dome' },
}));

describe('TacticalGameScreen', () => {
  const myTeam = { id: 'my', name: 'My', short: 'MY', color: '#fff', emoji: 'M' };
  const oppTeam = { id: 'opp', name: 'Opp', short: 'OP', color: '#fff', emoji: 'O' };

  it('onGameEnd が reject しても警告を画面に表示する', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TacticalGameScreen myTeam={myTeam} oppTeam={oppTeam} onGameEnd={() => Promise.reject(new Error('fail'))} />);
    });

    const button = container.querySelector('button.btn-gold');
    expect(button).toBeTruthy();
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('試合終了処理に失敗しました');
    root.unmount();
  });

  it('ev があっても la がないログでは 3D再生ボタンを表示しない', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TacticalGameScreen myTeam={myTeam} oppTeam={oppTeam} onGameEnd={() => Promise.resolve()} />);
    });

    const replayButtons = Array.from(container.querySelectorAll('button')).filter((el) => el.textContent === '3D再生');
    expect(replayButtons.length).toBe(0);
    root.unmount();
  });

  it('myTeam / oppTeam が不足していても試合終了画面がクラッシュしない', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TacticalGameScreen myTeam={null} oppTeam={undefined} onGameEnd={() => Promise.resolve()} />);
    });

    expect(container.textContent).toContain('対戦相手');
    expect(container.textContent).toContain('MY');
    expect(container.textContent).toContain('OPP');
    root.unmount();
  });
});
