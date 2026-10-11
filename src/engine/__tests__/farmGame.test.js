import { describe, it, expect, vi } from 'vitest';
import { advanceFarmBases, farmOutcomeProbabilities, playFarmGame, simulateFarmRound, validateFarmGame } from '../farmGame';
import { selectFarmTeam } from '../farmSelection';
import { team, teams, freeze } from './farmFixtures';
const selections = () => ({ home: selectFarmTeam(team(0), { round: 1 }), away: selectFarmTeam(team(1), { round: 1 }) });
// Base-model outcomes: .01 BB, .1 K, .30 HR, .34 double, .4 single, .9 OUT.
const scripted = values => { let index = 0; return () => values[index++] ?? .9; };
const record = (side, id) => side.records.find(r => r.playerId === id);

describe('farm plate appearance', () => {
  it('forces only occupied runners on walks and preserves responsibility through relief', () => {
    const old = { playerId: 'runner', responsiblePitcherId: 'old' };
    const x = advanceFarmBases({ bases: [old,null,null], outcome: 'BB', batterId: 0, pitcherId: 'new' });
    expect(x.bases).toEqual([{ playerId: 0, responsiblePitcherId: 'new' }, old, null]);
    const hr = advanceFarmBases({ bases: x.bases, outcome: 'HR', batterId: 'hitter', pitcherId: 'new' });
    expect(hr.scorers.map(r => r.responsiblePitcherId)).toEqual(['old','new','new']);
    expect(hr.rbi).toBe(3);
    expect(hr.bases).toEqual([null,null,null]);
  });
  it('counts all HR runs but caps a non-HR walkoff and credits only needed hit bases', () => {
    const bases = [{ playerId: 'a', responsiblePitcherId: 'p' }, null, { playerId:'c', responsiblePitcherId:'p' }];
    const hr = advanceFarmBases({ bases, outcome: 'HR', batterId:'b', pitcherId:'p', runLimit:1 });
    expect(hr.rbi).toBe(3);
    const double = advanceFarmBases({ bases, outcome: 'D', batterId:'b', pitcherId:'p', runLimit:1 });
    expect(double.rbi).toBe(1); expect(double.outcome).toBe('S');
  });
  it('uses bounded probabilities at ability extremes, responds to fatigue/defense and rejects invalid RNG', () => {
    const s = selections(), b = s.home.lineup[0].player, p = s.away.pitchers[0].player;
    const normal = farmOutcomeProbabilities(b,p,{ defensePenalty:0, pitcherBF:0 });
    const tired = farmOutcomeProbabilities(b,{...p,condition:10},{ defensePenalty:1, pitcherBF:100 });
    expect(Object.values(normal).reduce((a,b)=>a+b,0)).toBeCloseTo(1);
    expect(tired.S).toBeGreaterThan(normal.S);
    for (const ability of [0,100]) {
      const probs = farmOutcomeProbabilities({ ...b, batting:{contact:ability,power:ability,eye:ability} },
        { ...p, pitching:{velocity:100-ability,control:100-ability,breaking:100-ability} }, {defensePenalty:1,pitcherBF:1000});
      expect(Object.values(probs).every(x=>x>=0 && x<=1)).toBe(true);
      expect(Object.values(probs).reduce((a,b)=>a+b,0)).toBeCloseTo(1);
    }
    for (const value of [NaN, Infinity, -0.1, 1]) expect(()=>playFarmGame({...s,rng:()=>value})).toThrow(/rng/);
  });
});

