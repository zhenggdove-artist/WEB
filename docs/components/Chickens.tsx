import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { playerActionState } from './playerState.ts';
import { useEffect } from 'react';

type ChickenMode = 'wander' | 'chase' | 'drumstick' | 'respawn';

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
  respawnTimer: number;
}

interface ChickensProps {
  onPlayerHit: () => void;
  onDrumstickCollected: () => void;
}

// --- 小雞行為參數（可在此調整） ---
const CHICKEN_COUNT = 5; // 小雞數量
const BASE_HEIGHT = 8.5; // 頂平台高度基準（更高便於看見）
const AREA_X = 32; // 活動範圍 X 半徑
const AREA_Z_MIN = -90; // 活動範圍 Z 最小（平台中央）
const AREA_Z_MAX = -55; // 活動範圍 Z 最大（靠近樓梯上方）
const WANDER_SPEED = 1.2; // 遊走速度
const CHASE_SPEED = 2.2; // 追擊速度
const ALERT_RADIUS = 14; // 轉為追擊的警戒距離
const HIT_RADIUS = 2.1; // 撞到主角的距離
const HOP_HEIGHT = 0.65; // 彈跳幅度
const HOP_SPEED = 5.5; // 彈跳頻率
const DRUMSTICK_DURATION = 5; // 雞腿停留秒數（逐漸消失）
const FIRE_PADDING = 0.2; // 火焰判定緩衝
const FIRE_VERTICAL_TOLERANCE = 6; // Allow fire hits even when mouth height differs
const DRUMSTICK_PICKUP_RADIUS = 1.6; // Player pickup radius for drumsticks
const RESPAWN_DELAY = 3; // Seconds until a collected drumstick respawns as a chick

// Foot-fire box (pressed fire key makes a ground AoE under dino feet)
const FOOT_FIRE_HALF_X = 4; // Half width on X axis
const FOOT_FIRE_HALF_Z = 4; // Half depth on Z axis
const FOOT_FIRE_HEIGHT = 3; // Vertical tolerance to still count as foot-level hit

const createInitialChickens = (): ChickenState[] => {
  // 固定初始位置讓進入場景時一定能看到（平台中央一字排開）
  const startXs = [-12, -6, 0, 6, 12];
  const startZ = -75; // 平台正中央
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
    respawnTimer: 0,
  }));
};

const randomizeChicken = (chicken: ChickenState) => {
  const startXs = [-12, -6, 0, 6, 12];
  const startZ = -75;
  const seed = Math.floor(Math.random() * startXs.length);
  chicken.position.set(
    startXs[seed] + (Math.random() - 0.5) * 1.5,
    BASE_HEIGHT,
    startZ + (Math.random() - 0.5) * 4
  );
  chicken.velocity.set(0, 0, 0);
  chicken.wanderDir = Math.random() * Math.PI * 2;
  chicken.wanderTimer = 1.5 + Math.random() * 1.5;
  chicken.hopOffset = Math.random() * Math.PI * 2;
  chicken.mode = 'wander';
  chicken.alert = false;
  chicken.drumstickTimer = 0;
  chicken.drumstickOpacity = 1;
  chicken.respawnTimer = 0;
  chicken.lastPlayerHit = -10;
};

