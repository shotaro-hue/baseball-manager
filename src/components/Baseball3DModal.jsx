import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import { calcLandingZone, calcTrajectory } from '../engine/physics';

const HOME = [0, 0.12, 0];
const FIRST = [19.4, 0.12, 19.4];
const SECOND = [0, 0.12, 38.8];
const THIRD = [-19.4, 0.12, 19.4];
const MOUND = [0, 0.18, 18.4];
const REPLAY_DURATION = 2.5;

function sanitizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function validate3DReplayEvent(event) {
  // ⚠️ セキュリティ: 表示前に入力値を検証し、無効値は必ず遮断する
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { ok: false, reason: 'eventがオブジェクトではありません', normalized: null };
  const ev = Number(event.ev);
  const la = Number(event.la);
  if (!Number.isFinite(ev) || !Number.isFinite(la)) return { ok: false, reason: 'event.ev または event.la が有限数ではありません', normalized: null };
  return {
    ok: true,
    reason: '',
    normalized: {
      ...event,
      ev,
      la,
      type: event.type || event.result || 'batted_ball',
    },
  };
}

function StadiumGeometry({ stadium }) {
  const safeLf = Math.max(70, sanitizeNumber(stadium?.lf, 100));
  const safeCf = Math.max(80, sanitizeNumber(stadium?.cf, 120));
  const safeRf = Math.max(70, sanitizeNumber(stadium?.rf, 100));
  const maxFence = Math.max(safeLf, safeCf, safeRf);
  const fieldCenterZ = 22;

  const fencePoints = [
    [-safeLf * 0.72, 2.5, safeLf * 0.7],
    [-safeLf * 0.38, 2.5, safeLf * 0.9],
    [0, 2.5, safeCf],
    [safeRf * 0.38, 2.5, safeRf * 0.9],
    [safeRf * 0.72, 2.5, safeRf * 0.7],
  ];

  const fenceInnerPoints = fencePoints.map(([x, y, z]) => [x * 0.985, y, z * 0.985]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[maxFence * 2.5, maxFence * 2.5]} />
        <meshStandardMaterial color="#0c7a3e" />
      </mesh>

      {[0.35, 0.55, 0.75, 0.95].map((ratio, index) => (
        <mesh key={`grass-ring-${ratio}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012 + index * 0.001, fieldCenterZ]}>
          <ringGeometry args={[maxFence * ratio * 0.45, maxFence * ratio * 0.46, 96]} />
          <meshStandardMaterial color={index % 2 === 0 ? '#0f8d48' : '#0d7f42'} transparent opacity={0.32} />
        </mesh>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, fieldCenterZ]}>
        <circleGeometry args={[20, 48]} />
        <meshStandardMaterial color="#7a5230" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, fieldCenterZ]}>
        <circleGeometry args={[15.5, 48]} />
        <meshStandardMaterial color="#0e8844" />
      </mesh>

      <Line points={[[0, 0.1, 0], [-safeLf * 0.76, 0.1, safeLf * 0.76]]} color="#ffffff" lineWidth={2} />
      <Line points={[[0, 0.1, 0], [safeRf * 0.76, 0.1, safeRf * 0.76]]} color="#ffffff" lineWidth={2} />
      <Line points={fencePoints} color="#94a3b8" lineWidth={6} />
      <Line points={fenceInnerPoints} color="#64748b" lineWidth={3} />
      <Line points={[HOME, FIRST, SECOND, THIRD, HOME]} color="#ffffff" lineWidth={2.5} />

      {/* 外野フェンスの厚み【＝奥行き視認用の帯】 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, fieldCenterZ + maxFence * 0.12]}>
        <ringGeometry args={[maxFence * 0.9, maxFence * 0.915, 96, 1, Math.PI * 0.1, Math.PI * 0.8]} />
        <meshStandardMaterial color="#334155" />
      </mesh>

      {/* ファウルポール */}
      <mesh position={[-safeLf * 0.76, 8.5, safeLf * 0.76]}>
        <cylinderGeometry args={[0.35, 0.35, 17, 12]} />
        <meshStandardMaterial color="#facc15" emissive="#fde047" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[safeRf * 0.76, 8.5, safeRf * 0.76]}>
        <cylinderGeometry args={[0.35, 0.35, 17, 12]} />
        <meshStandardMaterial color="#facc15" emissive="#fde047" emissiveIntensity={0.25} />
      </mesh>

      {/* ベース袋【＝白い塁ベース】 */}
      {[FIRST, SECOND, THIRD].map((basePos, idx) => (
        <mesh key={`base-bag-${idx}`} position={[basePos[0], 0.28, basePos[2]]} rotation={[-Math.PI / 2, Math.PI / 4, 0]}>
          <boxGeometry args={[3.3, 3.3, 0.55]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.7} metalness={0.05} />
        </mesh>
      ))}

      {/* ホームプレート【＝五角形の打席基準点】 */}
      <mesh position={[HOME[0], 0.22, HOME[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.3, 2.3, 0.4, 5]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.75} />
      </mesh>

      <Text position={[-safeLf * 0.52, 3.8, safeLf * 0.98]} fontSize={3.4} color="#e2e8f0" anchorX="center" anchorY="middle">
        LF
      </Text>
      <Text position={[0, 4.2, safeCf + 8]} fontSize={3.8} color="#fde68a" anchorX="center" anchorY="middle">
        CF
      </Text>
      <Text position={[safeRf * 0.52, 3.8, safeRf * 0.98]} fontSize={3.4} color="#e2e8f0" anchorX="center" anchorY="middle">
        RF
      </Text>

      <Text position={[0, 7, safeCf + 14]} fontSize={3.2} color="#fde68a" anchorX="center" anchorY="middle">
        {safeCf}m
      </Text>
      <mesh position={[MOUND[0], MOUND[1], MOUND[2]]}>
        <cylinderGeometry args={[2.7, 2.7, 0.35, 24]} />
        <meshStandardMaterial color="#9a7040" />
      </mesh>
    </group>
  );
}

function BallTrajectory({ ev, la, sprayAngle }) {
  const ballRef = useRef();
  const shadowRef = useRef();
  const [frame, setFrame] = useState(0);
  const azimuth = ((sprayAngle - 45) * Math.PI) / 180;

  const trajectory3D = useMemo(() => {
    const points2D = calcTrajectory(ev, la);
    return points2D.map(([h, y]) => [Math.sin(azimuth) * h, y, Math.cos(azimuth) * h]);
  }, [ev, la, azimuth]);

  const totalFrames = trajectory3D.length;
  const currentIndex = Math.min(frame, Math.max(totalFrames - 1, 0));

  useFrame((_, delta) => {
    if (!ballRef.current || totalFrames <= 1 || currentIndex >= totalFrames - 1) return;
    const advance = Math.max(1, Math.round((totalFrames / REPLAY_DURATION) * delta));
    const nextIndex = Math.min(currentIndex + advance, totalFrames - 1);
    setFrame(nextIndex);
    const [bx, by, bz] = trajectory3D[nextIndex];
    ballRef.current.position.set(bx, by, bz);
    if (shadowRef.current) shadowRef.current.position.set(bx, 0.08, bz);
  });

  if (totalFrames === 0) return null;
  const [lx, ly, lz] = trajectory3D[currentIndex];
  const trail = trajectory3D.slice(0, currentIndex + 1);

  return (
    <>
      <mesh ref={shadowRef} position={[lx, 0.08, lz]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.0, 16]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
      <mesh ref={ballRef} position={[lx, ly, lz]}>
        <sphereGeometry args={[0.7, 20, 20]} />
        <meshStandardMaterial color="#f8fafc" emissive="#fde68a" emissiveIntensity={0.5} />
      </mesh>
      {trail.length > 1 && <Line points={trail} color="#f59e0b" lineWidth={3} transparent opacity={0.85} />}
    </>
  );
}

export default function Baseball3DModal({ event, stadium, onClose }) {
  const closeButtonRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');
  const validation = useMemo(() => validate3DReplayEvent(event), [event]);

  const safeData = useMemo(() => {
    try {
      if (!validation.ok) return null;
      const normalizedEvent = validation.normalized;
      const safeEv = sanitizeNumber(normalizedEvent.ev);
      const safeLa = sanitizeNumber(normalizedEvent.la);
      const safeSpray = sanitizeNumber(normalizedEvent.sprayAngle, 45);
      const safeDist = sanitizeNumber(normalizedEvent.dist);
      const safeZone = calcLandingZone(safeDist, safeSpray, stadium ?? {});
      return { safeEv, safeLa, safeSpray, safeDist, safeZone };
    } catch (_) {
      return null;
    }
  }, [event, stadium, validation]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!validation.ok) {
      setErrorMessage(`再生データが不正です: ${validation.reason}`);
      onClose?.();
      return;
    }
    if (!safeData) {
      setErrorMessage('再生データの読込に失敗しました');
      return;
    }
    setErrorMessage('');
  }, [validation, safeData, onClose]);

  if (typeof onClose !== 'function') return null;

  return (
    <div className="sim-modal-overlay" onClick={onClose} role="presentation">
      <section className="sim-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="物理演算リプレイ">
        <header className="sim-modal-header">
          <div>
            <h2 className="sim-modal-title">⚾ 物理演算リプレイ</h2>
            <p className="sim-modal-subtitle">打球データの3D再生【＝ボール軌道の可視化】</p>
          </div>
          <button ref={closeButtonRef} type="button" className="sim-modal-close-btn" onClick={onClose} aria-label="モーダルを閉じる">×</button>
        </header>

        <div className="sim-modal-body">
          {errorMessage ? (
            <div className="sim-warning">⚠️ {errorMessage}</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div className="sim-chip">打球速度: <strong>{safeData?.safeEv ?? 0}</strong> km/h</div>
                <div className="sim-chip">打球角度: <strong>{safeData?.safeLa ?? 0}</strong>°</div>
                <div className="sim-chip">方向角: <strong>{safeData?.safeSpray ?? 45}</strong>°</div>
                <div className="sim-chip">推定飛距離: <strong>{safeData?.safeDist ?? 0}</strong> m</div>
                <div className="sim-chip">着弾: <strong>{safeData?.safeZone ?? '不明'}</strong></div>
              </div>

              {safeData ? (
                <div style={{ width: '100%', height: 'min(62vh, 560px)', borderRadius: 8, overflow: 'hidden' }}>
                  <Canvas camera={{ position: [0, 62, -48], fov: 48 }}>
                    <ambientLight intensity={0.55} />
                    <directionalLight position={[50, 85, 35]} intensity={1.45} castShadow />
                    <directionalLight position={[-40, 45, -20]} intensity={0.55} />
                    <StadiumGeometry stadium={stadium} />
                    <BallTrajectory ev={safeData.safeEv} la={safeData.safeLa} sprayAngle={safeData.safeSpray} />
                    <OrbitControls target={[0, 10, 74]} minPolarAngle={0.2} maxPolarAngle={1.5} enableZoom zoomSpeed={0.8} />
                  </Canvas>
                </div>
              ) : (
                <div className="sim-warning">⚠️ 再生データの読込に失敗しました</div>
              )}
            </>
          )}
        </div>

        <footer className="sim-modal-footer">
          <button type="button" className="sim-modal-close-btn" onClick={onClose}>閉じる</button>
        </footer>
      </section>
    </div>
  );
}
