import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { simAtBat, BASELINE, DEFAULT_LEAGUE_ENV, resolveBattedBallOutcomeFromPhysicsForBalance, STADIUMS } from '../../engine/simulation';
import { BATCH_SIM_MESSAGE_TYPE } from '../../workers/batchSimulationProtocol';

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
      const resolved = resolveBattedBallOutcomeFromPhysicsForBalance(bat, pit, stadium, {}, { leagueEnv });
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
    const resolved = resolveBattedBallOutcomeFromPhysicsForBalance(safeBatter, safePitcher, stadium, {}, { leagueEnv });
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



const LEAGUE_ENV_SLIDER_CONFIG = [
  { key: 'evMod', label: 'EV補正', min: 0.9, max: 1.1, step: 0.01, desc: '打球速度全体を補正' },
  { key: 'laMod', label: 'LA補正', min: -5, max: 5, step: 0.1, desc: '打球角度へ加算補正' },
  { key: 'barrelRateMod', label: 'バレル率補正', min: 0.5, max: 1.5, step: 0.01, desc: 'バレル発生率を補正' },
  { key: 'hardRateMod', label: '強打球率補正', min: 0.7, max: 1.3, step: 0.01, desc: 'hard発生率を補正' },
  { key: 'wallHeightMod', label: 'フェンス高さ補正', min: 0.8, max: 1.3, step: 0.01, desc: 'HR判定の厳しさを補正' },
  { key: 'catchMod', label: '捕球補正', min: 0.8, max: 1.2, step: 0.01, desc: '外野守備の捕球成功率を補正' },
  { key: 'kMod', label: '三振補正', min: 0.7, max: 1.3, step: 0.01, desc: '三振発生率を補正' },
  { key: 'bbMod', label: '四球補正', min: 0.7, max: 1.3, step: 0.01, desc: '四球発生率を補正' },
];

function sanitizeLeagueEnvValue(rawValue, min, max, fallback) {
  const numericValue = Number(rawValue);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 1;
  if (!Number.isFinite(numericValue)) return safeFallback;
  return Math.min(max, Math.max(min, numericValue));
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
export function BalanceTab({ teams, myTeam, upd, myId }) {
  const [simRows, setSimRows] = useState([]);
  const [busy, setBusy]       = useState(false);
  const [mcBusy, setMcBusy] = useState(false);
  const [mcError, setMcError] = useState('');
  const [mcRows, setMcRows] = useState([]);
  const [mcProgress, setMcProgress] = useState(null);
  const workerRef = useRef(null);
  const taskIdRef = useRef(null);

  const leagueEnv = { ...DEFAULT_LEAGUE_ENV, ...(myTeam?.leagueEnv || {}) };

  const handleLeagueEnvSliderChange = useCallback((key, rawValue) => {
    const sliderDef = LEAGUE_ENV_SLIDER_CONFIG.find((item) => item.key === key);
    if (!sliderDef || typeof upd !== 'function' || !myId) return;
    const sanitizedValue = sanitizeLeagueEnvValue(rawValue, sliderDef.min, sliderDef.max, leagueEnv[key]);
    upd(myId, (team) => ({
      ...team,
      leagueEnv: {
        ...(team?.leagueEnv || DEFAULT_LEAGUE_ENV),
        [key]: Number(sanitizedValue.toFixed(2)),
      },
    }));
  }, [leagueEnv, myId, upd]);

  const handleResetLeagueEnv = useCallback(() => {
    if (typeof upd !== 'function' || !myId) return;
    upd(myId, (team) => ({
      ...team,
      leagueEnv: { ...DEFAULT_LEAGUE_ENV },
    }));
  }, [myId, upd]);


  useEffect(() => {
    const worker = new Worker(new URL('../../workers/batchSimulationWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const msg = event.data;
      if (!msg || !taskIdRef.current || msg?.payload?.taskId !== taskIdRef.current) return;
      if (msg.type === BATCH_SIM_MESSAGE_TYPE.START) {
        setMcProgress((prev) => prev || { completedPa: 0, totalPa: 0 });
      } else if (msg.type === BATCH_SIM_MESSAGE_TYPE.PROGRESS) {
        setMcProgress({ completedPa: msg.payload.completedPa, totalPa: msg.payload.totalPa });
      } else if (msg.type === BATCH_SIM_MESSAGE_TYPE.DONE) {
        setMcRows(Array.isArray(msg.payload.detailResults) ? msg.payload.detailResults : []);
        setMcBusy(false);
        setMcProgress(null);
        taskIdRef.current = null;
      } else if (msg.type === BATCH_SIM_MESSAGE_TYPE.ERROR) {
        setMcError(msg.payload?.message || 'Workerエラーが発生しました。');
        setMcBusy(false);
        setMcProgress(null);
        taskIdRef.current = null;
      } else if (msg.type === BATCH_SIM_MESSAGE_TYPE.CANCEL) {
        setMcBusy(false);
        setMcProgress(null);
        taskIdRef.current = null;
      }
    };
    return () => { worker.terminate(); };
  }, []);
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
      const N = 10000;
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
    if (mcBusy || !workerRef.current) return;
    setMcBusy(true);
    setMcError('');
    setMcProgress({ completedPa: 0, totalPa: 50000 });
    const TOTAL_PA = 10000;
    const pitcher = { pitching: { velocity: 60, breaking: 60, control: 60 }, condition: 100, morale: 70 };
    const profiles = [
      { label: '平均打者', batter: { batting: { power: 50, contact: 50, eye: 50, speed: 50, clutch: 50, vsLeft: 50, breakingBall: 50 }, condition: 100, morale: 70 }, pitcher, totalPa: TOTAL_PA },
      { label: '準主力', batter: { batting: { power: 60, contact: 55, eye: 50, speed: 50, clutch: 50, vsLeft: 50, breakingBall: 50 }, condition: 100, morale: 70 }, pitcher, totalPa: TOTAL_PA },
      { label: '中距離', batter: { batting: { power: 70, contact: 55, eye: 50, speed: 50, clutch: 50, vsLeft: 50, breakingBall: 50 }, condition: 100, morale: 70 }, pitcher, totalPa: TOTAL_PA },
      { label: '主力長距離', batter: { batting: { power: 80, contact: 58, eye: 50, speed: 50, clutch: 50, vsLeft: 50, breakingBall: 50 }, condition: 100, morale: 70 }, pitcher, totalPa: TOTAL_PA },
      { label: '球界トップ級', batter: { batting: { power: 90, contact: 60, eye: 50, speed: 50, clutch: 50, vsLeft: 50, breakingBall: 50 }, condition: 100, morale: 70 }, pitcher, totalPa: TOTAL_PA },
    ];
    const taskId = `mc-${Date.now()}`;
    taskIdRef.current = taskId;
    workerRef.current.postMessage({ type: BATCH_SIM_MESSAGE_TYPE.START, payload: { taskId, profiles, leagueEnv, seed: Date.now() } });
  }, [leagueEnv, mcBusy]);


