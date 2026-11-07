import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { MailboxTab } from './MailboxTab';

let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
it('never offers legacy posting approval or immediate income in annual mode', () => {
  act(() => { view = create(React.createElement(MailboxTab, { annualContracts: true,
    mailbox: [{ id: 'old', type: 'posting_request', title: '古い申請', body: '', read: true }], onRead: vi.fn(), onAction: vi.fn() })); });
  act(() => view.root.findAllByType('button').find(b => text(b).includes('古い申請')).props.onClick());
  expect(view.root.findAllByType('button').some(b => text(b) === '✅ 承認する')).toBe(false);
  expect(text(view.root)).not.toContain('承認すると選手はMLBへ移籍');
  expect(text(view.root)).toContain('旧方式');
});
