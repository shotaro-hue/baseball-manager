import { it, expect } from 'vitest';
import { TEAM_DEFS } from '../../constants';
import { buildTeam } from '../../engine/player';
import { simulateSingleDay } from '../singleDayCore';
import { simulateSeasonBatch } from '../seasonBatchCore';
it.each(['single', 'batch'])('%s core returns its actual emitted archive run identity and totals', mode => {
  const teams = TEAM_DEFS.slice(0, 2).map(def => { const t = buildTeam(def); return { ...t, dhEnabled: true, rosterDhMode: true, lineup: t.lineupDh }; });
  const snapshot = { teams, saveId: 'source', myId: teams[0].id, year: 2026, gameDay: 1,
    schedule: [null, { matchups: [{ homeId: teams[0].id, awayId: teams[1].id }] }], gameResultsMap: {}, news: [], mailbox: [], seasonHistory: {}, allStarDone: true };
  const chunks = [], args = { snapshot, archiveRunId: 'explicit-run', onArchiveChunk: chunk => chunks.push(chunk) };
  const result = mode === 'batch' ? simulateSeasonBatch({ ...args, count: 1 }) : simulateSingleDay({ ...args,
    gameContext: { selectedOpponentId: teams[1].id, isHome: true, useDh: true } });
  expect(chunks.length).toBeGreaterThan(0);
  expect(result.archiveRun).toEqual({ version: 1, runId: 'explicit-run', chunkCount: chunks.length,
    recordCount: chunks.reduce((n, chunk) => n + chunk.records.length, 0), eventCount: chunks.reduce((n, chunk) => n + chunk.records.reduce((a, r) => a + r.events.length, 0), 0) });
  expect(chunks.every((chunk, index) => chunk.runId === 'explicit-run' && chunk.index === index)).toBe(true);
});
