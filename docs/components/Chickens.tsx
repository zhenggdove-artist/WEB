import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { playerActionState } from './playerState.ts';
import { useEffect } from 'react';

type ChickenMode = 'wander' | 'chase' | 'drumstick';

interface ChickenState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  wanderDir: number;
  wanderTimer: number;
  hopOffset: number;
  mode: ChickenMode;
  alert: boolean;
  drumstickTimer: number;
  drumstickOpacity: number;
  lastPlayerHit: number;
}

interface ChickensProps {
  onPlayerHit: () => void;
}

// --- 小雞行為參數（可在此調整） ---
const CHICKEN_COUNT = 5; // 小雞數量
const BASE_HEIGHT = 8.0; // 頂平台高度基準（略抬高避免穿透）
const AREA_X = 32; // 活動範圍 X 半徑
const AREA_Z_MIN = -120; // 活動範圍 Z 最小（靠近祭壇區）
const AREA_Z_MAX = -60; // 活動範圍 Z 最大（靠近樓梯上方）
const WANDER_SPEED = 1.2; // 遊走速度
const CHASE_SPEED = 2.2; // 追擊速度
const ALERT_RADIUS = 14; // 轉為追擊的警戒距離
const HIT_RADIUS = 2.1; // 撞到主角的距離
const HOP_HEIGHT = 0.65; // 彈跳幅度
const HOP_SPEED = 5.5; // 彈跳頻率
const DRUMSTICK_DURATION = 5; // 雞腿停留秒數（逐漸消失）
const FIRE_PADDING = 0.2; // 火焰判定緩衝

const createInitialChickens = (): ChickenState[] => {
  // 固定初始位置讓進入場景時一定能看到（平台中央一字排開）
  const startXs = [-12, -6, 0, 6, 12];
  const startZ = -100; // 靠近祭壇區，玩家抬頭即可看到
  return Array.from({ length: CHICKEN_COUNT }).map((_, i) => ({
    position: new THREE.Vector3(
      startXs[i % startXs.length] + (Math.random() - 0.5) * 1.5,
      BASE_HEIGHT,
      startZ + (Math.random() - 0.5) * 4
    ),
    velocity: new THREE.Vector3(),
    wanderDir: Math.random() * Math.PI * 2,
    wanderTimer: 1.5 + Math.random() * 1.5,
    hopOffset: Math.random() * Math.PI * 2,
    mode: 'wander' as ChickenMode,
    alert: false,
    drumstickTimer: 0,
    drumstickOpacity: 1,
    lastPlayerHit: -10,
  }));
};

