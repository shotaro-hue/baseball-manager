import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { ContractTab } from '../tabs/ContractTab';
import { TradeTab } from '../tabs/TradeTab';
import HubScoutTab from './HubScoutTab';

const text = n => typeof n === 'string' ? n : (n?.children || []).map(text).join('');
const player = (id, extra = {}) => ({ id, name: `選手${id}`, pos: '外野', age: 26, salary: 1000,
  contractYearsLeft: 1, batting: { contact: 50, power: 60 }, personality: {}, stats: { AB: 10, H: 0, HR: 0 }, ...extra });
const mine = { id: 0, name: '自球団', budget: 10000, players: [player(0)], farm: [], wins: 0, losses: 0 };
const other = { ...mine, id: 1, name: '相手球団', players: [player(1)] };
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
function mount(Component, initial) {
  let props = initial;
  act(() => { view = create(React.createElement(Component, props)); });
  const button = label => view.root.findAllByType('button').find(n => n.props['aria-label'] === label || text(n) === label);
  const click = label => { const b = button(label); expect(b, label).toBeTruthy(); act(() => b.props.onClick()); };
  return { button, click, text: () => text(view.root), update: next => act(() => {
    props = { ...props, ...next }; view.update(React.createElement(Component, props));
  }) };
}

it('contract release requires confirmation, cancel is read-only, and stale confirmation cannot release a newly signed contract', () => {
  const onRelease = vi.fn(() => true);
  const ui = mount(ContractTab, { team: mine, allTeams: [mine], year: 2026, onRelease });
  ui.click('選手0の契約を確認'); ui.click('自由契約の影響を確認');
  expect(onRelease).not.toHaveBeenCalled(); expect(ui.text()).toContain('自由契約市場');
  ui.click('戻って見直す'); expect(onRelease).not.toHaveBeenCalled();
  ui.click('自由契約の影響を確認');
  ui.update({ team: { ...mine, players: [player(0, { contractSignedYear: 2026 })] } });
  const confirm = ui.button('自由契約を確定する');
  if (confirm && !confirm.props.disabled) act(() => confirm.props.onClick());
  expect(onRelease).not.toHaveBeenCalled();
});

it('contract offers confirm once, keep rejected submissions editable, and expose saved reply-waiting conditions after remount', () => {
  const onOffer = vi.fn(() => false);
  const ui = mount(ContractTab, { team: mine, allTeams: [mine], year: 2026, onOffer });
  ui.click('選手0の契約を確認'); ui.click('提示条件を確認する');
  expect(onOffer).not.toHaveBeenCalled(); ui.click('この条件で最終オファー');
  expect(onOffer).toHaveBeenCalledTimes(1); expect(ui.text()).not.toContain('最終オファーを送りました');
  onOffer.mockReturnValue(true);
  ui.click('提示条件を確認する');
  const submit = ui.button('この条件で最終オファー').props.onClick;
  act(() => { submit(); submit(); }); expect(onOffer).toHaveBeenCalledTimes(2);
  expect(onOffer.mock.calls[1].slice(0, 3)).toEqual([0, 1000, 1]);
  ui.update({ mailbox: [{ id: 'wait', type: 'contract_decision_pending', deliverOnDay: 4,
    decision: { playerId: 0, salary: 1200, years: 2, teamId: 0, offeredYear: 2026 } }] });
  expect(ui.text()).toContain('回答待ち'); expect(ui.text()).toContain('1,200万円');
  expect(ui.button('この条件で最終オファー')).toBeUndefined();
});
it.each(['rejected', 'signed'])('contract stops local reply-waiting when the real offer is resolved: %s', resolution => {
  const ui = mount(ContractTab, { team: mine, allTeams: [mine], year: 2026, onOffer: () => true });
  ui.click('選手0の契約を確認'); ui.click('提示条件を確認する'); ui.click('この条件で最終オファー');
  const decision = { playerId: 0, teamId: 0, offeredYear: 2026, salary: 1200, years: 2 };
  ui.update({ mailbox: [{ id: 'real', type: 'contract_decision_pending', decision }] });
  expect(view.root.findAll(n => n.props.role === 'status').some(n => text(n).includes('回答待ち'))).toBe(true);
  ui.update({ team: resolution === 'signed' ? { ...mine, players: [player(0, { contractSignedYear: 2026 })] } : mine,
    mailbox: [{ id: 'real', type: 'contract_reply', resolved: true, resolution, decision, body: resolution === 'signed' ? '契約受諾' : '契約辞退' }] });
  expect(view.root.findAll(n => n.props.role === 'status').some(n => text(n).includes('回答待ち'))).toBe(false);
  if (resolution === 'rejected') expect(ui.button('提示条件を確認する')).toBeTruthy();
});
it.each([ContractTab, HubScoutTab])('returning to a candidate list clears the previous detail rather than claiming the player departed', Component => {
  const props = Component === ContractTab ? { team: mine, allTeams: [mine], year: 2026 } : { myTeam: { ...mine, scoutResults: [player(0)] }, scoutRegions: [] };
  const ui = mount(Component, props);
  ui.click(Component === ContractTab ? '選手0の契約を確認' : '選手0の旧報告を見る'); ui.click('← 選手一覧に戻る');
  expect(ui.text()).not.toContain('この選手は現在所属していません'); expect(ui.text()).not.toContain('この候補は現在の報告一覧にいません');
  expect(view.root.findAllByType('h3').some(n => text(n) === '選手0')).toBe(false);
});
it.each([null, '200'])('an expiring player with unavailable salary can still be explicitly released: %s', salary => {
  const onRelease = vi.fn(() => true), team = { ...mine, players: [player(0, { salary })] };
  const ui = mount(ContractTab, { team, allTeams: [team], year: 2026, onRelease });
  ui.click('選手0の契約を確認'); expect(ui.button('提示条件を確認する')).toBeUndefined();
  ui.click('自由契約の影響を確認'); expect(onRelease).not.toHaveBeenCalled();
  ui.click('自由契約を確定する'); expect(onRelease).toHaveBeenCalledWith(0);
});

