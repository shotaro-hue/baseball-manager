import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import { calcLandingZone } from '../engine/physics';

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const contentStyle = { width: 'min(960px, 96vw)', height: 'min(70vh, 560px)', position: 'relative', background: '#0f172a', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' };

function StadiumGeometry({ stadium }) {
  const maxFence = Math.max(stadium.lf, stadium.cf, stadium.rf);
  const fencePoints = [
    [-stadium.lf * 0.72, 2.4, stadium.lf * 0.7],
    [-stadium.lf * 0.38, 2.4, stadium.lf * 0.9],
    [0, 2.4, stadium.cf],
    [stadium.rf * 0.38, 2.4, stadium.rf * 0.9],
    [stadium.rf * 0.72, 2.4, stadium.rf * 0.7],
  ];

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[maxFence * 2.2, maxFence * 2.2]} />
        <meshStandardMaterial color="#0f8a4d" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[12, maxFence * 0.9, 64, 1, -Math.PI * 0.17, Math.PI * 1.34]} />
        <meshStandardMaterial color="#137f3f" />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[9, 9, 0.05, 32]} />
        <meshStandardMaterial color="#8b4513" />
      </mesh>

      <Line points={[[-maxFence, 0.08, -maxFence], [0, 0.08, 0], [maxFence, 0.08, -maxFence]]} color="#f8fafc" lineWidth={1.5} />
      <Line points={[[0, 0.08, 0], [-stadium.lf * 0.74, 0.08, stadium.lf * 0.74]]} color="#ffffff" lineWidth={2} />
      <Line points={[[0, 0.08, 0], [stadium.rf * 0.74, 0.08, stadium.rf * 0.74]]} color="#ffffff" lineWidth={2} />
      <Line points={fencePoints} color="#d1d5db" lineWidth={5} />

      <mesh position={[0, 0.2, 18]}>
        <cylinderGeometry args={[1.0, 1.0, 0.4, 20]} />
        <meshStandardMaterial color="#d6bcfa" />
      </mesh>
      <Text position={[0, 0.3, -2]} fontSize={3.2} color="#e2e8f0" anchorX="center" anchorY="middle">HOME</Text>
      <Text position={[-stadium.lf * 0.78, 0.5, stadium.lf * 0.78]} fontSize={3.2} color="#f8fafc" anchorX="center" anchorY="middle">LF</Text>
      <Text position={[0, 0.5, stadium.cf + 8]} fontSize={3.2} color="#f8fafc" anchorX="center" anchorY="middle">CF</Text>
      <Text position={[stadium.rf * 0.78, 0.5, stadium.rf * 0.78]} fontSize={3.2} color="#f8fafc" anchorX="center" anchorY="middle">RF</Text>
    </group>
  );
}

function BallTrajectory({ ev, la, sprayAngle }) {
  const ballRef = useRef();
  const [stopped, setStopped] = useState(false);
  const [trail, setTrail] = useState([[0, 1, 0]]);
  const [landing, setLanding] = useState(null);
  const radians = sprayAngle * (Math.PI / 180);
  const launchAngle = (la * Math.PI) / 180;
  const v0 = ev * 0.44704;

  useFrame((_, delta) => {
    if (!ballRef.current || stopped) return;
    const nextT = (ballRef.current.userData.t || 0) + delta;
    ballRef.current.userData.t = nextT;
    const xzV = v0 * Math.cos(launchAngle);
    const y = Math.max(0, 1 + (v0 * Math.sin(launchAngle)) * nextT - 0.5 * 9.81 * nextT ** 2);
    const forward = Math.max(0, xzV * nextT - 0.18 * nextT ** 2 * xzV);
    const x = Math.cos(radians) * forward;
    const z = Math.sin(radians) * forward;

    ballRef.current.position.set(x, y, z);
    setTrail((prev) => (prev.length > 100 ? [...prev.slice(prev.length - 70), [x, y, z]] : [...prev, [x, y, z]]));

    if (y <= 0.01 && nextT > 0.2) {
      setStopped(true);
      setLanding([x, 0.45, z]);
    }
  });

  return (
    <>
      <mesh ref={ballRef} position={[0, 1, 0]}>
        <sphereGeometry args={[0.6, 16, 16]} />
        <meshStandardMaterial color="#f8fafc" emissive="#fde68a" emissiveIntensity={0.45} />
      </mesh>
      {trail.length > 1 && <Line points={trail} color="#fbbf24" lineWidth={3} transparent opacity={0.9} />}
      {landing && (
        <>
          <mesh position={landing}>
            <sphereGeometry args={[1.1, 24, 24]} />
            <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.55} />
          </mesh>
          <Text position={[landing[0], 2.7, landing[2]]} fontSize={2.8} color="#fecaca" anchorX="center" anchorY="middle">着地点</Text>
        </>
      )}
    </>
  );
}

export default function Baseball3DModal({ event, stadium, onClose }) {
  const zone = useMemo(() => calcLandingZone(event.dist, event.sprayAngle, stadium), [event.dist, event.sprayAngle, stadium]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', right: 10, top: 8, zIndex: 2, fontSize: 20, background: 'transparent', color: '#fff', border: 0, cursor: 'pointer' }}>×</button>
        <Canvas camera={{ position: [0, 70, -52], fov: 52 }}>
          <ambientLight intensity={0.72} />
          <directionalLight position={[40, 60, 20]} intensity={1.1} />
          <StadiumGeometry stadium={stadium} />
          <BallTrajectory ev={event.ev} la={event.la} sprayAngle={event.sprayAngle || 45} />
          <OrbitControls enableZoom={false} minPolarAngle={0.35} maxPolarAngle={1.45} target={[0, 5, 68]} />
        </Canvas>
        <div style={{ position: 'absolute', left: 12, bottom: 12, color: '#f8fafc', fontSize: 14, background: 'rgba(15,23,42,0.72)', padding: '8px 10px', borderRadius: 6 }}>
          EV: {event.ev}mph / LA: {event.la}° / 飛距離: {event.dist}m / 着弾: {zone}
        </div>
      </div>
    </div>
  );
}
