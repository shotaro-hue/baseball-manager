import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { it, expect } from 'vitest';
import { simulateFarmRound, validateFarmGame } from '../farmGame';
import { createFarmSchedule } from '../farmSchedule';
import { team, teams, freeze } from './farmFixtures';

it('covers all 858 season cards with year-scoped workload and paired individual records', () => {
  const input=freeze(teams()),usage={};
  let played=0,pa=0,runs=0;
  for(let round=1;round<=143;round++) {
    const candidate=simulateFarmRound({teams:input,year:2026,round,saveId:'full-season',usage});
    for(const result of candidate.games) {
      expect(result.status).toBe('played'); expect(()=>validateFarmGame(result.game)).not.toThrow();
      played++;
      for(const t of result.game.teams) runs+=t.score;
      for(const load of result.game.workload) {
        const previous=usage[load.playerId]||{};
        usage[load.playerId]={...previous,
          ...(load.PA?{lastBattedRound:round}:{}),...(load.BF?{lastPitchedRound:round}:{}),
        };
        pa+=load.PA;
      }
    }
  }
  expect(played).toBe(858); expect(pa).toBeGreaterThan(858*54); expect(runs).toBeGreaterThan(0);
},20000);

it('runs the existing 24–32-player fixture without trimming; catcher deficiency remains explicit', () => {
  const fixture=JSON.parse(gunzipSync(readFileSync('e2e/fixtures/new-game.json.gz')).toString());
  const input=freeze(fixture.teams),usage={};
  let played=0,unplayed=0,pa=0,hits=0,runs=0,innings=0;
  const start=performance.now();
  for(let round=1;round<=143;round++) {
    const result=simulateFarmRound({teams:input,year:fixture.year,round,saveId:fixture.saveId,usage});
    for(const card of result.games) {
      if(card.status==='unplayed') {
        unplayed++;expect(card.reasons.some(r=>r.code==='insufficient-catcher'&&r.teamId===6)).toBe(true);continue;
      }
      played++;expect(()=>validateFarmGame(card.game)).not.toThrow();
      for(const t of card.game.teams) {
        runs+=t.score;innings+=t.outsMade/3;
        for(const r of t.records) {pa+=r.batting?.PA||0;hits+=r.batting?.H||0;}
      }
      for(const load of card.game.workload) usage[load.playerId]={
        ...(usage[load.playerId]||{}),...(load.PA?{lastBattedRound:round}:{}),...(load.BF?{lastPitchedRound:round}:{})
      };
    }
  }
  expect(played).toBe(715);expect(unplayed).toBe(143);
  expect(input.map(t=>t.farm.length)).toEqual([24,30,24,26,28,32,24,32,26,27,24,28]);
  console.info(JSON.stringify({farmFixtureMeasurement:true,played,unplayed,PA:pa,H:hits,runs,
    runsPerTeamGame:runs/(played*2),hitsPerPA:hits/pa,innings,elapsedMs:Math.round(performance.now()-start)}));
},20000);

it('uses stable string IDs including punctuation and does not read prototype keys as usage', () => {
  const input=teams();
  input.forEach((t,i)=>{t.id=`team:${i}`;t.farm.forEach((p,j)=>p.id=`${i}:player,${j}`);});
  input[0].farm[0].id='__proto__';
  const result=simulateFarmRound({teams:freeze(input),year:2026,round:1,saveId:'strings'});
  expect(result.games).toHaveLength(6);
  result.games.forEach(x=>expect(()=>validateFarmGame(x.game)).not.toThrow());
  expect(createFarmSchedule(input,2027)).toHaveLength(858);
});

it('leaves one team-game unplayed with pitcher or injury shortage without hiding processing exceptions', () => {
  const input=teams(); input[0]=team();input[0].farm.forEach(p=>{if(p.isPitcher)p.injuryDaysLeft=1;});
  const result=simulateFarmRound({teams:input,year:2026,round:143,saveId:'injury'});
  expect(result.games.filter(x=>x.status==='unplayed')).toHaveLength(1);
  expect(result.games.filter(x=>x.status==='played')).toHaveLength(5);
  expect(input[0].farm.filter(p=>p.isPitcher).every(p=>p.injuryDaysLeft===1)).toBe(true);
});
