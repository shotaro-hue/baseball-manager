import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { NewsTab } from './NewsTab';

const option = { text: '登録された回答', popMod: 5, moraleMod: 7 };
const news = (answered = false) => [{ id: 'one', type: 'interview', headline: '会見1', question: '今後の方針は？', options: [option], answered }, { id: 'two', type: 'game', headline: '試合結果' }];
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
function render(items, onInterview = vi.fn()) { act(() => { view = create(React.createElement(NewsTab, { news: items, onInterview })); }); }
function open(headline) { act(() => view.root.findAllByType('div').find(n => n.props.onClick && n.findAllByType('span').some(s => s.children.includes(headline))).props.onClick()); }
const text = () => JSON.stringify(view.toJSON());
it('uses persisted answered state on initial render and never guesses an unsaved answer', () => {
  render(news(true)); open('会見1');
  expect(text()).toContain('回答済み'); expect(text()).not.toContain('回答待ち'); expect(text()).not.toContain(option.text);
});
it('derives selected detail from refreshed news after answering or hydration', () => {
  const onInterview = vi.fn(); render(news(), onInterview); open('会見1');
  expect(text()).toContain(option.text);
  act(() => view.update(React.createElement(NewsTab, { news: news(true), onInterview })));
  expect(text()).toContain('回答済み'); expect(text()).not.toContain(option.text);
  open('試合結果'); open('会見1'); expect(text()).not.toContain(option.text);
});
it('does not locally declare success when the command was rejected', () => {
  const onInterview = vi.fn(() => false); render(news(), onInterview); open('会見1');
  const choice = view.root.findAllByType('div').find(n => n.props.onClick && n.findAllByType('div').some(d => d.children.includes(option.text)));
  act(() => choice.props.onClick());
  expect(onInterview).toHaveBeenCalledWith('one', option);
  expect(text()).toContain(option.text); expect(text()).not.toContain('回答済み');
});
it('closes details when the selected article no longer exists', () => {
  render(news()); open('会見1');
  act(() => view.update(React.createElement(NewsTab, { news: [] })));
  expect(text()).not.toContain('今後の方針は？'); expect(text()).not.toContain(option.text);
});