const Chickens: React.FC<ChickensProps> = ({ onPlayerHit, onDrumstickCollected }) => {
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
      // Respawn queue keeps total at CHICKEN_COUNT
      if (chicken.mode === 'respawn') {
        chicken.respawnTimer += delta;
        if (chicken.respawnTimer >= RESPAWN_DELAY) {
          randomizeChicken(chicken);
        }
        return;
      }

      if (chicken.mode === 'drumstick') {
        chicken.drumstickTimer += delta;
        chicken.drumstickOpacity = Math.max(0, 1 - chicken.drumstickTimer / DRUMSTICK_DURATION);
        chicken.alert = false;
        chicken.velocity.set(0, 0, 0);
        chicken.position.y = BASE_HEIGHT;

        // Player picks up drumstick -> stack heart
        const pickupDist = chicken.position.distanceTo(playerPos.current);
        if (pickupDist < DRUMSTICK_PICKUP_RADIUS) {
          chicken.mode = 'respawn';
          chicken.drumstickOpacity = 0;
          chicken.respawnTimer = 0;
          onDrumstickCollected();
        }
        // Auto clear if faded out so we can respawn a fresh chick
        if (chicken.drumstickOpacity <= 0.01) {
          chicken.mode = 'respawn';
          chicken.respawnTimer = 0;
        }
        return;
      }

      // Foot-level fire AoE: axis-aligned box under the player while holding fire
      if (playerActionState.fireActive) {
        const dx = Math.abs(chicken.position.x - playerPos.current.x);
        const dz = Math.abs(chicken.position.z - playerPos.current.z);
        const dy = Math.abs(chicken.position.y - playerPos.current.y);
        if (dx <= FOOT_FIRE_HALF_X && dz <= FOOT_FIRE_HALF_Z && dy <= FOOT_FIRE_HEIGHT) {
          chicken.mode = 'drumstick';
          chicken.drumstickTimer = 0;
          chicken.drumstickOpacity = 1;
          chicken.velocity.set(0, 0, 0);
          chicken.position.y = BASE_HEIGHT;
          return;
        }
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
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(100);
        }
      }

      if (playerActionState.fireActive) {
        for (const center of playerActionState.fireCenters) {
          if (!center) continue;

          const verticalGap = Math.abs(center.y - chicken.position.y);
          if (verticalGap > FIRE_VERTICAL_TOLERANCE) continue;

          const dx = center.x - chicken.position.x;
          const dz = center.z - chicken.position.z;
          const flatDist = Math.hypot(dx, dz);
          if (flatDist < playerActionState.fireRadius + FIRE_PADDING) {
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

    if (liveRef.current) liveRef.current.visible = state.mode === 'wander' || state.mode === 'chase';
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
    <group ref={groupRef} frustumCulled={false} scale={[3, 3, 3]}>
      <group ref={liveRef}>
        <PointsShape geometry={new THREE.BoxGeometry(1.4, 1.2, 1.2, 8, 8, 8)} position={[0, 0.8, 0]} color="#ffffdd" size={0.32} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.BoxGeometry(0.9, 0.8, 0.9, 6, 6, 6)} position={[0, 1.7, 0.4]} color="#fff7cc" size={0.32} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.BoxGeometry(0.4, 0.2, 1.0, 3, 1, 6)} position={[0, 1.2, -0.6]} color="#ffeedd" size={0.28} sizeAttenuation={false} depthTest={false} />
        {/* Wings */}
        <PointsShape geometry={new THREE.BoxGeometry(0.7, 0.5, 0.3, 4, 3, 2)} position={[0.85, 1.0, -0.1]} rotation={[0, 0, -0.4]} color="#fff1dd" size={0.28} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.BoxGeometry(0.7, 0.5, 0.3, 4, 3, 2)} position={[-0.85, 1.0, -0.1]} rotation={[0, 0, 0.4]} color="#fff1dd" size={0.28} sizeAttenuation={false} depthTest={false} />
        {/* Legs */}
        <PointsShape geometry={new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8, 1)} position={[0.35, 0.2, -0.05]} color="#ffae52" size={0.28} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8, 1)} position={[-0.35, 0.2, -0.05]} color="#ffae52" size={0.28} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.BoxGeometry(0.3, 0.1, 0.4, 2, 1, 2)} position={[0.35, -0.2, 0.05]} color="#ffae52" size={0.28} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.BoxGeometry(0.3, 0.1, 0.4, 2, 1, 2)} position={[-0.35, -0.2, 0.05]} color="#ffae52" size={0.28} sizeAttenuation={false} depthTest={false} />
        {/* Head + Face */}
        <PointsShape geometry={new THREE.ConeGeometry(0.2, 0.5, 3)} position={[0, 1.6, 1.0]} rotation={[Math.PI / 2, 0, 0]} color="#ffb347" size={0.32} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.SphereGeometry(0.08, 6, 6)} position={[0.25, 1.75, 0.55]} color="#111111" size={0.32} materialRef={leftEyeMat} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.SphereGeometry(0.08, 6, 6)} position={[-0.25, 1.75, 0.55]} color="#111111" size={0.32} materialRef={rightEyeMat} sizeAttenuation={false} depthTest={false} />
        {/* Comb */}
        <PointsShape geometry={new THREE.SphereGeometry(0.15, 6, 6)} position={[0, 2.05, 0.2]} color="#ff4466" size={0.3} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.SphereGeometry(0.13, 6, 6)} position={[0.15, 2.0, 0.0]} color="#ff4466" size={0.3} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.SphereGeometry(0.13, 6, 6)} position={[-0.15, 2.0, 0.0]} color="#ff4466" size={0.3} sizeAttenuation={false} depthTest={false} />
      </group>
      <group ref={drumstickRef} visible={false}>
        <PointsShape geometry={new THREE.SphereGeometry(0.9, 12, 12)} position={[0, 0.2, 0]} scale={[1.4, 0.8, 1.0]} color="#c47a2c" size={0.32} opacity={1} materialRef={drumstickMat} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.CylinderGeometry(0.15, 0.15, 0.9, 8, 1)} position={[-1.05, 0.2, 0]} rotation={[0, 0, Math.PI / 2]} color="#ffffff" size={0.32} opacity={1} materialRef={boneMat} sizeAttenuation={false} depthTest={false} />
        <PointsShape geometry={new THREE.SphereGeometry(0.18, 8, 8)} position={[-1.55, 0.2, 0]} color="#ffffff" size={0.32} opacity={1} materialRef={boneMat} sizeAttenuation={false} depthTest={false} />
      </group>
      <pointLight position={[0, 2.5, 0]} intensity={6} distance={25} color="#ffeeaa" />
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
  depthTest = true,
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
  depthTest?: boolean;
}) => {
  return (
    <points position={position} rotation={rotation} scale={scale} frustumCulled={false}>
      <primitive object={geometry} attach="geometry" />
      <pointsMaterial ref={materialRef as any} size={size} color={color} sizeAttenuation={sizeAttenuation} transparent opacity={opacity} depthTest={depthTest} />
    </points>
  );
};

export default Chickens;