const Chickens: React.FC<ChickensProps> = ({ onPlayerHit }) => {
  const { scene } = useThree();
  const chickensRef = useRef<ChickenState[]>(createInitialChickens());
  const playerPos = useRef(new THREE.Vector3());

  useEffect(() => {
    console.log('Chickens spawned:', chickensRef.current.length);
  }, []);

  useFrame((state, delta) => {
    const player = scene.getObjectByName('PlayerGroup') as THREE.Group | null;
    if (!player) return;

    player.getWorldPosition(playerPos.current);

    chickensRef.current.forEach((chicken) => {
      if (chicken.mode === 'drumstick') {
        chicken.drumstickTimer += delta;
        chicken.drumstickOpacity = Math.max(0, 1 - chicken.drumstickTimer / DRUMSTICK_DURATION);
        chicken.alert = false;
        chicken.velocity.set(0, 0, 0);
        chicken.position.y = BASE_HEIGHT;
        return;
      }

      const distToPlayer = chicken.position.distanceTo(playerPos.current);
      chicken.alert = distToPlayer < ALERT_RADIUS;
      chicken.mode = chicken.alert ? 'chase' : 'wander';

      chicken.wanderTimer -= delta;
      if (chicken.wanderTimer <= 0) {
        chicken.wanderTimer = 1.5 + Math.random() * 2.5;
        chicken.wanderDir = Math.random() * Math.PI * 2;
      }

      const dir = chicken.alert
        ? playerPos.current.clone().sub(chicken.position)
        : new THREE.Vector3(Math.sin(chicken.wanderDir), 0, Math.cos(chicken.wanderDir));
      dir.y = 0;
      if (dir.lengthSq() > 0.0001) dir.normalize();

      const speed = chicken.alert ? CHASE_SPEED : WANDER_SPEED;
      const targetVel = dir.multiplyScalar(speed);
      chicken.velocity.lerp(targetVel, 0.12);

      chicken.position.addScaledVector(chicken.velocity, delta);
      chicken.position.x = THREE.MathUtils.clamp(chicken.position.x, -AREA_X, AREA_X);
      chicken.position.z = THREE.MathUtils.clamp(chicken.position.z, AREA_Z_MIN, AREA_Z_MAX);
      const hop = Math.sin(state.clock.getElapsedTime() * HOP_SPEED + chicken.hopOffset) * HOP_HEIGHT;
      chicken.position.y = BASE_HEIGHT + hop;

      if (distToPlayer < HIT_RADIUS && state.clock.getElapsedTime() - chicken.lastPlayerHit > 0.3) {
        chicken.lastPlayerHit = state.clock.getElapsedTime();
        onPlayerHit();
      }

      if (playerActionState.fireActive) {
        for (const center of playerActionState.fireCenters) {
          if (center && center.distanceTo(chicken.position) < playerActionState.fireRadius + FIRE_PADDING) {
            chicken.mode = 'drumstick';
            chicken.drumstickTimer = 0;
            chicken.drumstickOpacity = 1;
            chicken.velocity.set(0, 0, 0);
            chicken.position.y = BASE_HEIGHT;
            break;
          }
        }
      }
    });
  });

  return (
    <group>
      {chickensRef.current.map((_, idx) => (
        <ChickenModel key={idx} index={idx} stateRef={chickensRef} />
      ))}
    </group>
  );
};

