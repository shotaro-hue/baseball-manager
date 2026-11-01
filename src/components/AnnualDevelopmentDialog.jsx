import { useCallback, useMemo, useRef, useState } from 'react';
import { previewDevelopmentRegistration } from '../engine/developmentRegistration';
import { Button } from './design-system/primitives';
import { useResultDialog } from './useResultDialog';
import { fmtSal } from '../utils';

export default function AnnualDevelopmentDialog({ gs, player, onConfirm, onClose, onSaved }) {
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(null);
  const inFlight = useRef(false);
  const recovery = failure?.reason === 'economy_adoption_required' || gs.saveResult?.reason === 'economy_adoption_required';
  const close = useCallback(() => { if (!inFlight.current) onClose(); }, [onClose]);
  const ref = useResultDialog(close, true);
  const preview = useMemo(() => previewDevelopmentRegistration(gs, player.id), [gs, player.id]);
  const blocked = busy || gs.saveQueueState?.isSaving || recovery;
  const run = async (operation, message) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFailure(null);
    try {
      const result = await operation();
      if (result?.ok) { onSaved(message); onClose(); }
      else setFailure(result ?? { reason: 'economy_commit_failed' });
    } catch { setFailure({ reason: 'economy_commit_failed' }); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <div className="farm-confirm-overlay"><div className="farm-registration-dialog" data-ds="farm-registration"
    role="dialog" aria-modal="true" aria-label="支配下登録の確認" ref={ref}>
    <h2>支配下登録の確認</h2><p><strong>{player.name}</strong></p>
    {preview.ok && <>
      <dl><dt>支配下人数（加入待ちを含む）</dt><dd>{preview.occupiedCount} → {preview.occupiedCount + 1} / 70人</dd>
        <dt>現在年俸（年額）</dt><dd>{fmtSal(player.salary)}</dd><dt>登録後年俸（年額）</dt><dd>{fmtSal(preview.salary)}</dd>
        <dt>契約終了年度</dt><dd>{preview.endSeason}年度（変更なし）</dd></dl>
      <p>当年は登録日までを育成年俸、登録日以後を支配下年俸で計算します。契約期間・保証条件を引き継ぎます。</p>
      <table className="farm-annual-costs"><caption>登録後の年度別負担・追加余力</caption><thead><tr><th scope="col">年度</th><th scope="col">選手の給与</th><th scope="col">球団の追加余力</th></tr></thead>
        <tbody>{preview.rows.map(row => <tr key={row.season}><th scope="row">{row.season}</th><td>{fmtSal(preview.costs.filter(c => c.season === row.season).reduce((n, c) => n + c.amountManYen, 0))}</td><td>{fmtSal(row.remainingManYen)}</td></tr>)}</tbody></table>
    </>}
    {!preview.ok && !busy && !recovery && <p role="alert">{preview.error}</p>}
    <p>二軍の支配下選手になります。一軍昇格は別操作です。保存・反映の確認後に登録完了となります。</p>
    {busy && <p role="status">保存・反映を確認しています…</p>}
    {failure && <p role="alert">{failure.error || (recovery ? '保存済みの支配下登録を画面へ反映できませんでした。復旧してください。' : '支配下登録を保存できませんでした。確認内容を保持しています。再試行してください。')}</p>}
    <div className="farm-dialog-actions"><Button variant="secondary" disabled={busy} onClick={close}>戻る</Button>
      {recovery ? <Button disabled={busy || !gs.recoverEconomyCommand} onClick={() => run(gs.recoverEconomyCommand, '保存済みの支配下登録を復旧しました。')}>保存済みの支配下登録を復旧する</Button>
        : <Button disabled={blocked || !preview.ok || !onConfirm} onClick={() => { if (!blocked && preview.ok && onConfirm) run(() => onConfirm(player.id), '支配下登録を保存しました。'); }}>登録を確定</Button>}
    </div>
  </div></div>;
}