it('old scout records are readable without contract, dispatch or deletion actions', () => {
  const team = { ...mine, scoutResults: [player(8)], scoutMissions: [{ id: 'old', name: '関東', cost: 100 }] };
  const before = structuredClone(team);
  const ui = mount(HubScoutTab, { myTeam: team });
  ui.click('選手8の旧報告を見る');
  expect(ui.text()).toContain('機能終了により停止');
  expect(ui.text()).toContain('返金');
  expect(ui.button('契約条件を確認する')).toBeUndefined();
  expect(ui.button('候補から外す')).toBeUndefined();
  expect(ui.button('派遣先・調査中')).toBeUndefined();
  expect(ui.text()).not.toContain('年俸1年分');
  ui.click('← 選手一覧に戻る'); expect(team).toEqual(before);
});
it.each([{}, { scoutResults: [], scoutMissions: [] }])('old scout tab without records offers an exit and no old operations: %j', fields => {
  const onNavigate = vi.fn(), ui = mount(HubScoutTab, { myTeam: { ...mine, ...fields }, onNavigate });
  expect(ui.text()).toContain('終了');
  expect(ui.text()).toContain('旧スカウト記録はありません');
  ui.click('補強トップへ'); expect(onNavigate).toHaveBeenCalledWith('reinforcement');
});

it('trade proposal confirms player and cash effects without executing, and checks latest budgets before contacting the CPU', () => {
  const onTrade = vi.fn(() => true);
  const ui = mount(TradeTab, { myTeam: mine, teams: [mine, other], cpuOffers: [], onTrade });
  ui.click('相手球団と交渉する');
  ui.click('獲得候補を選ぶ');
  const incoming = view.root.findAllByType('input').find(n => n.props['aria-label'] === '選手1を獲得候補に選ぶ');
  act(() => incoming.props.onChange({ target: { checked: true } }));
  const cash = view.root.findAllByType('input').find(n => n.props['aria-label'] === '支払金額（万円）');
  act(() => cash.props.onChange({ target: { value: '500' } }));
  ui.click('トレードを提案する'); expect(onTrade).not.toHaveBeenCalled(); expect(ui.text()).toContain('9,500万円');
  const confirm = ui.button('確認して提案する').props.onClick;
  ui.update({ myTeam: { ...mine, budget: 0 }, teams: [{ ...mine, budget: 0 }, other] });
  act(() => confirm()); expect(onTrade).not.toHaveBeenCalled(); expect(ui.text()).toContain('予算が不足');
});

it('trade links select one mail by stable ID and a resolved proposal stays resolved after other mails move', () => {
  const mails = [{ id: 'a', title: '最初の案件', offer: { from: other, want: [player(0)], offer: [player(1)], cash: 5000000 } },
    { id: 'b', title: '選んだ案件', offer: { from: other, want: [player(0)], offer: [player(1)], cash: 0 } }];
  const accept = vi.fn(() => true);
  const ui = mount(TradeTab, { myTeam: mine, teams: [mine, other], cpuOffers: [], offerMails: mails,
    focusRequest: { id: 'b', token: 1 }, onAcceptOffer: accept });
  expect(ui.text()).toContain('選んだ案件'); ui.click('承諾内容を確認する');
  expect(accept).not.toHaveBeenCalled();
  ui.update({ offerMails: [mails[1]] });
  ui.click('承諾を確定する'); expect(accept.mock.calls).toEqual([[0]]);
  ui.update({ offerMails: [{ ...mails[1], resolved: true }] });
  expect(ui.text()).toContain('対応済み'); expect(ui.button('承諾内容を確認する')).toBeUndefined();
});
