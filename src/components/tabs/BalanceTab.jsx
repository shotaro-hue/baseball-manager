import { useState, useMemo, useCallback } from 'react';
import { simAtBat, BASELINE, ABILITY_RANGE, DEFAULT_LEAGUE_ENV, _resolveBattedBallOutcomeFromPhysics_TEST, STADIUMS } from '../../engine/simulation';

/* ================================================================
   BALANCE TAB
   シミュレーションエンジンのバランス検証画面。
   ① シーズン実績（リーグ全体集計）
   ② クイックシム（合成選手 800PA × 3パターン）
   ③ 現在のバランス設定値（ABILITY_RANGE 参照）
================================================================ */

// NPB 2024 ベースライン参照値
// BA = (s+d+t+hr) / (1-bb-hbp) = 0.2242 / 0.9178 ≈ 0.244
const REF = {
  ba:    0.244,
  kPct:  BASELINE.k,    // 0.199
  bbPct: BASELINE.bb,   // 0.0727
  hrPct: BASELINE.hr,   // 0.0175
  era:   3.50,
};

// ── 合成選手ファクトリ ──────────────────────────────────────────
function mkBat(a) {
  return {
    batting: { contact: a, power: a, eye: a, speed: a, clutch: 50, vsLeft: 50, breakingBall: 50 },
    condition: 100, morale: 70,
  };
}
function mkPit(a) {
  return {
    pitching: { velocity: a, control: a, breaking: a, variety: 50, stamina: 60 },
    condition: 100, morale: 70, hand: 'right', subtype: '先発',
  };
}

// ── N 打席シミュレーション ────────────────────────────────────
function runPASim(bat, pit, n, leagueEnv = DEFAULT_LEAGUE_ENV) {
  const c = {};
  const safeN = Number.isFinite(Number(n)) ? Math.max(1, Math.floor(Number(n))) : 1;
  const stadium = STADIUMS.tokyo_dome;
  for (let i = 0; i < safeN; i++) {
    const { result } = simAtBat(bat, pit, 'normal', 0, { stadium: 'tokyo_dome' }, leagueEnv);
    if (result === 'inplay') {
      const resolved = _resolveBattedBallOutcomeFromPhysics_TEST(bat, pit, stadium, {}, {});
      const finalResult = resolved?.result || 'out';
      c[finalResult] = (c[finalResult] || 0) + 1;
    } else {
      c[result] = (c[result] || 0) + 1;
    }
  }
  const h  = (c.s || 0) + (c.d || 0) + (c.t || 0) + (c.hr || 0);
  const ab = safeN - (c.bb || 0) - (c.hbp || 0);
  return {
    ba:    ab > 0 ? h / ab : 0,
    kPct:  (c.k  || 0) / safeN,
    bbPct: (c.bb || 0) / safeN,
    hrPct: (c.hr || 0) / safeN,
  };
}

function simulatePhysicsProfile(batter, pitcher, totalPa, leagueEnv = DEFAULT_LEAGUE_ENV) {
  // ⚠️ セキュリティ: 入力値を検証して無害化【＝異常値を安全な範囲へ補正】
  const safePa = Number.isFinite(Number(totalPa)) ? Math.max(1, Math.floor(Number(totalPa))) : 1;
  const safeBatter = batter && typeof batter === 'object' ? batter : mkBat(50);
  const safePitcher = pitcher && typeof pitcher === 'object' ? pitcher : mkPit(60);
  const stadium = STADIUMS.tokyo_dome;
  const count = { pa: 0, bip: 0, hr: 0, k: 0, bb: 0, hbp: 0, out: 0, s: 0, d: 0, t: 0, evSum: 0, laSum: 0, distSum: 0, q: { weak: 0, normal: 0, solid: 0, hard: 0, barrel: 0 } };
  for (let i = 0; i < safePa; i += 1) {
    const atBat = simAtBat(safeBatter, safePitcher, 'normal', 0, { stadium: 'tokyo_dome' }, leagueEnv);
    const paResult = atBat?.result || 'out';
    count.pa += 1;
    if (paResult === 'k' || paResult === 'bb' || paResult === 'hbp') {
      count[paResult] += 1;
      continue;
    }
    if (paResult !== 'inplay') continue;
    count.bip += 1;
    const resolved = _resolveBattedBallOutcomeFromPhysics_TEST(safeBatter, safePitcher, stadium, {}, {});
    const resolvedResult = resolved?.result || 'out';
    if (count[resolvedResult] !== undefined) count[resolvedResult] += 1;
    const meta = resolved?.physicsMeta || {};
    const quality = ['weak', 'normal', 'solid', 'hard', 'barrel'].includes(meta.quality) ? meta.quality : 'normal';
    count.evSum += Number(meta.ev) || 0;
    count.laSum += Number(meta.la) || 0;
    count.distSum += Number(meta.distance) || 0;
    count.q[quality] += 1;
  }
  const denominatorBip = Math.max(1, count.bip);
  return {
    pa: count.pa,
    bip: count.bip,
    hrPerBip: count.hr / denominatorBip,
    hrPerPa: count.hr / Math.max(1, count.pa),
    teamHrPerGame: (count.hr / Math.max(1, count.pa)) * 38,
    avgEv: count.evSum / denominatorBip,
    avgLa: count.laSum / denominatorBip,
    avgDistance: count.distSum / denominatorBip,
    qualityRate: Object.fromEntries(Object.entries(count.q).map(([k, v]) => [k, v / denominatorBip])),
  };
}

