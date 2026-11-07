import { useEffect, useRef, useState } from 'react';
import { postingDecisionRequest, postingMarketRequest } from '../../engine/humanPosting';
import { Button } from '../design-system/primitives';
import { DecisionConfirmation } from './DecisionParts';

export function AnnualPostingDecision({ gs, application, fallbackFocus }) {
  const [confirmation, setConfirmation] = useState(null), [saving, setSaving] = useState(false), [failure, setFailure] = useState(null);
  const busy = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const recovery = failure?.reason === 'economy_adoption_required' || gs.saveResult?.reason === 'economy_adoption_required';
  const blocked = saving || gs.saveQueueState?.isSaving || recovery;
  const market = confirmation?.kind === 'market';
  // Compare the small confirmation snapshot while rendering. Full world and
  // transaction validation belongs to the common commit path, once on save.
  const issue = confirmation && !recovery && (confirmation.session !== gs.getProgressSessionToken()
    ? 'セーブが変更されています。申請を確認し直してください。'
    : JSON.stringify(confirmation.request) !== JSON.stringify(market ? postingMarketRequest(gs, application.id) : postingDecisionRequest(gs, application.id, confirmation.request.decision))
      ? '状態が変更されています。申請と判断内容を確認し直してください。' : null);
  const open = (decision, kind = 'decision') => {
    if (busy.current || blocked) return;
    setFailure(null); setConfirmation({ kind, request: kind === 'market' ? postingMarketRequest(gs, application.id) : postingDecisionRequest(gs, application.id, decision), session: gs.getProgressSessionToken() });
  };
  const save = async recover => {
    if (busy.current || gs.saveQueueState?.isSaving || (!recover && (recovery || !confirmation || issue))) return;
    busy.current = true; setSaving(true); setFailure(null);
    try {
      const commit = market ? gs.commitPostingMarketRequest : gs.commitPostingDecisionRequest;
      const result = await (recover ? gs.recoverEconomyCommand() : commit(confirmation.request, confirmation.session));
      if (!mounted.current) return;
      if (result?.ok) setConfirmation(null); else setFailure(result ?? { reason: 'economy_commit_failed' });
    } catch { if (mounted.current) setFailure({ reason: 'economy_commit_failed' }); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  return <section className="management-decisions" aria-label="ポスティングの球団判断">
    {application.status === 'pending' && <>
      <h3>ポスティング判断</h3>
      <p>承認すると海外交渉へ進みます。海外契約が成立するまで所属・契約・財務を維持します。拒否によるモラルの変更はありません。</p>
      {!confirmation && <div className="reading-actions"><Button disabled={blocked} onClick={() => open('approve')}>承認内容を確認する</Button>
        <Button variant="secondary" disabled={blocked} onClick={() => open('reject')}>拒否内容を確認する</Button></div>}
    </>}
    {application.status === 'approved' && <>
      <h3>海外市場での交渉</h3>
      <p>海外の提示条件と本人の判断を確認します。成立時は退団・譲渡金・翌年度の追加支出枠をまとめて保存します。</p>
      {!market && <Button disabled={blocked} onClick={() => open(undefined, 'market')}>海外交渉の結果を確認する</Button>}
    </>}
    {saving && <p role="status">{market ? '交渉結果' : '判断'}の保存・反映を確認しています…</p>}
    {failure && <p role="alert">{failure.error || (recovery ? '保存済みの判断を画面へ反映できませんでした。復旧してから操作してください。'
      : market ? '交渉結果を保存できませんでした。内容は保持しています。同じ交渉で再試行できます。' : '判断を保存できませんでした。内容は保持しています。同じ判断で再試行できます。')}</p>}
    {recovery && <Button disabled={saving || gs.saveQueueState?.isSaving} onClick={() => save(true)}>{market ? '保存済みの交渉結果を復旧する' : confirmation ? '保存済みの判断を復旧する' : '保存済みの処理を復旧する'}</Button>}
    {confirmation && application.status === (market ? 'approved' : 'pending') && !recovery && <DecisionConfirmation title={market ? '海外交渉の確認' : 'ポスティング判断の確認'} fallbackFocus={fallbackFocus}
      busy={saving} confirmDisabled={gs.saveQueueState?.isSaving} error={issue} onCancel={() => { setConfirmation(null); setFailure(null); }} onConfirm={() => save(false)}
      confirmLabel={market ? failure ? '同じ交渉で保存を再試行する' : '海外交渉を進めて保存する' : failure ? '同じ判断で保存を再試行する' : confirmation.request.decision === 'approve' ? '承認を確定する' : '拒否を確定する'}>
      <p>{market ? '能力・実績・年齢に応じた海外提示と本人の意向をもとに、成立・提示なし・辞退を確定します。マイナー提示もあります。成立時も元契約の残存債務は維持します。保存を再試行しても抽選し直しません。'
        : confirmation.request.decision === 'approve' ? '海外交渉を承認します。承認だけで移籍・入金は確定しません。' : '球団として申請を拒否します。所属・契約・財務とモラルを維持します。'}</p>
      <p>保存後は判断を取り消せません。</p>
    </DecisionConfirmation>}
  </section>;
}
