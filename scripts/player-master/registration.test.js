import { describe, it, expect } from 'vitest';
import { parseRegistrationPage, reconstructOpeningRoster } from './registration.mjs';

const row = (date, id, name = `選手${id}`, cls = '') => `<tr class="${cls}"><th>${date}</th><td>投　手</td><td>011</td><td><a href="/bis/players/${id}.html">${name}</a></td></tr>`;
const move = (date, id) => `<tr><td>▼</td><td>${date}</td><td>投手</td><td><a href="/bis/players/${id}.html">選手${id}</a></td></tr>`;
const page = (body, registration = 'controlled') => parseRegistrationPage(`<table>${body}</table>`, {teamId:0, registration, sourceUrl:'https://example.org/roster', season:2026});

describe('dated official registration reconstruction', () => {
  it('uses dates, not present-day struck-through rows, for transfers and retirements', () => {
    const parsed = page(row('1/23','101','甲','xxx') + row('1/23','102','乙','xxx') + row('4/6','103') + move('2026/7/30','101') + move('2026/3/16','102'));
    const result = reconstructOpeningRoster([parsed], '2026-03-27');
    expect(result.players.map(p=>p.playerId)).toEqual(['npb:101']);
    expect(result.players[0]).toMatchObject({registration:'controlled', kind:'pitcher', name:'甲', registeredOn:'2026-01-23'});
  });
  it('removes development status on the actual promotion day, retains post-opening promotions as development', () => {
    const dev = page(row('1/28','101')+row('1/28','102')+move('2026/3/24','101').replace('href="/', 'href="https://npb.jp/')+move('2026/4/6','102'), 'development');
    const main = page(row('3/24','101')+row('4/6','102'));
    expect(reconstructOpeningRoster([dev,main], '2026-03-27').players.map(p=>[p.playerId,p.registration])).toEqual([['npb:102','development'],['npb:101','controlled']]);
  });
  it('treats December registration as previous offseason and applies same-day removals', () => {
    const r = reconstructOpeningRoster([page(row('12/16','101')+row('3/27','102')+move('2026/3/27','102'))], '2026-03-27');
    expect(r.players).toHaveLength(1);
    expect(r.players[0].registeredOn).toBe('2025-12-16');
  });
  it('rejects a player registered twice across clubs instead of deduplicating silently', () => {
    const a = page(row('1/23','101'));
    expect(()=>reconstructOpeningRoster([a,{...a,teamId:1}], '2026-03-27')).toThrow(/duplicate/);
  });
  it('fails closed on changed markup, incomplete deletion dates and impossible dates', () => {
    expect(()=>page('<html>temporarily unavailable</html>')).toThrow(/registration/);
    expect(()=>page(row('2/30','101'))).toThrow(/date/);
    expect(()=>page(row('1/23','101')+move('未定','101'))).toThrow(/date/);
  });
});
