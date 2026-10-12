// Deterministic display fixture; actual progression/storage is tested in the App.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import { ResultScreen } from '../../../src/components/ResultScreen';

const query = new URLSearchParams(location.search), state = query.get('state') || 'win';
const isHome = query.get('home') !== 'false';
const names = ['高橋 玲', '小林 樹', '佐藤 海斗', '松本 翔', '西川 涼', '山口 隼人', '井上 蓮', '岡田 湊', '田中 悠真'];
const players = (base) => [...names.map((name, index) => ({ id: base + index, name: state === 'long' ? name + '・ロングネーム確認選手' : name,
  pos: '野手', stats: { AB: 20, H: index === 1 ? 0 : 5 } })),
  { id: base + 10, name: base === 10 ? '田中 悠真' : '山田 涼', isPitcher: true, stats: {} },
  { id: base + 11, name: base === 10 ? '鈴木 陸' : '相手救援', isPitcher: true, stats: {} }];
const myTeam = { id: 0, name: '東京ヤクルト', short: 'ヤクルト', league: 'セ', players: players(10), farm: [], wins: 33, losses: 30, draws: 10 };
const oppTeam = { id: 1, name: '阪神', short: '阪神', players: players(40), farm: [] };
const teams = [myTeam, oppTeam], log = [], inningSummary = [];
const myRuns = state === 'loss' ? 2 : state === 'draw' ? 2 : 5;
const oppRuns = state === 'loss' ? 5 : 2;
for (let inning = 1; inning <= 9; inning++) {
  for (const scorer of isHome ? [false, true] : [true, false]) {
    const team = scorer ? myTeam : oppTeam;
    const total = scorer ? myRuns : oppRuns;
    const rbi = inning === (scorer ? 4 : 3) ? Math.min(2, total) : inning === (scorer ? 7 : 6) ? Math.max(0, total - 2) : 0;
    for (let index = 0; index < 3; index++) {
      const batter = team.players[((inning - 1) * 3 + index) % 9];
      log.push({ inning, isTop: isHome ? !scorer : scorer, scorer, batId: batter.id, batter: batter.name,
        pitcherId: (scorer ? 40 : 10) + (inning <= 6 ? 10 : 11),
        result: index === 0 && rbi > 0 ? 'hr' : 'out', rbi: index === 0 ? rbi : 0, pitches: 4 });
    }
    inningSummary.push({ inning, isTop: isHome ? !scorer : scorer, runs: rbi });
  }
}
const result = state === 'missing' ? null : { score: { my: myRuns, opp: oppRuns }, isHome, gameNo: 73,
  log: state === 'empty' ? [] : log, inningSummary };
if (state === 'loading') window.requestIdleCallback = () => 1;
if (state === 'error') Object.defineProperty(log[0], 'scorer', { get() { throw new Error('display fixture aggregation failure'); } });
createRoot(document.getElementById('root')).render(<ResultScreen gsResult={result} myTeam={myTeam} oppTeam={oppTeam} teams={teams}
  gameDay={73} onNext={() => { document.body.dataset.returned = 'true'; }} />);
