import { useEffect, useState } from 'react';
import { TEAM_DEFS } from '../constants';

let titleSaveModulePromise = null;

function loadTitleSaveModule() {
  if (!titleSaveModulePromise) titleSaveModulePromise = import('../engine/saveload');
  return titleSaveModulePromise;
}

export default function TitleScreen({
  saveExists,
  onLoad,
  onSelectTeam,
  onSaveDeleted,
}) {
  const [saveMeta, setSaveMeta] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!saveExists) {
      setSaveMeta(null);
      return () => {
        alive = false;
      };
    }
    loadTitleSaveModule()
      .then((mod) => {
        if (!alive) return;
        setSaveMeta(mod.getSaveMeta());
      })
      .catch((error) => {
        console.error('Failed to load save metadata:', error);
        if (alive) setSaveMeta(null);
      });
    return () => {
      alive = false;
    };
  }, [saveExists]);

  const renderTeamCard = (team) => (
    <button
      key={team.id}
      type="button"
      className="tcard"
      style={{ '--c': team.color }}
      onClick={() => onSelectTeam(team.id)}
      aria-label={team.name}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: 24, display: 'block', marginBottom: 5 }}
      >
        {team.emoji}
      </span>
      <span className="tcard-nm">{team.name}</span>
    </button>
  );

  const handleDeleteSave = async () => {
    if (!window.confirm('セーブデータを削除しますか？')) return;
    const mod = await loadTitleSaveModule();
    mod.deleteSave();
    setSaveMeta(null);
    onSaveDeleted();
  };

  return (
    <div className="app">
      <div className="title">
        <div className="tlogo">
          BASEBALL
          <br />
          MANAGER 2025
        </div>
        <div className="tsub">NPB SIMULATION v2.1 - TACTICAL MODE</div>

        {saveMeta && (
          <div
            style={{
              background: 'rgba(74,222,128,.08)',
              border: '1px solid rgba(74,222,128,.3)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: '#4ade80',
                letterSpacing: '.1em',
                marginBottom: 6,
              }}
            >
              SAVE DATA
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {saveMeta.teamEmoji} {saveMeta.teamName}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {saveMeta.year}年 第{saveMeta.gameDay}戦 {saveMeta.wins}勝
                  {saveMeta.losses}敗
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: '#64748b',
                    marginTop: 2,
                  }}
                >
                  {saveMeta.savedAt}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  className="sim-btn"
                  style={{
                    margin: 0,
                    padding: '8px 18px',
                    fontSize: 13,
                    background: 'linear-gradient(135deg,#14532d,#166534)',
                    borderColor: 'rgba(74,222,128,.6)',
                    color: '#4ade80',
                  }}
                  onClick={onLoad}
                >
                  続きから
                </button>
                <button
                  className="bsm bgr"
                  style={{ padding: '6px 10px' }}
                  onClick={handleDeleteSave}
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            fontSize: 10,
            color: '#1e2d3d',
            letterSpacing: '.2em',
            marginBottom: 8,
            marginTop: saveExists ? 8 : 0,
            zIndex: 1,
            position: 'relative',
          }}
        >
          NEW GAME - チームを選択
        </div>

        <div
          style={{
            fontSize: 10,
            color: '#1e2d3d',
            letterSpacing: '.2em',
            marginBottom: 8,
            zIndex: 1,
            position: 'relative',
          }}
        >
          セントラルリーグ
        </div>
        <div className="tgrid" style={{ marginBottom: 14 }}>
          {TEAM_DEFS.filter((team) => team.league === 'セ').map(renderTeamCard)}
        </div>

        <div
          style={{
            fontSize: 10,
            color: '#1e2d3d',
            letterSpacing: '.2em',
            marginBottom: 8,
            zIndex: 1,
            position: 'relative',
          }}
        >
          パシフィックリーグ
        </div>
        <div className="tgrid">
          {TEAM_DEFS.filter((team) => team.league === 'パ').map(renderTeamCard)}
        </div>

        <div
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid rgba(100,116,139,.12)',
            textAlign: 'center',
          }}
        >
          <a
            href="/baseball-manager/flow-diagram.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 10,
              color: '#334155',
              textDecoration: 'none',
              letterSpacing: '.1em',
            }}
          >
            システムフローを見る
          </a>
        </div>
      </div>
    </div>
  );
}