const ChickenModel = ({ stateRef, index }: { stateRef: React.MutableRefObject<ChickenState[]>; index: number }) => {
  const groupRef = useRef<THREE.Group>(null);
  const liveRef = useRef<THREE.Group>(null);
  const drumstickRef = useRef<THREE.Group>(null);
  const leftEyeMat = useRef<THREE.PointsMaterial>(null);
  const rightEyeMat = useRef<THREE.PointsMaterial>(null);
  const drumstickMat = useRef<THREE.PointsMaterial>(null);
  const boneMat = useRef<THREE.PointsMaterial>(null);

  useFrame(() => {
    const state = stateRef.current[index];
    if (!state || !groupRef.current) return;

    groupRef.current.position.copy(state.position);
    if (state.velocity.lengthSq() > 0.0001) {
      const heading = Math.atan2(state.velocity.x, state.velocity.z);
      if (!Number.isNaN(heading)) groupRef.current.rotation.y = heading;
    }

    if (liveRef.current) liveRef.current.visible = state.mode !== 'drumstick';
    if (drumstickRef.current) {
      drumstickRef.current.visible = state.mode === 'drumstick' && state.drumstickOpacity > 0.01;
    }

    const eyeColor = state.alert ? '#ff3333' : '#222222';
    if (leftEyeMat.current) leftEyeMat.current.color.set(eyeColor);
    if (rightEyeMat.current) rightEyeMat.current.color.set(eyeColor);

    if (drumstickMat.current) drumstickMat.current.opacity = state.drumstickOpacity;
    if (boneMat.current) boneMat.current.opacity = Math.min(1, state.drumstickOpacity + 0.1);
  });

  return (
    <group ref={groupRef} frustumCulled={false} scale={[2.2, 2.2, 2.2]}>
      <group ref={liveRef}>
        <PointsShape geometry={new THREE.BoxGeometry(1.4, 1.2, 1.2, 8, 8, 8)} position={[0, 0.8, 0]} color="#ffffff" size={0.18} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.BoxGeometry(0.9, 0.8, 0.9, 6, 6, 6)} position={[0, 1.7, 0.4]} color="#f9f9f9" size={0.18} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.BoxGeometry(0.4, 0.2, 1.0, 3, 1, 6)} position={[0, 1.2, -0.6]} color="#ededed" size={0.14} sizeAttenuation={false} />
        {/* Wings */}
        <PointsShape geometry={new THREE.BoxGeometry(0.7, 0.5, 0.3, 4, 3, 2)} position={[0.85, 1.0, -0.1]} rotation={[0, 0, -0.4]} color="#ececec" size={0.14} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.BoxGeometry(0.7, 0.5, 0.3, 4, 3, 2)} position={[-0.85, 1.0, -0.1]} rotation={[0, 0, 0.4]} color="#ececec" size={0.14} sizeAttenuation={false} />
        {/* Legs */}
        <PointsShape geometry={new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8, 1)} position={[0.35, 0.2, -0.05]} color="#ffae52" size={0.14} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8, 1)} position={[-0.35, 0.2, -0.05]} color="#ffae52" size={0.14} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.BoxGeometry(0.3, 0.1, 0.4, 2, 1, 2)} position={[0.35, -0.2, 0.05]} color="#ffae52" size={0.14} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.BoxGeometry(0.3, 0.1, 0.4, 2, 1, 2)} position={[-0.35, -0.2, 0.05]} color="#ffae52" size={0.14} sizeAttenuation={false} />
        {/* Head + Face */}
        <PointsShape geometry={new THREE.ConeGeometry(0.2, 0.5, 3)} position={[0, 1.6, 1.0]} rotation={[Math.PI / 2, 0, 0]} color="#ffb347" size={0.18} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.SphereGeometry(0.08, 6, 6)} position={[0.25, 1.75, 0.55]} color="#111111" size={0.18} materialRef={leftEyeMat} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.SphereGeometry(0.08, 6, 6)} position={[-0.25, 1.75, 0.55]} color="#111111" size={0.18} materialRef={rightEyeMat} sizeAttenuation={false} />
        {/* Comb */}
        <PointsShape geometry={new THREE.SphereGeometry(0.15, 6, 6)} position={[0, 2.05, 0.2]} color="#ff4466" size={0.16} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.SphereGeometry(0.13, 6, 6)} position={[0.15, 2.0, 0.0]} color="#ff4466" size={0.16} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.SphereGeometry(0.13, 6, 6)} position={[-0.15, 2.0, 0.0]} color="#ff4466" size={0.16} sizeAttenuation={false} />
      </group>
      <group ref={drumstickRef} visible={false}>
        <PointsShape geometry={new THREE.SphereGeometry(0.9, 12, 12)} position={[0, 0.2, 0]} scale={[1.4, 0.8, 1.0]} color="#c47a2c" size={0.18} opacity={1} materialRef={drumstickMat} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8, 1)} position={[0, 0.9, 0]} color="#ffffff" size={0.18} opacity={1} materialRef={boneMat} sizeAttenuation={false} />
        <PointsShape geometry={new THREE.SphereGeometry(0.18, 8, 8)} position={[0, 1.35, 0]} color="#ffffff" size={0.18} opacity={1} materialRef={boneMat} sizeAttenuation={false} />
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
  sizeAttenuation = false,
}: {
  geometry: THREE.BufferGeometry;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color: string;
  size: number;
  opacity?: number;
  materialRef?: React.RefObject<THREE.PointsMaterial | null>;
  sizeAttenuation?: boolean;
}) => {
  return (
    <points position={position} rotation={rotation} scale={scale} frustumCulled={false}>
      <primitive object={geometry} attach="geometry" />
      <pointsMaterial ref={materialRef as any} size={size} color={color} sizeAttenuation={sizeAttenuation} transparent opacity={opacity} />
    </points>
  );
};

export default Chickens;
