import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import { BatchResultScreen } from '../../../src/components/BatchResult';
const state = new URLSearchParams(location.search).get('state') || 'normal';
const results = Array.from({ length: 12 }, (_, index) => ({ gameNo: index + 1,
  score: { my: index % 3 === 0 ? 0 : 4, opp: index % 3 === 2 ? 4 : 2 },
  won: index % 3 === 1, drew: index % 3 === 2,
  oppTeam: { short: state === 'long' ? '長い相手球団名・表示確認チーム' : '阪神' },
  log: [{ batter: '佐藤 海斗', scorer: true, result: index % 3 === 1 ? 'hr' : 'out' }],
}));
if (state === 'empty') results.length = 0;
if (state === 'missing') { delete results[0].score; results[0].won = false; results[0].log = undefined; }
if (state === 'loading') window.requestIdleCallback = () => 1;
if (state === 'error') {
  results[0].log[0].result = 'hr';
  Object.defineProperty(results[0].log[0], 'scorer', { get() { throw new Error('fixture aggregation error'); } });
}
// Match the real Worker output: summaries contain no logs; history owns them.
const gameResultsMap = Object.fromEntries(results.map(result => [result.gameNo, { log: result.log }]));
const summaries = results.map(({ log, ...summary }) => summary);
const saveState = state === 'saving' ? { isSaving: true } : {};
const saveResult = state === 'save-error' ? { ok: false } : state === 'saved' ? { ok: true } : null;
const action = (name, gameNo) => { document.body.dataset.action = name; if (gameNo) document.body.dataset.game = gameNo; };
createRoot(document.getElementById('root')).render(<BatchResultScreen results={summaries}
  getGameResult={result => gameResultsMap[result.gameNo]}
  myTeam={{ name: '東京ヤクルトスワローズ', players: [{ condition: 55 }, { injuryDaysLeft: 3 }] }}
  batchMeta={{ beforeRank: 3, afterRank: 2, injuries: [{ name: '高橋 玲', type: '肩の負傷', days: 3 }], cpuHighlights: [] }}
  saveDirty={state !== 'saved'} saveQueueState={saveState} saveResult={saveResult}
  canViewDetail={result => state !== 'no-detail' || result.gameNo !== 1}
  onEnd={() => action('home')} onReviewRoster={() => action('roster')}
  onViewDetail={result => action('detail', result.gameNo)} />);
