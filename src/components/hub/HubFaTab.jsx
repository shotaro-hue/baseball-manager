import { useState } from 'react';
import { fmtSal, rngf } from '../../utils';
import {
  MAX_ROSTER,
  FOREIGN_AGENT_ACCEPT_PROB,
  FOREIGN_AGENT_SALARY_RATIO,
  FOREIGN_DEADLINE_DAY,
} from '../../constants';

const MAX_FOREIGN_ACTIVE = 4;

export default function HubFaTab({
  myTeam,
  faPool,
  faYears,
  setFaYears,
  foreignActiveCount,
  gameDay,
  year,
  myId,
  notify,
  upd,
  setFaPool,
}) {
  const [agentNeg, setAgentNeg] = useState(null);
  const foreignFaPool = faPool.filter((player) => player.isForeign);
  const domesticFaPool = faPool.filter((player) => !player.isForeign);

  const startNeg = (player) => {
    const salaryDemand = Math.ceil(
      (player.salary || 0) * FOREIGN_AGENT_SALARY_RATIO,
    );
    const minYears = player.age <= 30 ? 2 : 1;
    setAgentNeg({
      player,
      round: 1,
      salaryDemand,
      minYears,
      salaryOffer: salaryDemand,
    });
  };

  const signForeignPlayer = (player, salary, years) => {
    const totalCost = salary * years;
    if ((myTeam?.budget || 0) < totalCost) {
      notify('予算が不足しています', 'warn');
      return;
    }

    const foreignPitchers =
      (myTeam?.players || []).filter(
        (entry) => entry.isForeign && entry.isPitcher,
      ).length || 0;
    const foreignBatters =
      (myTeam?.players || []).filter(
        (entry) => entry.isForeign && !entry.isPitcher,
      ).length || 0;
    const wouldBeAllPitchers =
      player.isPitcher && foreignPitchers === MAX_FOREIGN_ACTIVE - 1;
    const wouldBeAllBatters =
      !player.isPitcher && foreignBatters === MAX_FOREIGN_ACTIVE - 1;
    const balanceViolation =
      foreignActiveCount === MAX_FOREIGN_ACTIVE - 1 &&
      (wouldBeAllPitchers || wouldBeAllBatters);
    const rosterFull = (myTeam?.players?.length || 0) >= MAX_ROSTER;
    const goToFarm =
      foreignActiveCount >= MAX_FOREIGN_ACTIVE || balanceViolation || rosterFull;

    upd(myId, (team) => ({
      ...team,
      budget: team.budget - totalCost,
      players: goToFarm
        ? team.players
        : [
            ...team.players,
            {
              ...player,
              isFA: false,
              contractYearsLeft: years,
              contractYears: years,
              salary,
            },
          ],
      farm: goToFarm
        ? [
            ...(team.farm || []),
            {
              ...player,
              isFA: false,
              contractYearsLeft: years,
              contractYears: years,
              salary,
            },
          ]
        : team.farm || [],
      history: [
        ...(team.history || []),
        {
          ...player,
          isFA: false,
          contractYearsLeft: years,
          contractYears: years,
          salary,
          exitYear: year,
          exitReason: 'foreign_fa',
          tenure: 0,
        },
      ],
    }));

    setFaPool((prev) => prev.filter((entry) => entry.id !== player.id));
    setFaYears((prev) => {
      const next = { ...prev };
      delete next[player.id];
      return next;
    });
    setAgentNeg(null);
    notify(
      `${player.name}を契約しました${goToFarm ? '（ファーム配属）' : ''}`,
      goToFarm ? 'warn' : 'ok',
    );
  };

  return (
    <div className="card">
      <div className="card-h">
        FA市場 ({faPool.length}人)
        <span className="chip cb" style={{ marginLeft: 8, fontSize: 10 }}>
          外国人枠 {foreignActiveCount}/{MAX_FOREIGN_ACTIVE}
        </span>
      </div>

      <div className="card-h" style={{ marginTop: 8 }}>
        外国人FA ({foreignFaPool.length}人)
      </div>
      {gameDay > FOREIGN_DEADLINE_DAY && (
        <div
          className="card2"
          style={{
            borderColor: 'rgba(248,113,113,.4)',
            color: '#fca5a5',
          }}
        >
          外国人補強の期限を過ぎています
        </div>
      )}
      {foreignFaPool.length === 0 && (
        <p style={{ color: '#2a3a4c', fontSize: 12 }}>
          現在、外国人FAはいません
        </p>
      )}
      {foreignFaPool.map((player) => {
        const active = agentNeg?.player?.id === player.id;
        return (
          <div key={player.id} className="card2">
            <div className="fsb" style={{ flexWrap: 'wrap', gap: 6 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {player.name}
                </span>
                <span
                  style={{ fontSize: 10, color: '#374151', marginLeft: 8 }}
                >
                  {player.pos}/{player.age}歳
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#374151' }}>
                {fmtSal(player.salary || 0)}/年
              </div>
            </div>

            {!active && (
              <button
                className="bsm bga"
                style={{
                  marginTop: 8,
                  opacity: gameDay > FOREIGN_DEADLINE_DAY ? 0.5 : 1,
                }}
                disabled={gameDay > FOREIGN_DEADLINE_DAY}
                onClick={() => startNeg(player)}
              >
                交渉開始
              </button>
            )}

            {active && agentNeg && (
              <div
                style={{
                  marginTop: 8,
                  borderTop: '1px solid rgba(100,116,139,.25)',
                  paddingTop: 8,
                  fontSize: 11,
                }}
              >
                {agentNeg.round === 1 && (
                  <>
                    <div style={{ marginBottom: 6, color: '#cbd5e1' }}>
                      希望年俸: {fmtSal(agentNeg.salaryDemand)}/年
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        className="bsm bga"
                        onClick={() =>
                          setAgentNeg((prev) => ({
                            ...prev,
                            round: 2,
                            salaryOffer: prev.salaryDemand,
                          }))
                        }
                      >
                        条件を受ける
                      </button>
                      <button
                        className="bsm bga"
                        onClick={() => {
                          const accepted =
                            rngf(0, 1) < FOREIGN_AGENT_ACCEPT_PROB;
                          if (!accepted) {
                            notify('交渉はまとまりませんでした', 'warn');
                            setAgentNeg(null);
                            return;
                          }
                          setAgentNeg((prev) => ({
                            ...prev,
                            round: 2,
                            salaryOffer: prev.player.salary,
                          }));
                        }}
                      >
                        現年俸で交渉
                      </button>
                      <button
                        className="bsm bgr"
                        onClick={() => setAgentNeg(null)}
                      >
                        中止
                      </button>
                    </div>
                  </>
                )}

                {agentNeg.round === 2 && (
                  <>
                    <div style={{ marginBottom: 6, color: '#cbd5e1' }}>
                      契約年数: {agentNeg.minYears}年
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        className="bsm bga"
                        onClick={() =>
                          signForeignPlayer(
                            agentNeg.player,
                            agentNeg.salaryOffer,
                            agentNeg.minYears,
                          )
                        }
                      >
                        契約する
                      </button>
                      <button
                        className="bsm bgr"
                        onClick={() => setAgentNeg(null)}
                      >
                        中止
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="card-h" style={{ marginTop: 12 }}>
        国内FA・自由契約 ({domesticFaPool.length}人)
      </div>
      {domesticFaPool.length === 0 && (
        <p style={{ color: '#2a3a4c', fontSize: 12 }}>
          現在FA選手はいません
        </p>
      )}
      {domesticFaPool.map((player) => {
        const years = faYears[player.id] || 1;
        const totalCost = (player.salary || 0) * years;
        const canAfford = (myTeam?.budget || 0) >= totalCost;
        return (
          <div key={player.id} className="card2">
            <div className="fsb" style={{ flexWrap: 'wrap', gap: 6 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {player.name}
                </span>
                <span
                  style={{ fontSize: 10, color: '#374151', marginLeft: 8 }}
                >
                  {player.pos}/{player.age}歳 {fmtSal(player.salary || 0)}/年
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 10, color: '#374151' }}>年数:</span>
                {[1, 2, 3].map((value) => (
                  <button
                    key={value}
                    className={`bsm ${years === value ? 'bgb' : 'bga'}`}
                    style={{ padding: '2px 8px' }}
                    onClick={() =>
                      setFaYears((prev) => ({ ...prev, [player.id]: value }))
                    }
                  >
                    {value}年
                  </button>
                ))}
                <button
                  className="bsm bga"
                  style={{ marginLeft: 4, opacity: canAfford ? 1 : 0.4 }}
                  onClick={() => {
                    if (!canAfford) {
                      notify('予算が不足しています', 'warn');
                      return;
                    }
                    const toFarm = (myTeam?.players?.length || 0) >= MAX_ROSTER;
                    upd(myId, (team) => ({
                      ...team,
                      budget: team.budget - totalCost,
                      players: toFarm
                        ? team.players
                        : [
                            ...team.players,
                            {
                              ...player,
                              isFA: false,
                              contractYearsLeft: years,
                              contractYears: years,
                            },
                          ],
                      farm: toFarm
                        ? [
                            ...(team.farm || []),
                            {
                              ...player,
                              isFA: false,
                              contractYearsLeft: years,
                              contractYears: years,
                            },
                          ]
                        : team.farm || [],
                      history: [
                        ...(team.history || []),
                        {
                          ...player,
                          isFA: false,
                          contractYearsLeft: years,
                          contractYears: years,
                          exitYear: year,
                          exitReason: player.isWaiverReleased
                            ? 'waiver_fa'
                            : 'fa',
                          tenure: 0,
                        },
                      ],
                    }));
                    setFaPool((prev) =>
                      prev.filter((entry) => entry.id !== player.id),
                    );
                    setFaYears((prev) => {
                      const next = { ...prev };
                      delete next[player.id];
                      return next;
                    });
                    notify(`${player.name}を契約しました`, 'ok');
                  }}
                >
                  契約
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
