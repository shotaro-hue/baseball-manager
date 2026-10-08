import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import HubSimPanel from './HubSimPanel';
import HubHeader from './HubHeader';

it('has no positive option or enabled action at zero remaining', () => {
  const html=renderToStaticMarkup(React.createElement(HubSimPanel,{remain:0,canSim:false,gameDay:144}));
  expect(html).toContain('実行可能な試合なし');
  expect(html).not.toMatch(/option[^>]*value="[1-9]/);
  expect((html.match(/<button[^>]*disabled/g)||[]).length).toBe(3);
});
it('corrects an oversized selection to an available tail and blocks unloaded state', () => {
  const tail=renderToStaticMarkup(React.createElement(HubSimPanel,{remain:3,canSim:true,gameDay:141}));
  expect(tail).toMatch(/value="3" selected/);
  const unloaded=renderToStaticMarkup(React.createElement(HubSimPanel,{remain:3,canSim:false,gameDay:141}));
  expect((unloaded.match(/<button[^>]*disabled/g)||[]).length).toBe(3);
});
it('does not print NaN for invalid team counters or the round cursor', () => {
  const html=renderToStaticMarkup(React.createElement(HubHeader,{myTeam:{wins:NaN,losses:-1},gameDay:NaN,remain:0}));
  expect(html).not.toContain('NaN');
  expect(html).toContain('—勝');
});
