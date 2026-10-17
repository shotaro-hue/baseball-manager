import {expect,it} from 'vitest';
import {recordCareerExpectations,verifyCareerExpectations} from './roster-career-evidence';
const player={id:'continuing',stats:{PA:50}};
const team=(active,stats)=>({players:active?[{...player,stats}]:[],farm:active?[]:[{...player,stats}]});
it('distinguishes first-team history from a farm-only year and verifies both sides exactly',async()=>{
 const expected=new Map();
 recordCareerExpectations(expected,team(true,{PA:50}),2026);
 recordCareerExpectations(expected,team(false,{PA:0,BF:0,IP:0}),2027);
 recordCareerExpectations(expected,team(false,{PA:10}),2028);
 const load=async()=>[{year:2026,teamId:0},{year:2028,teamId:0}];
 const result=await verifyCareerExpectations(['continuing'],expected,load,2026,3);
 expect(result).toEqual([{id:'continuing',expectedYears:[2026,2028],recordedYears:[2026,2028]}]);
});
it('fails when a genuinely recorded season is missing instead of accepting a nine-row history',async()=>{
 const expected=new Map([['continuing',new Set([2026,2027,2028])]]);
 await expect(verifyCareerExpectations(['continuing'],expected,async()=>[{year:2026},{year:2028}],2026,3)).rejects.toThrow(/continuing/);
});
it('rejects fabricated zero-appearance farm history and duplicate career keys',async()=>{
 const expected=new Map([['continuing',new Set([2026])]]);
 await expect(verifyCareerExpectations(['continuing'],expected,async()=>[{year:2026},{year:2027}],2026,2)).rejects.toThrow(/continuing/);
 await expect(verifyCareerExpectations(['continuing'],expected,async()=>[{year:2026},{year:2026}],2026,2)).rejects.toThrow(/duplicate/);
});
it('retains the existing archive contract for active zero and demoted first-team pitchers',()=>{
 const expected=new Map();recordCareerExpectations(expected,team(true,{PA:0}),2026);
 recordCareerExpectations(expected,team(false,{BF:5,IP:1}),2027);
 expect([...expected.get('continuing')]).toEqual([2026,2027]);
});
