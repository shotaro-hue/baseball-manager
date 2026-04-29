import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { calcLandingZone } from '../engine/physics';

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const contentStyle = { width: 'min(960px, 96vw)', height: 'min(70vh, 560px)', position: 'relative', background: '#0f172a', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' };

function StadiumGeometry({ stadium }) {
  const maxFence = Math.max(stadium.lf, stadium.cf, stadium.rf);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[maxFence * 2.2, maxFence * 2.2]} />
        <meshStandardMaterial color="#2f855a" />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[8, 8, 0.05, 32]} />
        <meshStandardMaterial color="#a16207" />
      </mesh>
      <mesh position={[-stadium.lf / 2, 2, stadium.lf / 2]}>
        <boxGeometry args={[4, 4, stadium.lf]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[0, 2, stadium.cf]}>
        <boxGeometry args={[stadium.lf, 4, 4]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[stadium.rf / 2, 2, stadium.rf / 2]}>
        <boxGeometry args={[4, 4, stadium.rf]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[0, 0.2, 18]}>
        <cylinderGeometry args={[1.0, 1.0, 0.4, 20]} />
        <meshStandardMaterial color="#d6bcfa" />
      </mesh>
    </group>
  );
}

function BallTrajectory({ ev, la, sprayAngle }) {
  const ballRef = useRef();
  const [stopped, setStopped] = useState(false);
  const radians = sprayAngle * (Math.PI / 180);
  const v0 = ev * 0.44704;

  useFrame((_, delta) => {
    if (!ballRef.current || stopped) return;
    const nextT = (ballRef.current.userData.t || 0) + delta;
    ballRef.current.userData.t = nextT;
    const xzV = v0 * Math.cos((la * Math.PI) / 180);
    const y = Math.max(0, 1 + (v0 * Math.sin((la * Math.PI) / 180)) * nextT - 0.5 * 9.81 * nextT ** 2);
    const forward = Math.max(0, xzV * nextT - 0.18 * nextT ** 2 * xzV);
    const x = Math.cos(radians) * forward;
    const z = Math.sin(radians) * forward;
    ballRef.current.position.set(x, y, z);
    if (y <= 0.01 && nextT > 0.2) {
      setStopped(true);
    }
  });

  return (
    <mesh ref={ballRef} position={[0, 1, 0]}>
      <sphereGeometry args={[0.6, 16, 16]} />
      <meshStandardMaterial color="#f8fafc" />
    </mesh>
  );
}

export default function Baseball3DModal({ event, stadium, onClose }) {
  const zone = useMemo(() => calcLandingZone(event.dist, event.sprayAngle, stadium), [event.dist, event.sprayAngle, stadium]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', right: 10, top: 8, zIndex: 2, fontSize: 20, background: 'transparent', color: '#fff', border: 0, cursor: 'pointer' }}>×</button>
        <Canvas camera={{ position: [0, 55, 95], fov: 55 }}>
          <ambientLight intensity={0.75} />
          <directionalLight position={[40, 60, 20]} intensity={1} />
          <StadiumGeometry stadium={stadium} />
          <BallTrajectory ev={event.ev} la={event.la} sprayAngle={event.sprayAngle || 45} />
          <OrbitControls enableZoom={false} />
        </Canvas>
        <div style={{ position: 'absolute', left: 12, bottom: 12, color: '#f8fafc', fontSize: 14, background: 'rgba(15,23,42,0.72)', padding: '8px 10px', borderRadius: 6 }}>
          EV: {event.ev}mph / LA: {event.la}° / {event.dist}m（{zone}）
        </div>
      </div>
    </div>
  );
}
