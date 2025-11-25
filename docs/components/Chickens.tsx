import React, { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { playerFireState } from './playerState.ts';

type Mode = 'wander' | 'chase' | 'drumstick';

interface Chick {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  dir: number;
  timer: number;
  hopOff: number;
  mode: Mode;
  alert: boolean;
  drumTime: number;
  opacity: number;
  collected?: boolean;
}

interface ChickensProps {
  onPlayerHit?: () => void;
}

// 可調整參數
const CHICKEN_COUNT = 5;
const BASE_HEIGHT = 8.5;
const AREA_X = 30;
const AREA_Z_MIN = -90;
const AREA_Z_MAX = -55;
const WANDER_SPEED = 2.0;
const CHASE_SPEED = 4.0;
const ALERT_RADIUS = 16;
const HIT_RADIUS = 2.5;
const HOP_HEIGHT = 0.7;
const HOP_SPEED = 5.0;
const DRUMSTICK_DURATION = 8;
const FIRE_RECT_RANGE = 8; // 火焰矩形判定 X/Z 半徑
const RESPAWN_DELAY = 3;
const HEART_BASE_HEIGHT = 6;
const HEART_GAP = 0.8;

const createInitialChicks = (): Chick[] =>
  Array.from({ length: CHICKEN_COUNT }).map(() => ({
    pos: new THREE.Vector3(
      (Math.random() - 0.5) * AREA_X * 1.6,
      BASE_HEIGHT,
      THREE.MathUtils.lerp(AREA_Z_MIN, AREA_Z_MAX, Math.random())
    ),
    vel: new THREE.Vector3(),
    dir: Math.random() * Math.PI * 2,
    timer: 1 + Math.random() * 1.5,
    hopOff: Math.random() * Math.PI * 2,
    mode: 'wander',
    alert: false,
    drumTime: 0,
    opacity: 1,
  }));

const Chickens: React.FC<ChickensProps> = ({ onPlayerHit }) => {
  const { scene } = useThree();
  const chickens = useRef<Chick[]>(createInitialChicks());
  const respawnTimer = useRef(0);
  const heartCountRef = useRef(0);
  const heartHeights = useRef<number[]>([]);
  const playerPos = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    const player = scene.getObjectByName('PlayerGroup') as THREE.Group | null;
    if (player) player.getWorldPosition(playerPos.current);

    // Respawn logic
    const liveCount = chickens.current.filter((c) => c.mode !== 'drumstick' || !c.collected).length;
    if (liveCount < CHICKEN_COUNT) {
      respawnTimer.current += delta;
      if (respawnTimer.current >= RESPAWN_DELAY) {
        respawnTimer.current = 0;
        const newChick: Chick = {
          pos: new THREE.Vector3(
            (Math.random() - 0.5) * AREA_X * 1.6,
            BASE_HEIGHT,
            THREE.MathUtils.lerp(AREA_Z_MIN, AREA_Z_MAX, Math.random())
          ),
          vel: new THREE.Vector3(),
          dir: Math.random() * Math.PI * 2,
          timer: 1 + Math.random() * 1.5,
          hopOff: Math.random() * Math.PI * 2,
          mode: 'wander',
          alert: false,
          drumTime: 0,
          opacity: 1,
        };
        chickens.current.push(newChick);
      }
    } else {
      respawnTimer.current = 0;
    }

    chickens.current.forEach((c) => {
      if (c.mode === 'drumstick') {
        if (!c.collected) {
          c.drumTime += delta;
          c.opacity = Math.max(0, 1 - c.drumTime / DRUMSTICK_DURATION);
        }
        c.vel.set(0, 0, 0);
      } else {
        const dist = playerPos.current.distanceTo(c.pos);
        c.alert = dist < ALERT_RADIUS;
        c.mode = c.alert ? 'chase' : 'wander';
        c.timer -= delta;
        if (c.timer <= 0) {
          c.timer = 1 + Math.random() * 2;
          c.dir = Math.random() * Math.PI * 2;
        }
        const dirVec = c.alert
          ? playerPos.current.clone().sub(c.pos).setY(0)
          : new THREE.Vector3(Math.sin(c.dir), 0, Math.cos(c.dir));
        if (dirVec.lengthSq() > 0.0001) dirVec.normalize();
        const speed = c.alert ? CHASE_SPEED : WANDER_SPEED;
        c.vel.lerp(dirVec.multiplyScalar(speed), 0.12);
        c.pos.addScaledVector(c.vel, delta);
        c.pos.x = THREE.MathUtils.clamp(c.pos.x, -AREA_X, AREA_X);
        c.pos.z = THREE.MathUtils.clamp(c.pos.z, AREA_Z_MIN, AREA_Z_MAX);
        c.pos.y = BASE_HEIGHT + Math.sin(state.clock.elapsedTime * HOP_SPEED + c.hopOff) * HOP_HEIGHT;

        // Collision with player
        if (dist < HIT_RADIUS) {
          if (onPlayerHit) onPlayerHit();
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate(120); } catch (e) {}
          }
        }

        // Fire rectangle & centers
        if (playerFireState.active) {
          const px = playerPos.current.x;
          const pz = playerPos.current.z;
          if (Math.abs(c.pos.x - px) < FIRE_RECT_RANGE && Math.abs(c.pos.z - pz) < FIRE_RECT_RANGE) {
            c.mode = 'drumstick';
            c.drumTime = 0;
            c.opacity = 1;
          } else {
            for (const center of playerFireState.centers) {
              const d = c.pos.distanceTo(new THREE.Vector3(center.x, center.y, center.z));
              if (d < playerFireState.radius) {
                c.mode = 'drumstick';
                c.drumTime = 0;
                c.opacity = 1;
                break;
              }
            }
          }
        }
      }

      // Player collects drumstick -> heart stack
      if (c.mode === 'drumstick' && !c.collected) {
        const distDrum = playerPos.current.distanceTo(c.pos);
        if (distDrum < HIT_RADIUS) {
          c.collected = true;
          heartCountRef.current += 1;
          heartHeights.current.push(HEART_BASE_HEIGHT + HEART_GAP * (heartCountRef.current - 1));
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate([60, 40, 60]); } catch (e) {}
          }
        }
      }
    });
  });

  return (
    <group frustumCulled={false}>
      {chickens.current.map((c, idx) => (
        <ChickenModel key={idx} state={c} />
      ))}
      <Hearts playerPos={playerPos} heightsRef={heartHeights} />
    </group>
  );
};

