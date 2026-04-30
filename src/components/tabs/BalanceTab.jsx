import { useState, useMemo, useCallback } from 'react';
import { simAtBat, BASELINE, ABILITY_RANGE, DEFAULT_LEAGUE_ENV } from '../../engine/simulation';

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
  for (let i = 0; i < n; i++) {
    const { result } = simAtBat(bat, pit, 'normal', 0, {}, leagueEnv);
    c[result] = (c[result] || 0) + 1;
  }
  const h  = (c.s || 0) + (c.d || 0) + (c.t || 0) + (c.hr || 0);
  const ab = n - (c.bb || 0) - (c.hbp || 0);
  return {
    ba:    ab > 0 ? h / ab : 0,
    kPct:  (c.k  || 0) / n,
    bbPct: (c.bb || 0) / n,
    hrPct: (c.hr || 0) / n,
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

// ── リーグ環境ノブ定義 ─────────────────────────────────────
const KNOB_DEFS = [
  { key: 'kMod',   label: '三振率補正',   desc: '1.0=基準, <1で投手の三振が減る（打者有利）',   min: 0.70, max: 1.30, step: 0.01, invertColor: true  },
  { key: 'hitMod', label: '安打率補正',   desc: '1.0=基準, >1で安打が増える（打者有利）',       min: 0.70, max: 1.30, step: 0.01, invertColor: false },
  { key: 'hrMod',  label: '本塁打率補正', desc: '1.0=基準, >1でホームランが増える（打者有利）', min: 0.70, max: 1.50, step: 0.01, invertColor: false },
  { key: 'bbMod',  label: '四球率補正',   desc: '1.0=基準, >1で四球が増える（打者有利）',       min: 0.70, max: 1.30, step: 0.01, invertColor: false },
];

// ── メインコンポーネント ──────────────────────────────────────
export function BalanceTab({ teams, myTeam, upd, myId }) {
  const [simRows, setSimRows] = useState([]);
  const [busy, setBusy]       = useState(false);

  const leagueEnv = myTeam?.leagueEnv || DEFAULT_LEAGUE_ENV;

  const setKnob = useCallback((key, raw) => {
    if (!upd || !myId) return;
    const value = parseFloat(raw);
    if (isNaN(value)) return;
    upd(myId, t => ({ ...t, leagueEnv: { ...(t.leagueEnv || DEFAULT_LEAGUE_ENV), [key]: value } }));
  }, [upd, myId]);

  const resetKnobs = useCallback(() => {
    if (!upd || !myId) return;
    upd(myId, t => ({ ...t, leagueEnv: { ...DEFAULT_LEAGUE_ENV } }));
  }, [upd, myId]);

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
          Section 3: リーグ環境ノブ
      ═══════════════════════════════════════ */}
      {myTeam && upd && (
        <div className="card">
          <div className="card-h" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>🎛️ リーグ環境設定</span>
            <button className="bsm" style={{ background: 'rgba(255,255,255,.08)', fontSize: 10 }} onClick={resetKnobs}>
              リセット
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#374151', margin: '4px 0 10px' }}>
            シミュレーションエンジンに適用されるリーグ全体の環境係数を調整できます。<br />
            変更は次の試合から反映されます。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {KNOB_DEFS.map(({ key, label, desc, min, max, step, invertColor }) => {
              const val = leagueEnv[key] ?? DEFAULT_LEAGUE_ENV[key];
              const diff = val - 1.00;
              const isNeutral = Math.abs(diff) < 0.005;
              const isBatterFavor = invertColor ? diff < -0.005 : diff > 0.005;
              const dotColor = isNeutral ? '#94a3b8' : isBatterFavor ? '#34d399' : '#f87171';
              return (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, minWidth: 80 }}>{label}</span>
                    <span className="mono" style={{ color: dotColor, fontSize: 13, minWidth: 36 }}>{val.toFixed(2)}</span>
                    <span style={{ fontSize: 10, color: dotColor }}>
                      {isNeutral ? '基準値' : isBatterFavor ? '打者有利' : '投手有利'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: '#374151', minWidth: 28 }}>{min.toFixed(2)}</span>
                    <input
                      type="range"
                      min={min} max={max} step={step}
                      value={val}
                      onChange={e => setKnob(key, e.target.value)}
                      style={{ flex: 1, accentColor: dotColor }}
                    />
                    <span style={{ fontSize: 10, color: '#374151', minWidth: 28 }}>{max.toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#374151', marginTop: 2 }}>{desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          Section 4: バランス設定値（エンジン定数）
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
