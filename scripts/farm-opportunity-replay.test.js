import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { selectFarmTeam } from '../src/engine/farmSelection';
import { playFarmGame } from '../src/engine/farmGame';
import { createFarmRng } from '../src/engine/farmSchedule';
import { team, freeze } from '../src/engine/__tests__/farmFixtures';

it('gives the original nine-year-zero player repeated real appearances with his actual opening-roster competitors', () => {
  const fixture=JSON.parse(gunzipSync(readFileSync(process.env.FARM_REPLAY_FIXTURE||
    'docs/validation/roster-planning-65/farm-opportunities/original-roster.json.gz')));
  const homeTeam=freeze(fixture.team),awayTeam=freeze(team(99)),usage={};
  // Hold the real opening snapshot's abilities/condition fixed to isolate
  // selection; the ten-year real-hook run separately exercises daily lifecycle.
  for(let round=1;round<=143;round++){
    const home=selectFarmTeam(homeTeam,{round,usage}),away=selectFarmTeam(awayTeam,{round,usage});
    expect(home.status).toBe('ready');expect(new Set(home.lineup.map(x=>x.player.id)).size).toBe(9);
    const game=playFarmGame({home,away,rng:createFarmRng(['original-opportunity-replay',round])});
    for(const side of game.teams)for(const record of side.records){
      const u=usage[String(record.playerId)]??={battingGames:0,battingPA:0,pitchingBF:0};
      if(record.batting){u.battingGames+=record.batting.G;u.battingPA+=record.batting.PA;u.lastBattedRound=round;}
      if(record.pitching){u.pitchingBF+=record.pitching.BF;u.lastPitchedRound=round;}
    }
  }
  const actual=usage[fixture.target]||{battingGames:0,battingPA:0};
  console.info('original-roster-replay',JSON.stringify({id:fixture.target,...actual}));
  expect(actual.battingGames).toBeGreaterThanOrEqual(8);
  expect(actual.battingPA).toBeGreaterThanOrEqual(24);
});
