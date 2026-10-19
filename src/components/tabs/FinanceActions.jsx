import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, DataTableFrame, StateLabel } from '../design-system/primitives';
import { moneyText, rangeText, stadiumPreview, ticketPreview } from './financeView';
const people = n => `${n.toLocaleString()}人`;
const signed = n => `${n > 0 ? '+' : ''}${moneyText(n)}`;
const signedPeople = n => `${n > 0 ? '+' : ''}${people(n)}`;

function CompareTable({ label, rows, beforeLabel = '現在', afterLabel = '変更案' }) {
  return <DataTableFrame label={label} className="finance-comparison">
    <table><caption>{label}</caption><thead><tr><th scope="col">指標</th><th scope="col" data-number>{beforeLabel}</th><th scope="col" data-number>{afterLabel}</th></tr></thead>
      <tbody>{rows.map(([label, a, b]) => <tr key={label}><th scope="row">{label}</th><td data-number>{a}</td><td data-number>{b}</td></tr>)}</tbody>
    </table>
  </DataTableFrame>;
}
export function FinanceActions({ team, schedule, model, onTicketPriceChange, onStadiumUpgrade }) {
  const initial = String(model.quote?.avgTicketPrice ?? ''), priceId = useId();
  const [draft, setDraft] = useState(initial), [priceConfirm, setPriceConfirm] = useState(false), [stadiumConfirm, setStadiumConfirm] = useState(false);
  const dirty = useRef(false), priceSent = useRef(false), stadiumSent = useRef(false);
  const priceButton = useRef(null), stadiumButton = useRef(null), priceHeading = useRef(null), stadiumHeading = useRef(null);
  const priceInput = useRef(null), stadiumTitle = useRef(null);
  const priceRestore = useRef(false), stadiumRestore = useRef(false);
  // Demand changes update the comparison, but do not replace an unfinished draft.
  useEffect(() => { if (!dirty.current) setDraft(initial); }, [initial]);
  useEffect(() => {
    if (priceConfirm) priceHeading.current?.focus();
    else if (priceRestore.current) {
      const button = priceButton.current?.querySelector('button');
      (priceRestore.current === 'input' || !button || button.disabled ? priceInput.current : button)?.focus();
      priceRestore.current = false;
    }
  }, [priceConfirm]);
  useEffect(() => {
    if (stadiumConfirm) stadiumHeading.current?.focus();
    else if (stadiumRestore.current) {
      const button = stadiumButton.current?.querySelector('button');
      (stadiumRestore.current === 'heading' || !button || button.disabled ? stadiumTitle.current : button)?.focus();
      stadiumRestore.current = false;
    }
  }, [stadiumConfirm]);
  const preview = ticketPreview(team, schedule, draft), investment = stadiumPreview(team, schedule);
  const priceRows = preview.ok ? [
    ['動員 / 主催1試合', people(preview.before.quote.attendance), people(preview.after.quote.attendance)],
    ['主催売上 / 1試合', moneyText(preview.before.hostRevenue), moneyText(preview.after.hostRevenue)],
    ['運営差額 / 1試合', preview.before.status === 'ready' ? moneyText(preview.before.quote.operatingSurplus) : '— 算出不可', preview.after.status === 'ready' ? moneyText(preview.after.quote.operatingSurplus) : '— 算出不可'],
  ] : [];
  const closePrice = (target = 'button') => { priceRestore.current = target; setPriceConfirm(false); };
  const closeStadium = (target = 'button') => { stadiumRestore.current = target; setStadiumConfirm(false); };
  const commitPrice = () => {
    if (!priceConfirm || !preview.ok || priceSent.current) return;
    priceSent.current = true;
    onTicketPriceChange?.(preview.price);
    dirty.current = false;
    closePrice('input');
  };
  const commitStadium = () => {
    if (!stadiumConfirm || !investment.affordable || model.status === 'invalid' || stadiumSent.current) return;
    stadiumSent.current = true;
    onStadiumUpgrade?.();
    closeStadium('heading');
  };
  return <div className="finance-actions">
    <section className="finance-action" aria-labelledby={`${priceId}-heading`}>
      <h3 id={`${priceId}-heading`}>チケット価格</h3>
      <p>現在 <strong>{model.quote ? `${model.quote.avgTicketPrice.toLocaleString()}円/枚` : '— 算出不可'}</strong><span className="finance-note">{Number(team.customAvgTicketPrice) > 0 ? '手動設定' : '自動価格'}</span></p>
      <label htmlFor={priceId}>新しい平均価格（円）</label>
      <div className="finance-price-field"><input ref={priceInput} id={priceId} type="text" inputMode="numeric" pattern="[0-9]*" value={draft}
        aria-invalid={!preview.ok} aria-describedby={`${priceId}-help`} disabled={!model.quote}
        onChange={e => { dirty.current = true; priceSent.current = false; setDraft(e.target.value); setPriceConfirm(false); }} />
        {draft !== initial && <StateLabel tone="warning">未確定</StateLabel>}
      </div>
      <p className="finance-note" id={`${priceId}-help`}>{preview.ok ? '設定範囲: 500〜5,000円。入力・フォーカス移動では確定しません。' : preview.error}</p>
      {preview.ok && <>
        <CompareTable label="価格の同条件比較" rows={priceRows} />
        <p className="finance-note">同じ人気・成績・球場・試合数。主催売上はチケット・飲食・物販、運営差額は選手給与控除前です。</p>
        {preview.after.forecast && <p className="finance-note">変更案の今季年間売上見込み {rangeText(preview.after.forecast.revenue)}（実績は維持・残り試合に適用）</p>}
      </>}
      {priceConfirm ? <div className="finance-confirm" role="region" aria-label="価格変更の確認">
        <h4 ref={priceHeading} tabIndex={-1}>価格変更の確認</h4>
        <p>{model.quote?.avgTicketPrice.toLocaleString()}円 → <strong>{preview.ok ? preview.price.toLocaleString() : '—'}円</strong>。確定後の主催試合に適用します。</p>
        <div className="finance-buttons"><Button onClick={commitPrice} disabled={!preview.ok || !onTicketPriceChange}>この価格で確定</Button><Button variant="secondary" onClick={() => closePrice()}>価格の確認を閉じる</Button></div>
      </div> : <div className="finance-buttons" ref={priceButton}>
        <Button disabled={!preview.ok || !onTicketPriceChange || draft === initial} onClick={() => { priceSent.current = false; setPriceConfirm(true); }}>価格変更を確認</Button>
        {draft !== initial && <Button variant="secondary" onClick={() => { dirty.current = false; setDraft(initial); priceInput.current?.focus(); }}>下書きを取り消す</Button>}
      </div>}
    </section>
    <section className="finance-action" aria-label="球場投資">
      <h3 ref={stadiumTitle} tabIndex={-1}>球場投資</h3>
      {investment.max ? <p>球場は最高レベル（Lv3）です。</p> : <>
        <p>現在 Lv{investment.level} → <strong>改修後 Lv{investment.level + 1}</strong></p>
        <dl className="finance-rows">
          <div><dt>改修費</dt><dd>{moneyText(investment.cost)}</dd></div>
          <div><dt>投資後の編成予算</dt><dd>{moneyText(investment.budgetAfter)}</dd></div>
          <div><dt>年間動員の増加見込み</dt><dd>{rangeText(investment.attendanceDelta, signedPeople)}</dd></div>
          <div><dt>年間売上の増加見込み</dt><dd>{rangeText(investment.revenueDelta, signed)}</dd></div>
          <div><dt>年間運営差額の増加見込み</dt><dd>{rangeText(investment.surplusDelta, signed)}</dd></div>
          <div><dt>単純回収年数（参考）</dt><dd>{investment.payback ? rangeText(investment.payback, n => `約${n.toFixed(1)}年`) : '— 算出不可'}</dd></div>
        </dl>
        <p className="finance-note">現在の人気・成績・価格を通年に適用した比較。今季残りの効果とは異なります。費用÷年間運営差額増分による参考値で、将来利益の保証ではありません。</p>
        <p className="finance-note">{model.status === 'ready' ? '自動価格の基準単価は改修1段階につき+3.5%です。' : '旧モデルの球場倍率に基づき、自動価格と動員が変わります。'}{Number(team.customAvgTicketPrice) > 0 && '手動設定中のチケット価格は維持されます。'}</p>
        {investment.available && <details><summary>改修前後の通年比較</summary>
          <CompareTable label="球場の同条件比較" beforeLabel="改修前" afterLabel="改修後" rows={[
            ['年間動員', rangeText(investment.before.forecast.homeGames, n => people(n * investment.before.quote.attendance)), rangeText(investment.after.forecast.homeGames, n => people(n * investment.after.quote.attendance))],
            ['年間売上', rangeText(investment.before.forecast.revenue), rangeText(investment.after.forecast.revenue)],
            ['年間運営差額', rangeText(investment.before.forecast.operatingSurplus), rangeText(investment.after.forecast.operatingSurplus)],
          ]} />
          <p className="finance-note">主催{rangeText(investment.before.forecast.homeGames, String)}試合。{investment.before.forecast.completeSchedule ? '実際の日程を使用。' : '日程未確認のため71〜72試合の概算。'} 年間動員も現在条件による推定です。</p>
        </details>}
        {!investment.payback && <p className="finance-note">運営差額の増分が正でない、または比較できない場合は回収年数を算出しません。</p>}
        {!investment.affordable && <p className="finance-warning" role="status">{Number.isFinite(team.budget) ? '予算不足のため投資できません。' : '予算が未記録のため投資できません。'}</p>}
        {stadiumConfirm ? <div className="finance-confirm" role="region" aria-label="球場投資の確認">
          <h4 ref={stadiumHeading} tabIndex={-1}>球場投資の確認</h4>
          <p>Lv{investment.level + 1}に改修：{moneyText(investment.cost)}。確定後の編成予算 {moneyText(investment.budgetAfter)}。</p>
          <div className="finance-buttons"><Button onClick={commitStadium} disabled={!investment.affordable || model.status === 'invalid' || !onStadiumUpgrade}>この内容で投資を確定</Button><Button variant="secondary" onClick={() => closeStadium()}>投資の確認を閉じる</Button></div>
        </div> : <div ref={stadiumButton}><Button disabled={!investment.affordable || model.status === 'invalid' || !onStadiumUpgrade} onClick={() => { stadiumSent.current = false; setStadiumConfirm(true); }}>投資内容を確認</Button></div>}
      </>}
    </section>
  </div>;
}
