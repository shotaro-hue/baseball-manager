import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import HubFaTab from './hub/HubFaTab';
import { PlayerComparisonDialog, PlayerComparisonTray } from './PlayerComparisonTray';
import { useResultDialog } from './useResultDialog';
import { fmtSal } from '../utils';

const PlayerModal = lazy(() => import('./PlayerModal').then(module => ({ default: module.PlayerModal })));

function FinishDialog({ acquired, onClose, onConfirm }) {
  const ref = useResultDialog(onClose, true);
  return <div className="fa-overlay"><section className="fa-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="fa-finish-title">
    <h2 id="fa-finish-title" tabIndex={0}>補強を終了して契約更改へ</h2>
    {acquired.length ? <ul>{acquired.map(p => <li key={p.id}>{p.name}：年俸 {Number.isFinite(p.salary) ? fmtSal(p.salary) : '未記録'}・{p.contractYears}年</li>)}</ul> : <p>今回は補強せずに進みます。</p>}
    <p>獲得済みの選手は契約済みとして扱い、直後の契約更改では再交渉しません。</p>
    <p>次は既存選手の契約更改です。補強しなかった候補には、その後CPU球団が交渉します。</p>
    <div className="fa-actions"><button onClick={onClose}>市場に戻る</button><button className="fa-primary" onClick={onConfirm}>契約更改に進む</button></div>
  </section></div>;
}

export default function OffseasonFaPhaseScreen({ gs, os, myTeam, myId, year, embedded = false }) {
  const [profile, setProfile] = useState(null);
  const [compared, setCompared] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const advanced = useRef(false);
  const saveMarketView = useCallback(marketView => gs.setOffseasonPlan?.(prev => ({ ...prev, marketView })), [gs.setOffseasonPlan]);
  const initialCandidates = useRef(new Set((gs.faPool || []).filter(p => !p.isForeign).map(p => p.id)));
  const closeFinish = useCallback(() => setFinishOpen(false), []);
  const closeCompare = useCallback(() => setCompareOpen(false), []);
  const toggle = (player, teamName) => {
    if (player?.id == null) return;
    setCompared(current => current.some(p => p.id === player.id) ? current.filter(p => p.id !== player.id) : current.length < 2 ? [...current, { ...player, _teamName: teamName }] : current);
    if (!compared.some(p => p.id === player.id) && compared.length >= 2) gs.notify('比較は2人までです。先に1人を外してください', 'warn');
  };
  const remove = id => { setCompared(current => current.filter(p => p.id !== id)); setCompareOpen(false); };
  const owned = [...(myTeam?.players || []), ...(myTeam?.farm || [])];
  const acquired = owned.filter(p => initialCandidates.current.has(p.id) && !p.isFA);
  const next = () => {
    if (advanced.current) return;
    advanced.current = true;
    os.handleFaPhaseNext();
  };
  const Frame = embedded ? 'section' : 'main';
  return <Frame className="fa-market offseason-fa-screen">
    {!embedded && <header><h1>{year}年 オフシーズン補強</h1><p>引退整理 → <strong>国内FA・自由契約補強</strong> → 契約更改 → 成長結果・戦力外・ドラフト</p>
      <p>全球団のFA宣言を判定済みです。他球団の補強候補と、自球団から宣言した選手の残留契約を確認し、その後に既存選手と契約更改します。補強せずに進むこともできます。</p>
    </header>}
    <HubFaTab myTeam={myTeam} myId={myId} year={year} gameDay={gs.gameDay}
      faPool={(gs.faPool || []).filter(p => !p.isForeign)} faYears={gs.faYears} setFaYears={gs.setFaYears}
      upd={gs.upd} setFaPool={gs.setFaPool} notify={gs.notify} marketMode="offseason"
      savedView={embedded ? gs.offseasonPlan?.marketView : undefined} onViewChange={embedded ? saveMarketView : undefined}
      onPlayerClick={(player, teamName) => setProfile({ player, teamName })} onToggleCompare={toggle} comparePlayerIds={compared.map(p => p.id)} />
    <details><summary>自チームの選手を比較に追加</summary><div className="fa-actions">{owned.map(p => <button key={p.id} aria-pressed={compared.some(entry => entry.id === p.id)} onClick={() => toggle(p, myTeam?.name)}>{p.name}を比較{compared.some(entry => entry.id === p.id) ? 'から外す' : 'に追加'}</button>)}</div></details>
    {!embedded && <footer><p>補強後も既存選手の更改が残っています。予算と年俸を確認して進んでください。</p><button className="fa-primary" onClick={() => setFinishOpen(true)}>補強を終了して契約更改へ</button></footer>}
    <PlayerComparisonTray players={compared} onRemove={remove} onClear={() => { setCompared([]); setCompareOpen(false); }} onOpen={() => setCompareOpen(true)} />
    {compareOpen && <PlayerComparisonDialog players={compared} onRemove={remove} onClose={closeCompare} />}
    {profile && <Suspense fallback={<p role="status">選手詳細を読み込み中です。</p>}><PlayerModal player={profile.player} teamName={profile.teamName} isMyTeam={profile.teamName === myTeam?.name} saveId={gs.saveId} year={year} teams={gs.teams} onClose={() => setProfile(null)} onToggleCompare={toggle} isCompared={compared.some(p => p.id === profile.player.id)} /></Suspense>}
    {finishOpen && <FinishDialog acquired={acquired} onClose={closeFinish} onConfirm={next} />}
  </Frame>;
}