// ── 差分セル ─────────────────────────────────────────────────
// invert=true → 値が高いほど投手有利（K率・ERA は逆方向）
// invert=false → 値が高いほど打者有利（BA・HR率等は通常方向）
function Diff({ val, baseline, fmt, invert = false }) {
  const d   = val - baseline;
  const ok  = Math.abs(d) < baseline * 0.08;
  const good = invert ? d < 0 : d > 0;
  const color = ok ? '#94a3b8' : good ? '#34d399' : '#f87171';
  return (
    <span className="mono" style={{ color, fontSize: 11 }}>
      {d >= 0 ? '+' : ''}{fmt(d)}
    </span>
  );
}

function StatusBadge({ val, baseline, invert = false }) {
  const d = val - baseline;
  if (Math.abs(d) < baseline * 0.10) return <span style={{ color: '#94a3b8', fontSize: 10 }}>正常</span>;
  const good  = invert ? d < 0 : d > 0;
  const color = good ? '#34d399' : '#f87171';
  const text  = good ? '打者有利' : '投手有利';
  return <span style={{ color, fontSize: 10, fontWeight: 700 }}>{text}</span>;
}

// ── メインコンポーネント ──────────────────────────────────────
export function BalanceTab({ teams, myTeam }) {
  const [simRows, setSimRows] = useState([]);
  const [busy, setBusy]       = useState(false);
  const [mcBusy, setMcBusy] = useState(false);
  const [mcError, setMcError] = useState('');
  const [mcRows, setMcRows] = useState([]);

  const leagueEnv = myTeam?.leagueEnv || DEFAULT_LEAGUE_ENV;

  // Section 1: リーグ全体集計
  const league = useMemo(() => {
    let PA = 0, H = 0, AB = 0, HR = 0, K = 0, BB = 0, IP = 0, ER = 0;
    (teams || []).forEach(t =>
      (t.players || []).forEach(p => {
        if (p.isPitcher) {
          IP += p.stats?.IP || 0;
          ER += p.stats?.ER || 0;
        } else {
          PA += p.stats?.PA  || 0;
          H  += p.stats?.H   || 0;
          AB += p.stats?.AB  || 0;
          HR += p.stats?.HR  || 0;
          K  += p.stats?.K   || 0;
          BB += p.stats?.BB  || 0;
        }
      })
    );
    if (PA < 100) return null;
    return {
      PA,
      ba:    AB > 0 ? H  / AB : 0,
      kPct:  PA > 0 ? K  / PA : 0,
      bbPct: PA > 0 ? BB / PA : 0,
      hrPct: PA > 0 ? HR / PA : 0,
      era:   IP > 0 ? ER * 9 / IP : null,
    };
  }, [teams]);

  // Section 2: クイックシム実行
  const doSim = useCallback(() => {
    setBusy(true);
    setTimeout(() => {
      const N = 800;
      setSimRows([
        { label: '平均打者 (50) vs 平均投手 (55)', ...runPASim(mkBat(50), mkPit(55), N, leagueEnv) },
        { label: '強打者 (70) vs 強投手 (70)',     ...runPASim(mkBat(70), mkPit(70), N, leagueEnv) },
        { label: '一流打者 (85) vs 一流投手 (85)', ...runPASim(mkBat(85), mkPit(85), N, leagueEnv) },
      ]);
      setBusy(false);
    }, 10);
  }, [leagueEnv]);

  const pct  = v => `${(v * 100).toFixed(1)}%`;
  const ba3  = v => v.toFixed(3);
  const ppFmt = d => `${(d * 100).toFixed(2)}pp`;
  const baFmt = d => d.toFixed(3);
  const eraFmt = d => d.toFixed(2);

  // 打者有利かどうかでセルを色付け（クイックシム用）
  const batColor = (val, ref, invert = false) => {
    const d   = val - ref;
    const ok  = Math.abs(d) < ref * 0.08;
    if (ok) return '#94a3b8';
    const good = invert ? d < 0 : d > 0;
    return good ? '#34d399' : '#f87171';
  };

  const doMonteCarloValidation = useCallback(() => {
    if (mcBusy) return;
    setMcBusy(true);
    setMcError('');
    setTimeout(() => {
      try {
        const TOTAL_PA = 8000;
        const stadium = STADIUMS.tokyo_dome;
        const pitcher = { pitching: { velocity: 60, breaking: 60, control: 60 }, condition: 100, morale: 70 };
        const profiles = [
          { label: 'power70', batting: { power: 70, contact: 55, eye: 50, speed: 50, clutch: 50, vsLeft: 50, breakingBall: 50 } },
          { label: 'power80', batting: { power: 80, contact: 58, eye: 50, speed: 50, clutch: 50, vsLeft: 50, breakingBall: 50 } },
          { label: 'power90', batting: { power: 90, contact: 60, eye: 50, speed: 50, clutch: 50, vsLeft: 50, breakingBall: 50 } },
        ];
        const nextRows = profiles.map((profile) => ({
          label: profile.label,
          ...simulatePhysicsProfile({ batting: profile.batting, condition: 100, morale: 70 }, pitcher, TOTAL_PA, leagueEnv),
        }));
        setMcRows(nextRows);
      } catch (error) {
        // ⚠️ セキュリティ: 例外を握り潰さず、機密情報を含まない安全な文言で表示
        setMcError(error instanceof Error ? error.message : 'Monte Carlo検証で不明なエラーが発生しました。');
      } finally {
        setMcBusy(false);
      }
    }, 10);
  }, [mcBusy, leagueEnv]);

  const monteCarloRecommendation = useMemo(() => {
    if (!Array.isArray(mcRows) || mcRows.length === 0) return null;
    const validRows = mcRows.filter((row) => Number.isFinite(row?.teamHrPerGame));
    if (validRows.length === 0) return null;
    const avgTeamHrPerGame = validRows.reduce((sum, row) => sum + row.teamHrPerGame, 0) / validRows.length;
    const baselineTeamHrPerGame = BASELINE.hr * 38;
    const ratio = baselineTeamHrPerGame > 0 ? avgTeamHrPerGame / baselineTeamHrPerGame : 1;
    const percentGap = (ratio - 1) * 100;

    let recommendation = '現状維持';
    let adjustmentDirection = '調整不要';
    if (ratio > 1.15) {
      recommendation = '長打抑制を推奨';
      adjustmentDirection = '打球の強さを下げる方向';
    } else if (ratio < 0.85) {
      recommendation = '長打増加を推奨';
      adjustmentDirection = '打球の強さを上げる方向';
    }

    return {
      avgTeamHrPerGame,
      baselineTeamHrPerGame,
      ratio,
      percentGap,
      recommendation,
      adjustmentDirection,
      recommendedMultiplier: Number.isFinite(ratio) && ratio > 0 ? 1 / ratio : 1,
    };
  }, [mcRows]);

  return (
    <div>

      {/* ═══════════════════════════════════════
          Section 1: シーズン実績（リーグ全体）
      ═══════════════════════════════════════ */}
      <div className="card">
        <div className="card-h">
          📊 シーズン実績（リーグ全体）
          {league && (
            <span style={{ fontSize: 10, color: '#374151', marginLeft: 8 }}>
              {league.PA.toLocaleString()} PA 集計
            </span>
          )}
        </div>
        {!league ? (
          <p style={{ color: '#374151', fontSize: 12, margin: '6px 0 0' }}>
            試合が進むと集計されます（目安: 5試合以上）
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>指標</th>
                  <th>実績値</th>
                  <th>NPB基準</th>
                  <th>差</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: '打率',   val: league.ba,    baseline: REF.ba,    fmtV: ba3,  fmtD: baFmt,  invert: false },
                  { label: '三振率', val: league.kPct,  baseline: REF.kPct,  fmtV: pct,  fmtD: ppFmt,  invert: true  },
                  { label: '四球率', val: league.bbPct, baseline: REF.bbPct, fmtV: pct,  fmtD: ppFmt,  invert: false },
                  { label: 'HR率',   val: league.hrPct, baseline: REF.hrPct, fmtV: pct,  fmtD: ppFmt,  invert: false },
                  ...(league.era != null
                    ? [{ label: 'ERA', val: league.era, baseline: REF.era, fmtV: v => v.toFixed(2), fmtD: eraFmt, invert: false }]
                    : []),
                ].map(({ label, val, baseline, fmtV, fmtD, invert }) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="mono">{fmtV(val)}</td>
                    <td className="mono" style={{ color: '#374151' }}>{fmtV(baseline)}</td>
                    <td><Diff val={val} baseline={baseline} fmt={fmtD} invert={invert} /></td>
                    <td><StatusBadge val={val} baseline={baseline} invert={invert} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-h" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>🧪 物理HR Monte Carlo検証（リーグ分析タブ内実行）</span>
          <button className="bsm bga" onClick={doMonteCarloValidation} disabled={mcBusy}>
            {mcBusy ? '検証中…' : '▶ 検証実行'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#374151', margin: '4px 0 8px' }}>
          HR/BIP【＝本塁打 ÷ インプレー打球数】や平均EV【＝打球初速】・LA【＝打球角度】を、ゲーム画面上で直接確認できます。
        </p>
        {mcError && <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8 }}>⚠️ {mcError}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>プロファイル</th><th>PA</th><th>BIP</th><th>HR/BIP</th><th>HR/PA</th><th>team HR/game</th><th>平均EV</th><th>平均LA</th><th>平均飛距離</th>
              </tr>
            </thead>
            <tbody>
              {!mcBusy && mcRows.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', fontSize: 11, color: '#374151' }}>「検証実行」を押すと結果が表示されます</td></tr>}
              {mcBusy && <tr><td colSpan={9} style={{ textAlign: 'center', color: '#f5c842' }}>検証中…</td></tr>}
              {mcRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td><td className="mono">{row.pa.toLocaleString()}</td><td className="mono">{row.bip.toLocaleString()}</td><td className="mono">{(row.hrPerBip * 100).toFixed(2)}%</td><td className="mono">{(row.hrPerPa * 100).toFixed(2)}%</td><td className="mono">{row.teamHrPerGame.toFixed(2)}</td><td className="mono">{row.avgEv.toFixed(1)}</td><td className="mono">{row.avgLa.toFixed(1)}</td><td className="mono">{row.avgDistance.toFixed(1)}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {monteCarloRecommendation && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#d1d5db', lineHeight: 1.6 }}>
            <div>
              基準比較: 平均 team HR/game は <span className="mono">{monteCarloRecommendation.avgTeamHrPerGame.toFixed(2)}</span>、
              2024NPB基準は <span className="mono">{monteCarloRecommendation.baselineTeamHrPerGame.toFixed(2)}</span> です。
            </div>
            <div>
              乖離率【＝基準との差の割合】: <span className="mono">{monteCarloRecommendation.percentGap >= 0 ? '+' : ''}{monteCarloRecommendation.percentGap.toFixed(1)}%</span> /
              推奨: <b>{monteCarloRecommendation.recommendation}</b>（{monteCarloRecommendation.adjustmentDirection}）。
            </div>
            <div>
              推奨調整量【＝目標値へ近づける倍率】:
              <span className="mono"> ×{monteCarloRecommendation.recommendedMultiplier.toFixed(3)}</span>
              （1.000に近いほど微調整で十分）。
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════
          Section 2: クイックシム検証
      ═══════════════════════════════════════ */}
      <div className="card">
        <div className="card-h" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>🎯 クイックシム（800 PA × 3 パターン）</span>
          <button className="bsm bga" onClick={doSim} disabled={busy}>
            {busy ? '計算中…' : '▶ 実行'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#374151', margin: '4px 0 8px' }}>
          現在のエンジン設定で合成選手を800打席シミュレーション。NPBベースラインとの乖離を確認できます。
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>マッチアップ</th>
                <th>打率</th>
                <th>K率</th>
                <th>BB率</th>
                <th>HR率</th>
              </tr>
            </thead>
            <tbody>
              {/* NPB基準行 */}
              <tr style={{ opacity: 0.6 }}>
                <td style={{ fontSize: 11, fontStyle: 'italic' }}>NPBベースライン (2024)</td>
                <td className="mono">{ba3(REF.ba)}</td>
                <td className="mono">{pct(REF.kPct)}</td>
                <td className="mono">{pct(REF.bbPct)}</td>
                <td className="mono">{pct(REF.hrPct)}</td>
              </tr>
              {/* 状態表示 */}
              {!busy && simRows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: '#374151', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
                    「実行」を押すと結果が表示されます
                  </td>
                </tr>
              )}
              {busy && (
                <tr>
                  <td colSpan={5} style={{ color: '#f5c842', textAlign: 'center', padding: '12px 0' }}>
                    計算中…
                  </td>
                </tr>
              )}
              {/* シム結果行 */}
              {simRows.map(r => (
                <tr key={r.label}>
                  <td style={{ fontSize: 11 }}>{r.label}</td>
                  <td className="mono" style={{ color: batColor(r.ba,    REF.ba,    false) }}>{ba3(r.ba)}</td>
                  <td className="mono" style={{ color: batColor(r.kPct,  REF.kPct,  true)  }}>{pct(r.kPct)}</td>
                  <td className="mono">{pct(r.bbPct)}</td>
                  <td className="mono" style={{ color: batColor(r.hrPct, REF.hrPct, false) }}>{pct(r.hrPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          Section 3: バランス設定値（エンジン定数）
      ═══════════════════════════════════════ */}
      <div className="card">
        <div className="card-h">⚙️ 現在のバランス設定値（エンジン定数）</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>設定項目</th>
                <th>現在値</th>
                <th>NPB基準</th>
                <th>説明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>一流打者 安打率天井</div>
                  <div style={{ fontSize: 10, color: '#374151' }}>contact=99</div>
                </td>
                <td className="mono" style={{ color: '#f5c842' }}>{pct(ABILITY_RANGE.contact.hi)}</td>
                <td className="mono" style={{ color: '#374151' }}>{pct(BASELINE.s)}</td>
                <td style={{ fontSize: 10, color: '#374151' }}>最優秀打者が単打を打てる確率の天井</td>
              </tr>
              <tr>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>最上位投手 K率上限</div>
                  <div style={{ fontSize: 10, color: '#374151' }}>p_stuff=99</div>
                </td>
                <td className="mono" style={{ color: '#f5c842' }}>{pct(ABILITY_RANGE.p_stuff.hi)}</td>
                <td className="mono" style={{ color: '#374151' }}>{pct(BASELINE.k)}</td>
                <td style={{ fontSize: 10, color: '#374151' }}>最強投手の三振確率の上限（高すぎると投高打低）</td>
              </tr>
              <tr>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>一流打者 HR率天井</div>
                  <div style={{ fontSize: 10, color: '#374151' }}>power=99</div>
                </td>
                <td className="mono" style={{ color: '#f5c842' }}>{pct(ABILITY_RANGE.power.hi)}</td>
                <td className="mono" style={{ color: '#374151' }}>{pct(BASELINE.hr)}</td>
                <td style={{ fontSize: 10, color: '#374151' }}>最強打者の本塁打確率の上限</td>
              </tr>
              <tr>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>一流打者 四球率天井</div>
                  <div style={{ fontSize: 10, color: '#374151' }}>eye=99</div>
                </td>
                <td className="mono" style={{ color: '#f5c842' }}>{pct(ABILITY_RANGE.eye.hi)}</td>
                <td className="mono" style={{ color: '#374151' }}>{pct(BASELINE.bb)}</td>
                <td style={{ fontSize: 10, color: '#374151' }}>最高選球眼の打者が四球を選べる確率の天井</td>
              </tr>
              <tr>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>単打抑制係数</div>
                  <div style={{ fontSize: 10, color: '#374151' }}>pitStuff=80 の効果</div>
                </td>
                <td className="mono" style={{ color: '#f5c842' }}>÷400 → −7.5%</td>
                <td className="mono" style={{ color: '#374151' }}>旧: ÷300 → −10%</td>
                <td style={{ fontSize: 10, color: '#374151' }}>エース投手が相手安打率を下げる最大効果（小さいほど打者有利）</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 10, color: '#374151', marginTop: 8 }}>
          ※ 値を変更するには <code style={{ background: 'rgba(255,255,255,.06)', padding: '1px 4px', borderRadius: 3 }}>src/engine/simulation.js</code> の ABILITY_RANGE を編集してください。
        </p>
      </div>

    </div>
  );
}
