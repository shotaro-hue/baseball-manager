import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import { calcLandingZone, calcTrajectory } from '../engine/physics';

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const contentStyle = { width: 'min(980px, 96vw)', height: 'min(72vh, 580px)', position: 'relative', background: '#0a1628', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' };

// Base diamond corners (27.4m bases at 45° foul lines)
const HOME = [0, 0.12, 0];
const FIRST = [19.4, 0.12, 19.4];
const SECOND = [0, 0.12, 38.8];
const THIRD = [-19.4, 0.12, 19.4];
const MOUND = [0, 0.18, 18.4];

function StadiumGeometry({ stadium }) {
  const maxFence = Math.max(stadium.lf, stadium.cf, stadium.rf);
  const fencePoints = [
    [-stadium.lf * 0.72, 2.5, stadium.lf * 0.7],
    [-stadium.lf * 0.38, 2.5, stadium.lf * 0.9],
    [0, 2.5, stadium.cf],
    [stadium.rf * 0.38, 2.5, stadium.rf * 0.9],
    [stadium.rf * 0.72, 2.5, stadium.rf * 0.7],
  ];
  const lfPoleX = -stadium.lf * 0.72;
  const lfPoleZ = stadium.lf * 0.7;
  const rfPoleX = stadium.rf * 0.72;
  const rfPoleZ = stadium.rf * 0.7;

  return (
    <group>
      {/* Outfield grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[maxFence * 2.4, maxFence * 2.4]} />
        <meshStandardMaterial color="#0c7a3e" />
      </mesh>
      {/* Infield dirt ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 22]}>
        <circleGeometry args={[20, 48]} />
        <meshStandardMaterial color="#7a5230" />
      </mesh>
      {/* Inner grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 22]}>
        <circleGeometry args={[15.5, 48]} />
        <meshStandardMaterial color="#0e8844" />
      </mesh>

      {/* Foul lines */}
      <Line points={[[0, 0.1, 0], [-stadium.lf * 0.76, 0.1, stadium.lf * 0.76]]} color="#ffffff" lineWidth={2} />
      <Line points={[[0, 0.1, 0], [stadium.rf * 0.76, 0.1, stadium.rf * 0.76]]} color="#ffffff" lineWidth={2} />
      {/* Outfield fence */}
      <Line points={fencePoints} color="#94a3b8" lineWidth={6} />

      {/* Foul poles */}
      <mesh position={[lfPoleX, 6, lfPoleZ]}>
        <cylinderGeometry args={[0.4, 0.4, 12, 8]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
      <mesh position={[rfPoleX, 6, rfPoleZ]}>
        <cylinderGeometry args={[0.4, 0.4, 12, 8]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>

      {/* Base diamond */}
      <Line points={[HOME, FIRST, SECOND, THIRD, HOME]} color="#ffffff" lineWidth={2.5} />
      {/* Base squares */}
      {[FIRST, SECOND, THIRD].map(([bx, by, bz], i) => (
        <mesh key={i} position={[bx, by + 0.05, bz]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
          <planeGeometry args={[2.2, 2.2]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}
      {/* Home plate */}
      <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[2.4, 2.4]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {/* Pitcher's mound */}
      <mesh position={[MOUND[0], MOUND[1], MOUND[2]]}>
        <cylinderGeometry args={[2.7, 2.7, 0.35, 24]} />
        <meshStandardMaterial color="#9a7040" />
      </mesh>

      {/* Fence distance labels */}
      <Text position={[lfPoleX * 0.6, 4, lfPoleZ * 0.6]} fontSize={4} color="#fde68a" anchorX="center" anchorY="middle">
        {stadium.lf}m
      </Text>
      <Text position={[0, 4, stadium.cf + 6]} fontSize={4} color="#fde68a" anchorX="center" anchorY="middle">
        {stadium.cf}m
      </Text>
      <Text position={[rfPoleX * 0.6, 4, rfPoleZ * 0.6]} fontSize={4} color="#fde68a" anchorX="center" anchorY="middle">
        {stadium.rf}m
      </Text>

      {/* Field direction labels */}
      <Text position={[-stadium.lf * 0.82, 0.5, stadium.lf * 0.82]} fontSize={3.5} color="#cbd5e1" anchorX="center">LF</Text>
      <Text position={[0, 0.5, stadium.cf + 10]} fontSize={3.5} color="#cbd5e1" anchorX="center">CF</Text>
      <Text position={[stadium.rf * 0.82, 0.5, stadium.rf * 0.82]} fontSize={3.5} color="#cbd5e1" anchorX="center">RF</Text>
    </group>
  );
}

// REPLAY_DURATION: target animation length in seconds
const REPLAY_DURATION = 2.5;

function BallTrajectory({ ev, la, sprayAngle }) {
  const ballRef = useRef();
  const shadowRef = useRef();
  const [frame, setFrame] = useState(0);

  // B1 fix: map sprayAngle to correct field direction
  //   spray < 30 = LF (negative x), spray = 45 = CF (x≈0), spray > 60 = RF (positive x)
  const azimuth = ((sprayAngle - 45) * Math.PI) / 180;

  // B2 fix: use same physics model as calcBallDist via calcTrajectory
  const traj3D = useMemo(() => {
    const pts = calcTrajectory(ev, la);
    return pts.map(([h, y]) => [Math.sin(azimuth) * h, y, Math.cos(azimuth) * h]);
  }, [ev, la, azimuth]);

  const total = traj3D.length;
  const curIdx = Math.min(frame, total - 1);
  const done = curIdx >= total - 1;

  useFrame((_, delta) => {
    if (done || !ballRef.current) return;
    const advance = Math.max(1, Math.round((total / REPLAY_DURATION) * delta));
    const nextIdx = Math.min(curIdx + advance, total - 1);
    setFrame(nextIdx);
    const [bx, by, bz] = traj3D[nextIdx];
    ballRef.current.position.set(bx, by, bz);
    if (shadowRef.current) shadowRef.current.position.set(bx, 0.08, bz);
  });

  const trail = traj3D.slice(0, curIdx + 1);
  const [lx, ly, lz] = traj3D[curIdx];

  return (
    <>
      {/* Shadow on ground */}
      <mesh ref={shadowRef} position={[lx, 0.08, lz]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.0, 16]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.35} />
      </mesh>

      {/* Ball */}
      <mesh ref={ballRef} position={[lx, ly, lz]}>
        <sphereGeometry args={[0.7, 20, 20]} />
        <meshStandardMaterial color="#f8fafc" emissive="#fde68a" emissiveIntensity={0.5} />
      </mesh>

      {/* Trajectory trail */}
      {trail.length > 1 && (
        <Line points={trail} color="#f59e0b" lineWidth={3} transparent opacity={0.85} />
      )}

      {/* Landing marker */}
      {done && (
        <>
          <mesh position={[lx, 0.55, lz]}>
            <sphereGeometry args={[1.2, 24, 24]} />
            <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.6} />
          </mesh>
          <Text position={[lx, 3.5, lz]} fontSize={3} color="#fca5a5" anchorX="center" anchorY="middle">
            着地
          </Text>
        </>
      )}
    </>
  );
}

export default function Baseball3DModal({ event, stadium, onClose }) {
  const zone = useMemo(
    () => calcLandingZone(event.dist, event.sprayAngle, stadium),
    [event.dist, event.sprayAngle, stadium]
  );

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', right: 12, top: 10, zIndex: 2, fontSize: 22, background: 'transparent', color: '#94a3b8', border: 0, cursor: 'pointer', lineHeight: 1 }}
        >
          ×
        </button>

        <Canvas camera={{ position: [0, 55, -65], fov: 50 }}>
          <ambientLight intensity={0.85} />
          <directionalLight position={[50, 80, 30]} intensity={1.2} castShadow />
          <StadiumGeometry stadium={stadium} />
          <BallTrajectory ev={event.ev} la={event.la} sprayAngle={event.sprayAngle ?? 45} />
          <OrbitControls
            target={[0, 8, 65]}
            minPolarAngle={0.2}
            maxPolarAngle={1.5}
            enableZoom
            zoomSpeed={0.8}
          />
        </Canvas>

        {/* Info panel */}
        <div style={{
          position: 'absolute', left: 14, bottom: 14, color: '#f1f5f9',
          fontSize: 13, background: 'rgba(10,22,40,0.82)', padding: '10px 14px',
          borderRadius: 8, lineHeight: 1.8, backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div>EV <strong>{event.ev} mph</strong></div>
          <div>打球角度 <strong>{event.la}°</strong></div>
          <div>飛距離 <strong>{event.dist} m</strong></div>
          <div>着弾 <strong style={{ color: '#fde68a' }}>{zone}</strong></div>
        </div>

        <div style={{ position: 'absolute', right: 14, bottom: 14, color: '#475569', fontSize: 11 }}>
          ドラッグ: 視点変更　スクロール: ズーム
        </div>
      </div>
    </div>
  );
}
