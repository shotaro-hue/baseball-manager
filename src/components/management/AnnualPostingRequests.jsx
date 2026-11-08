import { useEffect, useRef, useState } from 'react';
import { postingGenerationRequest } from '../../engine/humanPosting';
import { postingGenerationId } from '../../engine/generatedPostingRequests';
import { Button } from '../design-system/primitives';
import { DecisionConfirmation } from './DecisionParts';

export function AnnualPostingRequests({ gs }) {
  const [confirmation, setConfirmation] = useState(null), [saving, setSaving] = useState(false), [failure, setFailure] = useState(null);
  const busy = useRef(false), mounted = useRef(true), heading = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const e = gs.contractEconomy, clock = e?.clock;
  if (e?.mode !== 'annual' || clock?.phase !== 'offseason' || clock.season !== gs.year || gs.year >= 9999) return null;
  const generation = e.engine.transactions.find(t => t.id === postingGenerationId(gs.year, gs.myId))?.generatedPostingRequests;
  const recovery = failure?.reason === 'economy_adoption_required' || gs.saveResult?.reason === 'economy_adoption_required';
  const blocked = saving || gs.saveQueueState?.isSaving || recovery;
  const issue = confirmation && !recovery && (confirmation.session !== gs.getProgressSessionToken()
    || JSON.stringify(confirmation.request) !== JSON.stringify(postingGenerationRequest(gs)))
    ? '状態が変更されています。希望確認を開き直してください。' : null;
  const save = async recover => {
    if (busy.current || gs.saveQueueState?.isSaving || !recover && (recovery || !confirmation || issue)) return;
    busy.current = true; setSaving(true); setFailure(null);
    try {
      const result = await (recover ? gs.recoverEconomyCommand() : gs.commitPostingGenerationRequest(confirmation.request, confirmation.session));
      if (!mounted.current) return;
      if (result?.ok) { setConfirmation(null); heading.current?.focus(); }
      else setFailure(result ?? { reason: 'economy_commit_failed' });
    } catch { if (mounted.current) setFailure({ reason: 'economy_commit_failed' }); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  return <section className="management-decisions" aria-label="年度の海外挑戦">
    <h2 ref={heading} tabIndex={-1}>{gs.year}年度の海外挑戦</h2>
    {generation ? <p role="status">希望確認済み · 希望者 {generation.candidates.filter(c => c.requestId !== null).length}人。申請ごとに球団判断を行ってください。</p>
      : <><p>自球団の支配下選手の希望を年一度確認します。希望があった選手は、受信箱で承認・拒否を判断できます。</p>
        <Button disabled={blocked} aria-expanded={Boolean(confirmation)} onClick={() => {
          if (busy.current || blocked || confirmation) return;
          setFailure(null); setConfirmation({ request: postingGenerationRequest(gs), session: gs.getProgressSessionToken() });
        }}>海外挑戦の希望を確認する</Button></>}
    {saving && <p role="status">希望の保存・反映を確認しています…</p>}
    {failure && <p role="alert">{failure.error || (recovery ? '保存済みの希望を画面へ反映できませんでした。復旧してください。'
      : '希望を保存できませんでした。同じ希望判定で再試行できます。')}</p>}
    {recovery && <Button disabled={saving || gs.saveQueueState?.isSaving} onClick={() => save(true)}>保存済みの希望を復旧する</Button>}
    {confirmation && !generation && !recovery && <DecisionConfirmation title="海外挑戦の希望確認" fallbackFocus={heading}
      busy={saving} confirmDisabled={gs.saveQueueState?.isSaving} error={issue} onCancel={() => { setConfirmation(null); setFailure(null); }}
      onConfirm={() => save(false)} confirmLabel={failure ? '同じ希望判定で保存を再試行する' : '希望を確認して保存する'}>
      <p>海外志向・年齢・モラル・出場機会から希望を確認します。未記録の海外志向はゲーム上の推定を使います。</p>
      <p>希望者がいない場合も今年度の確認を保存します。再開や再試行で希望を抽選し直しません。この操作では所属・契約・財務は変わりません。</p>
    </DecisionConfirmation>}
  </section>;
}
