import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatchResultScreen } from './BatchResult';

function buildResults(count) {
  return Array.from({ length: count }, (_, index) => ({
    won: index % 2 === 0,
    gameNo: index + 1,
    score: { my: 5 + index, opp: 3 },
    oppTeam: { short: `O${index + 1}`, name: `Opp ${index + 1}` },
    log: index === 0 ? [{ batter: 'Slugger', result: 'hr', isTop: false }] : [],
    inningSummary: [],
  }));
}

describe('BatchResultScreen', () => {
  it('shows only an initial chunk of games while batch details are still processing', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatchResultScreen, {
        results: buildResults(12),
        batchMeta: null,
        myTeam: { short: 'MY' },
        onEnd: () => {},
        onViewDetail: () => {},
        isBatchProcessing: true,
      }),
    );

    expect(html).toContain('O8');
    expect(html).not.toContain('O9');
    expect(html).toContain('結果を整理中');
    expect(html).not.toContain('disabled=""');
  });

  it('renders all games once the visible window is expanded', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatchResultScreen, {
        results: buildResults(12),
        batchMeta: null,
        myTeam: { short: 'MY' },
        onEnd: () => {},
        onViewDetail: () => {},
        isBatchProcessing: false,
        initialVisibleCount: 12,
      }),
    );

    expect(html).toContain('O12');
  });
});
