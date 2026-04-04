import { schedule2025 } from '../src/data/schedule2025.js';
import { TEAM_DEFS } from '../src/constants.js';

const days = schedule2025.slice(1);
const teamIds = TEAM_DEFS.map((t) => t.id);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function keyOfPair(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function validateDailySingleGame() {
  for (const day of days) {
    assert(day.matchups.length === 6, `gameNo ${day.gameNo}: matchups must be 6`);
    const seen = new Map();
    for (const matchup of day.matchups) {
      seen.set(matchup.homeId, (seen.get(matchup.homeId) || 0) + 1);
      seen.set(matchup.awayId, (seen.get(matchup.awayId) || 0) + 1);
    }

    assert(seen.size === 12, `gameNo ${day.gameNo}: all 12 teams must appear`);
    for (const teamId of teamIds) {
      assert(seen.get(teamId) === 1, `gameNo ${day.gameNo}: team ${teamId} must play exactly once`);
    }
  }
}

function validateGamesPerTeam() {
  const countByTeam = new Map(teamIds.map((id) => [id, 0]));
  for (const day of days) {
    for (const matchup of day.matchups) {
      countByTeam.set(matchup.homeId, countByTeam.get(matchup.homeId) + 1);
      countByTeam.set(matchup.awayId, countByTeam.get(matchup.awayId) + 1);
    }
  }

  for (const teamId of teamIds) {
    assert(countByTeam.get(teamId) === 143, `team ${teamId} should have 143 games`);
  }
}

function validateInterleagueCount() {
  const teamLeague = new Map(TEAM_DEFS.map((t) => [t.id, t.league]));
  const ilCount = new Map(teamIds.map((id) => [id, 0]));

  for (const day of days) {
    for (const matchup of day.matchups) {
      const isInterleague = teamLeague.get(matchup.homeId) !== teamLeague.get(matchup.awayId);
      if (isInterleague) {
        ilCount.set(matchup.homeId, ilCount.get(matchup.homeId) + 1);
        ilCount.set(matchup.awayId, ilCount.get(matchup.awayId) + 1);
      }
    }
  }

  for (const teamId of teamIds) {
    assert(ilCount.get(teamId) === 18, `team ${teamId} should have 18 interleague games`);
  }
}

function validateStrictThreeGameSeries() {
  const gamesByPair = new Map();

  for (const day of days) {
    for (const matchup of day.matchups) {
      const pairKey = keyOfPair(matchup.homeId, matchup.awayId);
      if (!gamesByPair.has(pairKey)) gamesByPair.set(pairKey, []);
      gamesByPair.get(pairKey).push(day.gameNo);
    }
  }

  for (const [pairKey, gameNos] of gamesByPair.entries()) {
    gameNos.sort((a, b) => a - b);
    let block = [gameNos[0]];

    for (let i = 1; i < gameNos.length; i++) {
      if (gameNos[i] === gameNos[i - 1] + 1) {
        block.push(gameNos[i]);
      } else {
        const isSeasonEndTwoGameBlock = block.length === 2 && block[0] === 142 && block[1] === 143;
        assert((block.length % 3 === 0) || isSeasonEndTwoGameBlock, `pair ${pairKey} has non-3-game block: ${block.join(',')}`);
        block = [gameNos[i]];
      }
    }

    const isSeasonEndTwoGameBlock = block.length === 2 && block[0] === 142 && block[1] === 143;
    assert((block.length % 3 === 0) || isSeasonEndTwoGameBlock, `pair ${pairKey} has non-3-game block: ${block.join(',')}`);
  }
}

try {
  assert(days.length === 143, `schedule day count must be 143 (actual: ${days.length})`);
  validateDailySingleGame();
  validateGamesPerTeam();
  validateInterleagueCount();
  validateStrictThreeGameSeries();
  console.log('validateSchedule2025: OK');
} catch (error) {
  console.error(`validateSchedule2025: NG - ${error.message}`);
  process.exit(1);
}
