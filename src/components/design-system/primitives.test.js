import React from 'react';
import { create, act } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { Button, StateLabel, MetricBand, Section, DataTableFrame } from './primitives';
const el = React.createElement;
const render = (Component, props, children) => renderToStaticMarkup(el(Component, props, children));
describe('DES-01 reusable primitives', () => {
  it('delegates enabled button operations and preserves native disabled state and existing classes', () => {
    const click = vi.fn();
    let view;
    act(() => { view = create(el(Button, { onClick: click, className: 'calm-primary', disabled: false }, '進む')); });
    const button = view.root.findByType('button');
    expect(button.props.type).toBe('button');
    expect(button.props.className).toBe('calm-primary');
    expect(button.props['data-ds']).toBe('button');
    act(() => button.props.onClick());
    expect(click).toHaveBeenCalledOnce();
    act(() => view.update(el(Button, { disabled: true }, '処理中')));
    expect(view.root.findByType('button').props.disabled).toBe(true);
    act(() => view.unmount());
  });
  it('announces processing and failure with explicit text and keeps neutral labels quiet', () => {
    expect(render(StateLabel, { tone: 'processing' }, '試合を処理中')).toContain('role="status"');
    expect(render(StateLabel, { tone: 'danger' }, '保存失敗')).toContain('role="alert"');
    expect(render(StateLabel, { tone: 'neutral' }, '未確定')).not.toContain('role=');
    expect(render(StateLabel, { tone: 'success' }, '保存済み')).toContain('保存済み');
  });
  it('retains zero and explains missing and incalculable metrics without computing them', () => {
    const html = render(MetricBand, { items: [
      { label:'本塁打',value:0,unit:'本' },
      { label:'打点',value:null,state:'unrecorded' },
      { label:'防御率',value:null,state:'unavailable',reason:'投球回0' },
      { label:'OPS',value:'0.000' },
    ] });
    expect(html).toContain('data-count="4"');
    expect(html).toContain('<dd>0<small>本</small></dd>');
    expect(html).toContain('未記録');
    expect(html).toContain('算出不可');
    expect(html).toContain('投球回0');
    expect(html).toContain('0.000');
  });
  it('uses one labelled section heading and a focusable table region, without sorting data', () => {
    const html = render(Section, {title:'成績',headingId:'stats'}, el(DataTableFrame, {label:'打者成績',stickyColumn:2}, el('table',null,el('tbody',null,el('tr',null,el('td',{'data-number':true},0))))));
    expect(html).toContain('aria-labelledby="stats"');
    expect(html).toContain('<h2 id="stats">成績</h2>');
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="打者成績"');
    expect(html).toContain('data-sticky-column="2"');
  });
});
