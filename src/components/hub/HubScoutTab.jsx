import { fmtSal } from '../../utils';

export default function HubScoutTab({
  myTeam,
  scoutRegions,
  onSendScout,
  onSignPlayer,
  onRemoveScoutResult,
}) {
  return (
    <div>
      {myTeam?.scoutResults?.length > 0 && (
        <div className="card">
          <div className="card-h">スカウト結果</div>
          {myTeam.scoutResults.map((player, index) => (
            <div key={player.id} className="card2">
              <div className="fsb" style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>
                  {player.name}{' '}
                  <span style={{ fontSize: 10, color: '#374151' }}>
                    {player.pos}/{player.age}歳
                  </span>
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="bsm bga"
                    onClick={() => onSignPlayer(index)}
                  >
                    契約
                  </button>
                  <button
                    className="bsm bgr"
                    onClick={() => onRemoveScoutResult(index)}
                  >
                    削除
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#374151' }}>
                {fmtSal(player.salary || 0)}/年
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-h">スカウト派遣</div>
        <div className="g2">
          {scoutRegions.map((region) => (
            <div
              key={region.id}
              className="card2"
              style={{ cursor: 'pointer' }}
              onClick={() => onSendScout(region)}
            >
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>
                {region.name}
              </div>
              <div style={{ fontSize: 10, color: '#374151' }}>
                費用: {fmtSal(region.cost)} / Lv{region.qMin}-{region.qMax}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