describe('farm game rules and scoring', () => {
  it('ends a nine inning tie with 27 outs each, nine starters and no W/L', () => {
    const g = playFarmGame({...freeze(selections()),rng:()=>.9});
    expect(g.teams.map(t=>t.score)).toEqual([0,0]);
    expect(g.events).toHaveLength(54);
    expect(g.teams.map(t=>t.outsMade)).toEqual([27,27]);
    for (const t of g.teams) {
      expect(t.records.filter(r=>r.batting?.GS===1)).toHaveLength(9);
      expect(t.records.filter(r=>r.pitching?.GS===1)).toHaveLength(1);
      expect(t.records.reduce((n,r)=>n+(r.pitching?.W||0)+(r.pitching?.L||0),0)).toBe(0);
      expect(t.records.find(r=>r.pitching?.GS===1).pitching.QS).toBe(1);
    }
    expect(g.model.unsupported).toContain('SV');
    expect(g.model.modeledZero).toContain('SF');
    expect(()=>validateFarmGame(g)).not.toThrow();
  });
  it('omits bottom nine when the home team leads and awards qualified starter W', () => {
    const g = playFarmGame({...selections(),rng:scripted([.9,.9,.9,.30])});
    expect(g.teams.map(t=>t.score)).toEqual([1,0]);
    expect(g.events).toHaveLength(52);
    expect(g.teams[0].innings[8]).toBeNull();
    expect(g.teams[0].records.find(r=>r.pitching?.GS===1).pitching.W).toBe(1);
    expect(()=>validateFarmGame(g)).not.toThrow();
  });
  it('walkoff HR counts all runners, and a zero-out reliever records G/BF/L', () => {
    const s=selections(); s.away.pitchers=s.away.pitchers.slice(0,2); s.away.pitchers[0].maxOuts=24;
    const g = playFarmGame({...s,rng:scripted([...Array(51).fill(.9),.01,.01,.30])});
    expect(g.teams.map(t=>t.score)).toEqual([3,0]);
    expect(g.teams[0].outsMade).toBe(24);
    const reliever=record(g.teams[1],s.away.pitchers[1].player.id).pitching;
    expect(reliever.outs).toBe(0); expect(reliever.G).toBe(1); expect(reliever.BF).toBe(3); expect(reliever.L).toBe(1);
    expect(g.teams[0].records.reduce((n,r)=>n+(r.batting?.RBI||0),0)).toBe(3);
    expect(()=>validateFarmGame(g)).not.toThrow();
  });
  it('charges inherited runner and decisive loss to the old pitcher; ineligible starter win goes to relief', () => {
    const s=selections(); s.away.pitchers[0].maxBF=1;
    s.home.pitchers[0].maxOuts=12;
    const g=playFarmGame({...s,rng:scripted([.9,.9,.9,.01,.30])});
    const old=record(g.teams[1],s.away.pitchers[0].player.id).pitching;
    expect(old.outs).toBe(0); expect(old.ER).toBe(1); expect(old.L).toBe(1);
    expect(record(g.teams[1],s.away.pitchers[1].player.id).pitching.ER).toBe(1);
    expect(record(g.teams[0],s.home.pitchers[0].player.id).pitching.W).toBe(0);
    expect(record(g.teams[0],s.home.pitchers[1].player.id).pitching.W).toBe(1);
    expect(()=>validateFarmGame(g)).not.toThrow();
  });
  it('warns on actual sole pitcher overload and treats runaway simulation as error', () => {
    const s=selections(); s.home.pitchers=s.home.pitchers.slice(0,1);
    const g=playFarmGame({...s,rng:()=>.9});
    expect(g.warnings.some(x=>x.code==='pitcher-overload')).toBe(true);
    expect(()=>playFarmGame({...s,rng:()=>.01})).toThrow(/plate appearance limit/);
  });
  it('rejects incomplete, corrupt and mismatched stats including nonfinite counters', () => {
    const g=playFarmGame({...selections(),rng:()=>.9});
    expect(()=>validateFarmGame(g)).not.toThrow();
    const bad=structuredClone(g); bad.teams[0].records[0].batting.H=1;
    expect(()=>validateFarmGame(bad)).toThrow();
    const inf=structuredClone(g); inf.teams[0].records[0].batting.AB=Infinity;
    expect(()=>validateFarmGame(inf)).toThrow();
    const missing=structuredClone(g); delete missing.teams[0].records[0].batting.BB;
    expect(()=>validateFarmGame(missing)).toThrow();
  });
});

describe('farm round isolation', () => {
  it('repeats identical results without mutating any snapshot or consuming main random', () => {
    const input=freeze({teams:teams(),year:2026,round:1,saveId:'save'});
    const random=vi.spyOn(Math,'random').mockImplementation(()=>{throw Error('main RNG');});
    try {
      const a=simulateFarmRound(input), b=simulateFarmRound(input);
      expect(a.games).toHaveLength(6); expect(a).toEqual(b);
      expect(simulateFarmRound({...input,teams:[...input.teams].reverse()})).toEqual(a);
      expect(random).not.toHaveBeenCalled();
      a.games.forEach(x=>expect(()=>validateFarmGame(x.game)).not.toThrow());
    } finally {random.mockRestore();}
  });
  it('skips both teams of a deficient card, preserving RNG/results for other cards', () => {
    const input={teams:teams(),year:2026,round:1,saveId:'save'};
    const a=simulateFarmRound(input); input.teams[0].farm=input.teams[0].farm.filter(p=>p.pos!=='捕手');
    const b=simulateFarmRound(input);
    const skipped=b.games.find(x=>x.card.homeId===0||x.card.awayId===0);
    expect(skipped.status).toBe('unplayed'); expect(skipped.reasons[0].teamId).toBe(0);
    b.games.filter(x=>x.status==='played').forEach(x=>expect(x).toEqual(a.games.find(y=>y.card.id===x.card.id)));
    input.teams[1].farm[0].id=input.teams[2].farm[0].id;
    expect(()=>simulateFarmRound(input)).toThrow(/duplicate/);
  });
});

