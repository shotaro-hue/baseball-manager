import { useEffect, useMemo, useState } from "react";

const EXIT_COLOR = {
  引退: '#94a3b8',
  トレード: '#f97316',
  戦力外: '#f87171',
  FA移籍: '#a78bfa',
};

const infield = ['一塁手', '二塁手', '三塁手', '遊撃手'];
const outfield = ['左翼手', '中堅手', '右翼手'];

function Group({ title, players, onPlayerClick, teamName }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{title} ({players.length})</div>
      {players.length === 0 && <div style={{ fontSize: 11, color: '#475569' }}>該当なし</div>}
      {players.map((p) => (
        <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <button onClick={() => onPlayerClick?.(p, teamName)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7dd3fc', padding: 0, fontSize: 13 }}>
            {p.name}
          </button>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.pos}</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.age}歳</span>
        </div>
      ))}
    </div>
  );
}

export function TeamModal({ team, onPlayerClick, onClose }) {
  const [tab, setTab] = useState('roster');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const groups = useMemo(() => {
    const players = team?.players || [];
    return {
      starters: players.filter((p) => p.isPitcher && p.subtype === '先発'),
      relievers: players.filter((p) => p.isPitcher && p.subtype === '中継ぎ'),
      closers: players.filter((p) => p.isPitcher && p.subtype === '抑え'),
      catchers: players.filter((p) => !p.isPitcher && p.pos === '捕手'),
      infielders: players.filter((p) => !p.isPitcher && infield.includes(p.pos)),
      outfielders: players.filter((p) => !p.isPitcher && outfield.includes(p.pos)),
    };
  }, [team]);

  const history = [...(team?.history || [])].sort((a, b) => (b.exitYear || 0) - (a.exitYear || 0)).slice(0, 20);

  if (!team) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.78)', zIndex: 310, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#0d1b2a', border: '1px solid #1e3a5f', borderRadius: 12, padding: 20, width: '100%', maxWidth: 560, boxShadow: '0 8px 32px rgba(0,0,0,.6)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#e0d4bf' }}>{team.emoji} {team.name}（{team.league}）</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{team.wins}勝 {team.losses}敗</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#94a3b8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className={`tab ${tab === 'roster' ? 'on' : ''}`} onClick={() => setTab('roster')}>ロスター</button>
          <button className={`tab ${tab === 'history' ? 'on' : ''}`} onClick={() => setTab('history')}>移籍履歴</button>
        </div>

        {tab === 'roster' && (
          <div>
            <Group title="先発投手" players={groups.starters} onPlayerClick={onPlayerClick} teamName={team.name} />
            <Group title="中継ぎ" players={groups.relievers} onPlayerClick={onPlayerClick} teamName={team.name} />
            <Group title="抑え" players={groups.closers} onPlayerClick={onPlayerClick} teamName={team.name} />
            <Group title="捕手" players={groups.catchers} onPlayerClick={onPlayerClick} teamName={team.name} />
            <Group title="内野手" players={groups.infielders} onPlayerClick={onPlayerClick} teamName={team.name} />
            <Group title="外野手" players={groups.outfielders} onPlayerClick={onPlayerClick} teamName={team.name} />
          </div>
        )}

        {tab === 'history' && (
          <div>
            {history.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>履歴データがありません</div>}
            {history.map((p, i) => (
              <div key={`${p.id}-${p.exitYear}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                <span style={{ fontSize: 13, color: '#e0d4bf', minWidth: 120 }}>{p.name}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.pos}</span>
                <span style={{ fontSize: 10, color: EXIT_COLOR[p.exitReason] || '#64748b', border: '1px solid', borderColor: EXIT_COLOR[p.exitReason] || '#64748b', borderRadius: 3, padding: '1px 5px' }}>{p.exitReason}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.exitYear}年</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