const Hearts = ({ playerPos, heightsRef }: { playerPos: React.MutableRefObject<THREE.Vector3>; heightsRef: React.MutableRefObject<number[]> }) => {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += 0.01;
    groupRef.current.position.set(playerPos.current.x, playerPos.current.y + HEART_BASE_HEIGHT, playerPos.current.z);
  });
  return (
    <group ref={groupRef}>
      {heightsRef.current.map((h, i) => (
        <points key={i} position={[0, h, 0]}>
          <octahedronGeometry args={[0.6, 1]} />
          <pointsMaterial color="#ff66aa" size={0.12} transparent opacity={0.9} />
        </points>
      ))}
    </group>
  );
};

const ChickenModel = ({ state }: { state: Chick }) => {
  const liveRef = useRef<THREE.Group>(null);
  const drumRef = useRef<THREE.Group>(null);
  const drumBoneMat = useRef<THREE.PointsMaterial>(null);
  const drumMat = useRef<THREE.PointsMaterial>(null);
  const leftEyeMat = useRef<THREE.PointsMaterial>(null);
  const rightEyeMat = useRef<THREE.PointsMaterial>(null);

  useFrame(() => {
    if (!liveRef.current || !drumRef.current) return;
    liveRef.current.parent?.position.copy(state.pos);
    if (state.vel.lengthSq() > 0.001) {
      liveRef.current.parent!.rotation.y = Math.atan2(state.vel.x, state.vel.z);
    }
    liveRef.current.visible = state.mode !== 'drumstick';
    drumRef.current.visible = state.mode === 'drumstick' && state.opacity > 0.01 && !state.collected;
    if (drumMat.current) drumMat.current.opacity = state.opacity;
    if (drumBoneMat.current) drumBoneMat.current.opacity = state.opacity;
    const eyeColor = state.alert ? '#ff2222' : '#222222';
    if (leftEyeMat.current) leftEyeMat.current.color.set(eyeColor);
    if (rightEyeMat.current) rightEyeMat.current.color.set(eyeColor);
  });

  return (
    <group position={state.pos.toArray()} frustumCulled={false} scale={[1.3, 1.3, 1.3]}>
      <group ref={liveRef}>
        <PointsShape geometry={new THREE.BoxGeometry(1.4, 1.2, 1.2, 12, 12, 12)} position={[0, 0.8, 0]} color="#f6f6f6" size={0.12} />
        <PointsShape geometry={new THREE.BoxGeometry(0.9, 0.8, 0.9, 10, 10, 10)} position={[0, 1.7, 0.4]} color="#fbfbfb" size={0.12} />
        <PointsShape geometry={new THREE.OctahedronGeometry(0.18, 1)} position={[0, 1.55, 0.9]} color="#ffd54f" size={0.12} />
        <PointsShape geometry={new THREE.SphereGeometry(0.08, 10, 10)} position={[0.25, 1.75, 0.55]} color="#111" size={0.12} materialRef={leftEyeMat} />
        <PointsShape geometry={new THREE.SphereGeometry(0.08, 10, 10)} position={[-0.25, 1.75, 0.55]} color="#111" size={0.12} materialRef={rightEyeMat} />
        <PointsShape geometry={new THREE.SphereGeometry(0.15, 8, 8)} position={[0, 2.05, 0.2]} color="#ff4466" size={0.12} />
        <PointsShape geometry={new THREE.SphereGeometry(0.13, 8, 8)} position={[0.15, 2.0, 0.0]} color="#ff4466" size={0.12} />
        <PointsShape geometry={new THREE.SphereGeometry(0.13, 8, 8)} position={[-0.15, 2.0, 0.0]} color="#ff4466" size={0.12} />
        <PointsShape geometry={new THREE.CylinderGeometry(0.12, 0.12, 0.8, 10, 2)} position={[0.35, 0.2, -0.05]} color="#ffae52" size={0.1} />
        <PointsShape geometry={new THREE.CylinderGeometry(0.12, 0.12, 0.8, 10, 2)} position={[-0.35, 0.2, -0.05]} color="#ffae52" size={0.1} />
        <PointsShape geometry={new THREE.BoxGeometry(0.3, 0.1, 0.4, 6, 2, 4)} position={[0.35, -0.2, 0.05]} color="#ffae52" size={0.1} />
        <PointsShape geometry={new THREE.BoxGeometry(0.3, 0.1, 0.4, 6, 2, 4)} position={[-0.35, -0.2, 0.05]} color="#ffae52" size={0.1} />
        <PointsShape geometry={new THREE.BoxGeometry(0.7, 0.5, 0.3, 8, 6, 4)} position={[0.85, 1.0, -0.1]} rotation={[0, 0, -0.4]} color="#f0f0f0" size={0.1} />
        <PointsShape geometry={new THREE.BoxGeometry(0.7, 0.5, 0.3, 8, 6, 4)} position={[-0.85, 1.0, -0.1]} rotation={[0, 0, 0.4]} color="#f0f0f0" size={0.1} />
      </group>

      <group ref={drumRef} visible={false}>
        <PointsShape geometry={new THREE.SphereGeometry(0.95, 18, 14)} position={[0, 0.2, 0]} scale={[1.5, 0.9, 1.0]} color="#c47a2c" size={0.14} opacity={1} materialRef={drumMat} />
        <PointsShape geometry={new THREE.CylinderGeometry(0.15, 0.15, 1.0, 12, 3)} position={[1.0, 0.3, 0]} rotation={[0, 0, Math.PI / 2]} color="#ffffff" size={0.12} opacity={1} materialRef={drumBoneMat} />
        <PointsShape geometry={new THREE.SphereGeometry(0.22, 10, 10)} position={[1.5, 0.3, 0]} color="#ffffff" size={0.12} opacity={1} materialRef={drumBoneMat} />
      </group>
    </group>
  );
};

const PointsShape = ({
  geometry,
  position,
  rotation,
  scale,
  color,
  size,
  opacity = 1,
  materialRef,
}: any) => {
  return (
    <points position={position} rotation={rotation} scale={scale} frustumCulled={false}>
      <primitive object={geometry} attach="geometry" />
      <pointsMaterial ref={materialRef} size={size} color={color} sizeAttenuation={false} transparent opacity={opacity} />
    </points>
  );
};

export default Chickens;