it('validates each player against events, not just paired team totals', () => {
  const g=playFarmGame({...selections(),rng:()=>.9});
  const bad=structuredClone(g), batters=bad.teams[0].records.filter(r=>r.batting);
  batters[0].batting.PA--;batters[0].batting.AB--;
  batters[1].batting.PA++;batters[1].batting.AB++;
  expect(()=>validateFarmGame(bad)).toThrow();
  const ghost=structuredClone(g); ghost.events[0].batterId='absent';
  expect(()=>validateFarmGame(ghost)).toThrow();
});

it('rejects W moved to an ineligible starter or L away from decisive runner responsibility', () => {
  const s=selections();s.away.pitchers[0].maxBF=1;s.home.pitchers[0].maxOuts=12;
  const g=playFarmGame({...s,rng:scripted([.9,.9,.9,.01,.30])});
  const badW=structuredClone(g), home=badW.teams[0];
  home.records.find(r=>r.pitching?.W===1).pitching.W=0;
  home.records.find(r=>r.pitching?.GS===1).pitching.W=1;
  expect(()=>validateFarmGame(badW)).toThrow();
});

it('rejects L moved away from the decisive runner responsible pitcher', () => {
  const s=selections();s.away.pitchers[0].maxBF=1;s.home.pitchers[0].maxOuts=12;
  const g=playFarmGame({...s,rng:scripted([.9,.9,.9,.01,.30])});
  const badL=structuredClone(g), away=badL.teams[1];
  away.records.find(r=>r.pitching?.L===1).pitching.L=0;
  away.records.find(r=>r.pitching&&!r.pitching.GS).pitching.L=1;
  expect(()=>validateFarmGame(badL)).toThrow();
});

it.each(['runs','null'])('rejects an inning line inconsistent with events: %s', (kind) => {
  const g=kind==='runs'
    ? playFarmGame({...selections(),rng:scripted([...Array(36).fill(.01)])})
    : playFarmGame({...selections(),rng:scripted([.9,.9,.9,.30])});
  const bad=structuredClone(g);
  if(kind==='runs') {bad.teams[1].innings[0]--;bad.teams[1].innings[1]++;}
  else {bad.teams[0].innings[8]=bad.teams[0].innings[0];bad.teams[0].innings[0]=null;}
  expect(()=>validateFarmGame(bad)).toThrow();
});

it.each(['OUT','BB','HR'])('already rejects coherent extra %s after a walkoff', outcome => {
  const g=playFarmGame({...selections(),rng:scripted([...Array(51).fill(.9),.30])});
  const previous=g.events.at(-1),batterId=g.teams[0].records.find(r=>r.batting&&r.playerId!==previous.batterId).playerId;
  const advance=advanceFarmBases({bases:previous.runnersAfter,outcome,batterId,pitcherId:previous.pitcherId});
  const event={...previous,batterId,outcome,runnersBefore:previous.runnersAfter,runnersAfter:advance.bases,
    scorers:advance.scorers,rbi:advance.rbi,outsAdded:advance.outsAdded};
  const bat=g.teams[0].records.find(r=>r.playerId===batterId).batting;
  const pitch=g.teams[1].records.find(r=>r.playerId===previous.pitcherId).pitching;
  bat.PA++;pitch.BF++;g.teams[0].outsMade+=advance.outsAdded;pitch.outs+=advance.outsAdded;
  if(outcome==='BB'){bat.BB++;pitch.BBp++;}
  else {bat.AB++;if(outcome==='HR') {
    bat.H++;bat.HR++;bat.R++;bat.RBI++;pitch.Hp++;pitch.HRp++;pitch.ER++;pitch.Rallowed++;
    g.teams[0].score++;g.teams[0].innings[8]++;
  }}
  g.events.push(event);
  expect(()=>validateFarmGame(g)).toThrow();
});
