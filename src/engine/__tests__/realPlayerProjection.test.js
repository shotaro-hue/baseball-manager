import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareRealPlayer, inningsToOuts } from '../realPlayerProjection';
import { realBatterToPlayer, realPitcherToPlayer, buildRealTeam } from '../realplayer';
import { TEAM_DEFS } from '../../constants';

const batter = {name:'検証野手',age:23,pos:'遊撃手',salary:900,batHand:'switch',hand:'right',history:[{year:2025,AB:400,H:120,PA:450,BB:40,SO:70,HR:15,SB:10,'2B':20,'3B':3}]};
const pitcher = {name:'検証投手',age:25,pos:'中継ぎ',salary:1200,hand:'left',history:[{year:2025,G:25,GS:25,outs:451,SO:140,BB:30,H:120,ER:40}]};
afterEach(()=>vi.restoreAllMocks());
describe('pre-opening evidence projection', () => {
  it('retains runs, hits and walks allowed before the first recorded out',()=>{
    const empty=prepareRealPlayer({...pitcher,history:[]},'pitcher');
    const observed=prepareRealPlayer({...pitcher,history:[{year:2025,outs:0,ER:20,BB:10,H:10,SO:0}]},'pitcher');
    expect(observed.stats.ERA).toBe(8);
    expect(observed.stats.WHIP).toBeGreaterThan(empty.stats.WHIP);
    expect(observed.stats.BB).toBeGreaterThan(empty.stats.BB);
    expect(observed.history[0]).toMatchObject({outs:0,IP:0,ER:20,BB:10});
  });
  it('ignores current and future performance for abilities, role and career history', () => {
    const baseline=prepareRealPlayer(batter,'batter');
    const future=prepareRealPlayer({...batter,stats:{AVG:1,HR:100,SB:100,PA:100},history:[...batter.history,{year:2026,AB:100,H:100,HR:100,PA:100}]},'batter');
    expect(future.stats).toEqual(baseline.stats);
    expect(future.history).toEqual(batter.history);
    expect(prepareRealPlayer({...pitcher,stats:{G:25,GS:0,SV:20}},'pitcher').pos).toBe('先発');
  });
  it('shrinks small samples, preserves observed zero, and supplies explicitly synthetic priors without fake history', () => {
    const small=prepareRealPlayer({...batter,history:[{year:2025,AB:1,H:1,PA:1,BB:0,HR:1}]},'batter');
    const zero=prepareRealPlayer({...batter,history:[{year:2025,AB:400,H:0,PA:400,BB:0,HR:0}]},'batter');
    const unknown=prepareRealPlayer({...batter,history:[]},'batter');
    expect(small.stats.AVG).toBeLessThan(.26);
    expect(zero.stats.AVG).toBeLessThan(.1);
    expect(zero.stats.HR).toBeLessThan(unknown.stats.HR);
    expect(unknown.history).toEqual([]);
    expect(unknown.dataQuality.abilities).toBe('game-estimate-no-history');
  });
  it('combines split-year counts without treating the number of history rows as service years', () => {
    const split=prepareRealPlayer({...batter,history:[{year:2025,AB:100,H:20,PA:110,BB:10},{year:2025,AB:100,H:30,PA:110,BB:10}]},'batter');
    expect(split.stats.AVG).toBe(.25);
    expect(split.serviceYears).toBe(0);
    expect(split.daysOnActiveRoster).toBe(0);
    expect(split.dataQuality.serviceTime).toBe('game-baseline-unknown');
  });
  it('uses verified birth date, hands, salary units, positions and explicit service time', () => {
    vi.spyOn(Math,'random').mockReturnValue(.5);
    const p=realBatterToPlayer({...batter,birthDate:'2000-03-28',playerId:'npb:test',positions:{遊撃手:100,二塁手:85},daysOnActiveRoster:1000,serviceYears:8,entryType:'高卒',contractEndYear:2029},TEAM_DEFS[0]);
    expect(p).toMatchObject({age:25,realPlayerId:'npb:test',batHand:'switch',hand:'right',salary:900,daysOnActiveRoster:1000,serviceYears:8,entryType:'高卒',contractYearsLeft:4});
    expect(p.positions).toEqual({遊撃手:100,二塁手:85});
  });
  it('never turns an absent salary into 5,000,000万円; labels the game minimum', () => {
    const p=realBatterToPlayer({...batter,salary:undefined,history:[]},TEAM_DEFS[0]);
    expect(p.salary).toBe(420);
    expect(p.dataQuality.salary).toBe('game-assumption');
    const dev=realPitcherToPlayer({...pitcher,salary:null,isIkusei:true},TEAM_DEFS[0]);
    expect(dev.salary).toBe(240);
  });
  it('keeps exact thirds in the canonical source and decimal innings at the existing game boundary', () => {
    const p=realPitcherToPlayer(pitcher,TEAM_DEFS[0]);
    expect(p.careerLog[0].stats.IP).toBe(150+1/3);
    expect(p.subtype).toBe('先発');
    expect(prepareRealPlayer(pitcher,'pitcher').history[0].outs).toBe(451);
    expect(inningsToOuts('12.1','baseball')).toBe(37);
    expect(inningsToOuts('12 2/3','fraction')).toBe(38);
    expect(inningsToOuts(12+2/3,'decimal')).toBe(38);
    expect(()=>inningsToOuts('12.3','baseball')).toThrow();
    expect(()=>inningsToOuts(12.1,'decimal')).toThrow();
  });
  it('does not promote development input or use it to seed the active lineup', () => {
    const team=buildRealTeam(TEAM_DEFS[0],{batters:[batter,{...batter,name:'育成',isIkusei:true}],pitchers:[pitcher]});
    expect(team.players.some(p=>p.isIkusei||p.育成)).toBe(false);
    const dev=team.farm.find(p=>p.name==='育成');
    expect(dev?.isIkusei).toBe(true);
    expect(team.lineup).not.toContain(dev.id);
  });
  it('labels generic positions as estimates instead of asserting every infielder is a second baseman', () => {
    const p=prepareRealPlayer({...batter,pos:'内野手'},'batter');
    expect(p.pos).toBe('一塁手');
    expect(p.dataQuality.position).toBe('game-assumption');
    expect(p.sourcePosition).toBe('内野手');
  });
});
