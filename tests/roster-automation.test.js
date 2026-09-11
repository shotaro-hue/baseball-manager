import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';

import {
  applyEmergencyRosterMaintenance,
  applyManagementPolicy,
  buildFullRosterPlan,
  prepareTeamForGame,
  ROSTER_AUTOMATION_MODES,
  RosterValidationError,
  validateLineup,
  validateTeamRoster,
} from '../src/engine/rosterAutomation.js';

test('scheduled lineup refresh preserves a playable emergency fielding fallback', () => {
  const source = makeTeam();
  source.farm = [];
  source.players = source.players.map(player => player.isPitcher ? player : {
    ...player, pos: '捕手', positions: { '捕手': 100 },
  });
  const plan = buildFullRosterPlan(source);
  assert.equal(plan.validation.valid, true, plan.validation.errors.join(' / '));
  const refreshed = applyManagementPolicy(plan.team, {
    gameDay: 100,
    includeRosterChanges: false,
    automationMode: ROSTER_AUTOMATION_MODES.FULL,
  });
  const validation = validateTeamRoster(refreshed);
  assert.equal(validation.valid, true, validation.errors.join(' / '));
});

const POSITIONS = ['捕手', '一塁手', '二塁手', '三塁手', '遊撃手', '左翼手', '中堅手', '右翼手'];

function emptyStats() {
  return {
    PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, BB: 0, HBP: 0, SF: 0, K: 0,
    IP: 0, ER: 0, BBp: 0, HBPp: 0, BF: 0, Kp: 0, HRp: 0, Hp: 0,
  };
}

function batter(id, pos, ability = 70) {
  return {
    id,
    name: id,
    pos,
    positions: { [pos]: 100 },
    isPitcher: false,
    育成: false,
    injuryDaysLeft: 0,
    registrationCooldownDays: 0,
    batting: {
      contact: ability,
      power: ability,
      eye: ability,
      speed: ability,
      defense: ability,
      arm: ability,
    },
    stats: emptyStats(),
    condition: 100,
    form: 50,
    potential: ability,
  };
}

function pitcher(id, subtype = '先発', ability = 70) {
  return {
    id,
    name: id,
    pos: '投手',
    isPitcher: true,
    subtype,
    育成: false,
    injuryDaysLeft: 0,
    registrationCooldownDays: 0,
    pitching: {
      velocity: ability,
      control: ability,
      breaking: ability,
      stamina: subtype === '先発' ? ability : 50,
    },
    stats: emptyStats(),
    condition: 100,
    form: 50,
    potential: ability,
  };
}

function makeTeam() {
  const starters = POSITIONS.map((pos, index) => batter(`starter-${index}`, pos, 75));
  const bench = Array.from({ length: 7 }, (_, index) =>
    batter(`bench-${index}`, POSITIONS[index % POSITIONS.length], 65));
  const pitchers = [
    ...Array.from({ length: 6 }, (_, index) => pitcher(`sp-${index}`, '先発', 72)),
    ...Array.from({ length: 7 }, (_, index) => pitcher(`rp-${index}`, '中継ぎ', 68)),
  ];
  const farm = [
    ...POSITIONS.map((pos, index) => batter(`farm-b-${index}`, pos, 45)),
    ...Array.from({ length: 4 }, (_, index) => pitcher(`farm-p-${index}`, index < 2 ? '先発' : '中継ぎ', 45)),
  ];
  return {
    id: 0,
    name: 'テスト球団',
    league: 'セ',
    dhEnabled: false,
    rosterDhMode: false,
    rosterAutomationMode: ROSTER_AUTOMATION_MODES.EMERGENCY,
    players: [...starters, ...bench, ...pitchers],
    farm,
    lineup: starters.map((player) => player.id),
    lineupNoDh: starters.map((player) => player.id),
    lineupDh: [...starters.map((player) => player.id), bench[0].id],
    rotation: pitchers.slice(0, 6).map((player) => player.id),
    pitchingPattern: {},
    rotIdx: 0,
  };
}

test('full planner creates valid DH/no-DH lineups without rewriting primary positions', () => {
  const source = makeTeam();
  const primaryPositions = Object.fromEntries(source.players.map((player) => [player.id, player.pos]));
  const plan = buildFullRosterPlan(source);

  assert.equal(plan.validation.valid, true, plan.validation.errors.join(' / '));
  assert.equal(plan.team.lineupNoDh.length, 8);
  assert.equal(plan.team.lineupDh.length, 9);
  assert.equal(plan.team.rotation.length, 6);
  for (const player of plan.team.players) {
    assert.equal(player.pos, primaryPositions[player.id]);
  }
  assert.equal(Object.keys(plan.team.fieldingNoDh).length, 8);
  assert.equal(Object.keys(plan.team.fieldingDh).length, 9);
});

test('emergency mode demotes a long-term injury and fills only the vacant role', () => {
  const planned = buildFullRosterPlan(makeTeam()).team;
  const injuredId = planned.players.find((player) => player.pos === '遊撃手' && !player.isPitcher).id;
  const originalNoDh = [...planned.lineupNoDh];
  const injuredIndex = originalNoDh.indexOf(injuredId);
  const injuredTeam = {
    ...planned,
    rosterAutomationMode: ROSTER_AUTOMATION_MODES.EMERGENCY,
    players: planned.players.map((player) =>
      player.id === injuredId
        ? { ...player, injury: '肉離れ', injuryDaysLeft: 30 }
        : player),
  };

  const maintained = applyEmergencyRosterMaintenance(injuredTeam);
  const change = maintained.rosterMaintenance.changes[0];

  assert.equal(maintained.rosterMaintenance.changed, true);
  assert.equal(change.downPlayer.id, injuredId);
  assert.ok(change.upPlayer);
  assert.equal(change.upPlayer.pos, '遊撃手');
  assert.equal(maintained.players.some((player) => player.id === injuredId), false);
  assert.equal(
    maintained.farm.find((player) => player.id === injuredId).registrationCooldownDays,
    10,
  );
  assert.equal(maintained.lineupNoDh[injuredIndex], change.upPlayer.id);
  assert.deepEqual(
    maintained.lineupNoDh.filter((_, index) => index !== injuredIndex),
    originalNoDh.filter((_, index) => index !== injuredIndex),
  );
  assert.equal(validateTeamRoster(maintained).valid, true);
});

test('manual mode never performs injury demotion or replacement', () => {
  const planned = buildFullRosterPlan(makeTeam()).team;
  const injuredId = planned.lineupNoDh[0];
  const manualTeam = {
    ...planned,
    rosterAutomationMode: ROSTER_AUTOMATION_MODES.MANUAL,
    players: planned.players.map((player) =>
      player.id === injuredId ? { ...player, injuryDaysLeft: 30 } : player),
  };
  const maintained = applyEmergencyRosterMaintenance(manualTeam);

  assert.equal(maintained.rosterMaintenance.changed, false);
  assert.equal(maintained.rosterMaintenance.reason, 'manual-mode');
  assert.equal(maintained.players.some((player) => player.id === injuredId), true);
});

test('game preparation rejects an incomplete lineup instead of silently filling it', () => {
  const planned = buildFullRosterPlan(makeTeam()).team;
  const broken = {
    ...planned,
    lineupNoDh: planned.lineupNoDh.slice(0, 4),
  };

  assert.throws(
    () => prepareTeamForGame(broken, false),
    (error) =>
      error instanceof RosterValidationError
      && error.validation.errors.some((message) => message.includes('8人必要')),
  );
});

test('game preparation appends the scheduled starter only in no-DH games', () => {
  const planned = buildFullRosterPlan(makeTeam()).team;
  const starterId = planned.rotation[planned.rotIdx];
  const noDh = prepareTeamForGame(planned, false);
  const dh = prepareTeamForGame({ ...planned, rosterDhMode: true, dhEnabled: true }, true);

  assert.equal(noDh.lineup.length, 9);
  assert.equal(noDh.lineup[8], starterId);
  assert.equal(dh.lineup.length, 9);
  assert.equal(dh.lineup.some((id) => planned.players.find((player) => player.id === id)?.isPitcher), false);
});

test('lineup validation uses assigned fielding positions instead of primary positions', async () => {
  const planned = buildFullRosterPlan(makeTeam()).team;
  const rightFielderId = planned.lineupNoDh.find(
    (id) => planned.fieldingNoDh[id] === '右翼手',
  );
  const reassigned = {
    ...planned,
    players: planned.players.map((player) =>
      player.id === rightFielderId
        ? {
            ...player,
            pos: '左翼手',
            positions: { ...player.positions, 左翼手: 100, 右翼手: 80 },
          }
        : player),
  };

  assert.equal(validateLineup(reassigned, false).errors.length, 0);

  const hubSource = await readFile(
    new URL('../src/components/hub/HubShell.jsx', import.meta.url),
    'utf8',
  );
  assert.match(hubSource, /validateLineup\(myTeam, rosterDhMode\)/);
  assert.doesNotMatch(hubSource, /posCount\[player\.pos\]/);
});

test('legacy hidden lineup repair and four-player guards are removed from every game path', async () => {
  const paths = [
    '../src/hooks/useGameState.js',
    '../src/hooks/useSeasonFlow.js',
    '../src/workers/seasonBatchCore.js',
    '../src/workers/singleDayCore.js',
  ];
  const sources = await Promise.all(
    paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
  );

  for (const source of sources) {
    assert.doesNotMatch(source, /function\s+buildSimLineup/);
    assert.doesNotMatch(source, /function\s+autoInjuryDemote/);
    assert.doesNotMatch(source, /最低4人必要/);
  }
});
