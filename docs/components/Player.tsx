import React, { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Group, MathUtils, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry } from 'three';
import { useInput } from '../hooks/useInput.ts';
import { joystickState, fireButtonState } from './UIOverlay.tsx';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { updatePlayerFireState } from './playerState.ts';

interface PlayerProps {
  onTrigger: (url: string) => void;
  isLocked: boolean;
  hitFlash?: boolean;
}

// Helper to detect proximity
const checkTrigger = (pos: Vector3, target: Vector3, range: number) => {
  return pos.distanceTo(target) < range;
};

// Fire breath configuration
const FIRE_HIT_RADIUS = 2.4; // Collision radius for flame breath
const FIRE_VISUAL_LENGTH = 6; // Visual length of the flame cone
const UP_AXIS = new Vector3(0, 1, 0);
const FIRE_DROP_OFFSET = new Vector3(0, -2, 0);

const Player: React.FC<PlayerProps> = ({ onTrigger, isLocked, hitFlash = false }) => {
  const groupRef = useRef<Group>(null);
  const leftLegRef = useRef<Group>(null);
  const rightLegRef = useRef<Group>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const jawRef = useRef<Group>(null); 
  
  const tailBaseRef = useRef<Group>(null);
  const tailMidRef = useRef<Group>(null);
  const tailTipRef = useRef<Group>(null);
  const fireRef = useRef<Group>(null);
  const movementDir = useRef(new Vector3(0, 0, -1));
  const nextPosition = useRef(new Vector3());
  const movementDelta = useRef(new Vector3());
  const fireTargetsRef = useRef([new Vector3(), new Vector3(), new Vector3(), new Vector3()]);
  const fireLookTarget = useRef(new Vector3());

  const { input } = useInput();
  const { camera, controls } = useThree();
  
  // Character state
  const [position] = useState(new Vector3(0, 0, 10)); // Start
  const speed = 0.5;
  const rotationSpeed = 0.05;
  const prevPosition = useRef(position.clone());

  // New Target Positions (Moved back ~3x)
  const altarPos = new Vector3(0, 8, -110);
  const monumentPos = new Vector3(-30, 8, -105); 
  const debrisPos = new Vector3(30, 8, -105);   
  const fireIntensityRef = useRef(0); // 0~1 的火焰強度，用來平滑顯示
  const tmpForward = useRef(new Vector3(0, 0, -1));
  const mouthWorld = useRef(new Vector3());

  useFrame((state) => {
    if (!groupRef.current) return;
    if (isLocked) {
      updatePlayerFireState([], FIRE_HIT_RADIUS, false);
      if (fireRef.current) fireRef.current.visible = false;
      return;
    }

    // 1. Input Handling
    let moveForward = 0;
    let moveTurn = 0;

    // Keyboard
    if (input.forward) moveForward += 1;
    if (input.backward) moveForward -= 1;
    if (input.left) moveTurn += 1;
    if (input.right) moveTurn -= 1;

    // Joystick (Mobile)
    if (Math.abs(joystickState.y) > 0.1 || Math.abs(joystickState.x) > 0.1) {
      moveForward = joystickState.y;
      moveTurn = -joystickState.x;
    }

    // 2. Movement Physics
    groupRef.current.rotation.y += moveTurn * rotationSpeed;

    movementDir.current.set(0, 0, -1);
    movementDir.current.applyAxisAngle(UP_AXIS, groupRef.current.rotation.y);
    
    if (moveForward !== 0) {
      const newPos = nextPosition.current.copy(position).addScaledVector(movementDir.current, moveForward * speed);
      
      // --- MOVEMENT BOUNDARIES ---
      // Platform/Stair Width is ~80 (Radius 40). Keep inside -35 to 35 for safety.
      if (newPos.x > 35) newPos.x = 35;
      if (newPos.x < -35) newPos.x = -35;

      // Z Boundaries (Start of stairs to End of Platform)
      // Start: ~15, End: -130 (past the altar slightly)
      if (newPos.z > 15) newPos.z = 15;
      if (newPos.z < -125) newPos.z = -125;

      position.copy(newPos);
    }

    // 3. Vertical Movement (Stairs Logic)
    const stairStartZ = -5;
    const stairEndZ = -25;
    const topY = 8;
    
    if (position.z < stairStartZ && position.z > stairEndZ) {
      const ratio = (position.z - stairStartZ) / (stairEndZ - stairStartZ);
      position.y = MathUtils.lerp(0, topY, ratio);
    } else if (position.z <= stairEndZ) {
        position.y = topY;
    } else {
        position.y = 0;
    }

    // 4. Animation
    const time = state.clock.getElapsedTime();
    const isMoving = Math.abs(moveForward) > 0.1 || Math.abs(moveTurn) > 0.1;
    
    // Body Bob
    const bobFreq = 10;
    const bobAmp = 0.15;
    const bob = isMoving ? Math.sin(time * bobFreq) * bobAmp : Math.sin(time * 1.5) * 0.02;
    
    // Lean
    const targetTilt = isMoving ? moveForward * 0.2 : 0;
    groupRef.current.rotation.x = MathUtils.lerp(groupRef.current.rotation.x, targetTilt, 0.1);
    groupRef.current.rotation.z = MathUtils.lerp(groupRef.current.rotation.z, moveTurn * -0.1, 0.1);

    // Jaw "Breathing" Animation
    if (jawRef.current) {
        // Open jaw slightly when moving (roaring/breathing heavy), or slow breathing when idle
        const targetJawRot = isMoving ? 0.3 + Math.sin(time * 15) * 0.08 : 0.1 + Math.sin(time * 2) * 0.02;
        jawRef.current.rotation.x = MathUtils.lerp(jawRef.current.rotation.x, targetJawRot, 0.1);
    }

    // --- LEG ANIMATION (Bipedal Walk Cycle) ---
    if (leftLegRef.current && rightLegRef.current) {
        if (isMoving) {
            const walkCycle = time * 10; 
            const strideAngle = 0.6; 
            leftLegRef.current.rotation.x = Math.sin(walkCycle) * strideAngle;
            rightLegRef.current.rotation.x = Math.sin(walkCycle + Math.PI) * strideAngle;
        } else {
            leftLegRef.current.rotation.x = MathUtils.lerp(leftLegRef.current.rotation.x, 0, 0.1);
            rightLegRef.current.rotation.x = MathUtils.lerp(rightLegRef.current.rotation.x, 0, 0.1);
        }
    }

    // --- TAIL ANIMATION (S-Curve Sway) ---
    if (tailBaseRef.current && tailMidRef.current && tailTipRef.current) {
        const tailSpeed = isMoving ? 12 : 2;
        const tailAmp = isMoving ? 0.15 : 0.05;
        
        tailBaseRef.current.rotation.y = Math.sin(time * tailSpeed) * tailAmp;
        tailMidRef.current.rotation.y = Math.sin(time * tailSpeed - 0.5) * tailAmp; // Lag
        tailTipRef.current.rotation.y = Math.sin(time * tailSpeed - 1.0) * tailAmp; // More lag
    }

    // Arm idle
    if (leftArmRef.current && rightArmRef.current) {
        // Rotated forward significantly (around -0.5 on X) for a "reaching" pose
        leftArmRef.current.rotation.x = -0.5 + Math.sin(time * 3) * 0.1;
        rightArmRef.current.rotation.x = -0.5 + Math.cos(time * 3) * 0.1;
    }

    // Apply Transforms
    groupRef.current.position.copy(position);
    groupRef.current.position.y += bob + 2.7; 

    // 5. SMART CAMERA FOLLOW (Preserves User Rotation/Zoom)
    movementDelta.current.copy(position).sub(prevPosition.current);
    if(movementDelta.current.lengthSq() > 0.00001) {
        camera.position.add(movementDelta.current);
        if(controls) {
             const orbit = controls as unknown as OrbitControlsImpl;
             orbit.target.add(movementDelta.current);
             orbit.update();
        }
    }
    prevPosition.current.copy(position);

    // 6. Fire breath targeting and collisions
    const firing = (input.fire || fireButtonState.pressed) && !isLocked;
    fireIntensityRef.current = MathUtils.lerp(fireIntensityRef.current, firing ? 1 : 0, firing ? 0.2 : 0.18);

    tmpForward.current.set(0, 0, -1).applyQuaternion(groupRef.current.quaternion).normalize();
    mouthWorld.current.set(0, 3.8, 2.2).applyMatrix4(groupRef.current.matrixWorld);

    const fireTargets = fireTargetsRef.current;
    fireTargets[0].copy(mouthWorld.current).addScaledVector(tmpForward.current, 1.5);
    fireTargets[1].copy(mouthWorld.current).addScaledVector(tmpForward.current, 3);
    fireTargets[2].copy(mouthWorld.current).addScaledVector(tmpForward.current, FIRE_VISUAL_LENGTH);
    fireTargets[3].copy(mouthWorld.current).addScaledVector(tmpForward.current, 2).add(FIRE_DROP_OFFSET);
    updatePlayerFireState(fireTargets, FIRE_HIT_RADIUS, fireIntensityRef.current > 0.05);

    if (fireRef.current) {
      fireRef.current.visible = fireIntensityRef.current > 0.05;
      fireRef.current.position.copy(mouthWorld.current);
      fireLookTarget.current.copy(mouthWorld.current).addScaledVector(tmpForward.current, FIRE_VISUAL_LENGTH);
      fireRef.current.lookAt(fireLookTarget.current);
      const fireScale = 0.8 + fireIntensityRef.current * 0.6;
      fireRef.current.scale.set(fireScale, fireScale, fireScale);
    }

    // 7. Triggers (Larger range due to scale)
    if (checkTrigger(position, altarPos, 12)) {
      onTrigger("https://www.zhenggdove.com/exhibition");
    }
    if (checkTrigger(position, monumentPos, 12)) {
      onTrigger("https://www.zhenggdove.com/bio");
    }
    if (checkTrigger(position, debrisPos, 12)) {
      onTrigger("https://www.zhenggdove.com/category/all-products");
    }
  });

  return (
    <group ref={groupRef} name="PlayerGroup">
      {hitFlash && <FlashAura />}
      <TRexModel 
        leftLegRef={leftLegRef} 
        rightLegRef={rightLegRef}
        leftArmRef={leftArmRef}
        rightArmRef={rightArmRef}
        jawRef={jawRef}
        tailBaseRef={tailBaseRef}
        tailMidRef={tailMidRef}
        tailTipRef={tailTipRef}
      />
      <FireBreath fireRef={fireRef} />
    </group>
  );
};

const FlashAura = () => {
  return (
    <points>
      <sphereGeometry args={[3.2, 16, 16]} />
      <pointsMaterial size={0.18} color="#ff3333" transparent opacity={0.6} />
    </points>
  );
};

const FireBreath = ({ fireRef }: { fireRef: React.RefObject<Group | null> }) => {
  return (
    <group ref={fireRef} visible={false}>
      <points>
        <coneGeometry args={[0.9, FIRE_VISUAL_LENGTH, 16, 4, true]} />
        <pointsMaterial size={0.12} color="#ff6b35" transparent opacity={0.65} />
      </points>
      <points position={[0, 0, FIRE_VISUAL_LENGTH * 0.35]}>
        <coneGeometry args={[0.6, FIRE_VISUAL_LENGTH * 0.55, 12, 4, true]} />
        <pointsMaterial size={0.1} color="#ffd166" transparent opacity={0.55} />
      </points>
    </group>
  );
};

interface TRexModelProps {
    leftLegRef: React.RefObject<Group | null>;
    rightLegRef: React.RefObject<Group | null>;
    leftArmRef: React.RefObject<Group | null>;
    rightArmRef: React.RefObject<Group | null>;
    jawRef: React.RefObject<Group | null>;
    tailBaseRef: React.RefObject<Group | null>;
    tailMidRef: React.RefObject<Group | null>;
    tailTipRef: React.RefObject<Group | null>;
}

const TRexModel: React.FC<TRexModelProps> = ({ 
    leftLegRef, rightLegRef, leftArmRef, rightArmRef, jawRef,
    tailBaseRef, tailMidRef, tailTipRef
}) => {
  // Palette
  const skinColor = "#00ff66"; 
  const detailColor = "#00cc44";
  const clawColor = "#ccffcc";
  const teethColor = "#ffffff";
  const tongueColor = "#ff0044";
  const gumColor = "#880022"; // Dark red for mouth interior
  
  const materialProps = {
    size: 0.05, 
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
  };

  return (
    <group rotation={[0, Math.PI, 0]} scale={[0.8, 0.8, 0.8]}>
      
      {/* --- BODY GROUP --- */}
      <group>
          {/* --- HEAD (REFINED SHAPE) --- */}
          <group position={[0, 4.2, 2.2]}>
            {/* Skull (Upper Back) */}
            <PointsShape geometry={new BoxGeometry(1.5, 1.4, 1.5, 12, 12, 12)} position={[0, 0.2, 0]} color={skinColor} {...materialProps} />
            
            {/* Snout (Upper Front) - Tapered box for better jawline */}
            <PointsShape geometry={new CylinderGeometry(0.5, 0.75, 1.6, 12, 8)} position={[0, 0.1, 1.5]} rotation={[1.57, 0, 0]} color={skinColor} {...materialProps} />
            
            {/* Upper Gums (Red Interior) */}
            <PointsShape geometry={new BoxGeometry(0.8, 0.2, 1.4, 8, 2, 8)} position={[0, -0.4, 1.2]} color={gumColor} size={0.04} />

            {/* Upper Teeth (More detail) */}
            <group position={[0, -0.4, 1.2]}>
                <TeethRow count={8} radius={0.45} color={teethColor} inverted={false} />
            </group>
            
            {/* Eyes */}
            <PointsShape geometry={new SphereGeometry(0.15, 8, 8)} position={[0.6, 0.5, 0.4]} color="#ffff00" size={0.08} />
            <PointsShape geometry={new SphereGeometry(0.15, 8, 8)} position={[-0.6, 0.5, 0.4]} color="#ffff00" size={0.08} />
            <PointsShape geometry={new BoxGeometry(0.2, 0.05, 0.4)} position={[0.6, 0.65, 0.4]} rotation={[0, 0, 0.2]} color="#004400" size={0.04} /> {/* Brow */}
            <PointsShape geometry={new BoxGeometry(0.2, 0.05, 0.4)} position={[-0.6, 0.65, 0.4]} rotation={[0, 0, -0.2]} color="#004400" size={0.04} />

            {/* --- LOWER JAW (Movable) --- */}
            <group position={[0, -0.4, 0.2]} rotation={[0.2, 0, 0]} ref={jawRef}>
                {/* Jaw Bone */}
                <PointsShape geometry={new CylinderGeometry(0.4, 0.6, 1.6, 12, 8)} position={[0, 0, 1.0]} rotation={[1.57, 0, 0]} color={detailColor} {...materialProps} />
                
                {/* Lower Gums (Red Interior) */}
                <PointsShape geometry={new BoxGeometry(0.7, 0.1, 1.3, 8, 2, 8)} position={[0, 0.2, 1.0]} color={gumColor} size={0.04} />

                {/* Tongue (Distinct Red Shape) */}
                <PointsShape geometry={new CylinderGeometry(0.25, 0.1, 1.0, 8, 5)} position={[0, 0.35, 0.8]} rotation={[1.6, 0, 0]} color={tongueColor} size={0.05} />

                {/* Lower Teeth */}
                <group position={[0, 0.3, 1.1]}>
                    <TeethRow count={7} radius={0.4} color={teethColor} inverted={true} />
                </group>
            </group>
          </group>

          {/* --- NECK --- */}
          <PointsShape geometry={new CylinderGeometry(0.9, 1.3, 1.8, 20, 12)} position={[0, 2.8, 1.2]} rotation={[-0.3, 0, 0]} color={skinColor} {...materialProps} />

          {/* --- TORSO --- */}
          <group position={[0, 1, 0]}>
            <PointsShape geometry={new SphereGeometry(1.6, 28, 24)} position={[0, 1, 0.2]} scale={[1, 1, 0.9]} color={skinColor} {...materialProps} />
            <PointsShape geometry={new SphereGeometry(1.8, 28, 28)} position={[0, -0.5, -0.2]} scale={[1.1, 1.2, 1.1]} color={skinColor} {...materialProps} />
          </group>

          {/* --- ANIMATED TAIL (Multi-Segment) --- */}
          <group position={[0, -0.5, -1.5]} rotation={[-0.1, 0, 0]}>
             {/* Base Segment */}
             <group ref={tailBaseRef}>
                 <PointsShape geometry={new CylinderGeometry(1.3, 0.9, 1.8, 16, 12)} position={[0, 0, -0.9]} rotation={[1.57, 0, 0]} color={skinColor} {...materialProps} />
                 {/* Mid Segment */}
                 <group position={[0, 0, -1.8]} ref={tailMidRef}>
                    <PointsShape geometry={new CylinderGeometry(0.9, 0.5, 2.0, 14, 10)} position={[0, 0, -1.0]} rotation={[1.57, 0, 0]} color={skinColor} {...materialProps} />
                    {/* Tip Segment */}
                    <group position={[0, 0, -2.0]} ref={tailTipRef}>
                        <PointsShape geometry={new CylinderGeometry(0.5, 0.05, 2.5, 10, 12)} position={[0, 0, -1.25]} rotation={[1.57, 0, 0]} color={skinColor} {...materialProps} />
                    </group>
                 </group>
             </group>
          </group>

          {/* --- ARMS (EXTENDED & REACHING FORWARD) --- */}
          <group position={[0, 1.5, 1.2]}>
             {/* Left Arm */}
             <group position={[1, 0, 0]} ref={leftArmRef}>
                 {/* Longer Cylinder (1.5 length), shifted down to pivot correctly */}
                 <PointsShape geometry={new CylinderGeometry(0.25, 0.2, 1.5, 8, 8)} position={[0, -0.75, 0]} rotation={[0, 0, -0.2]} color={detailColor} {...materialProps} />
                 {/* Claw Position Adjusted for longer arm */}
                 <ThreeToedClaw position={[0, -1.6, 0.1]} color={clawColor} scale={0.5} />
             </group>
             {/* Right Arm */}
             <group position={[-1, 0, 0]} ref={rightArmRef}>
                 <PointsShape geometry={new CylinderGeometry(0.25, 0.2, 1.5, 8, 8)} position={[0, -0.75, 0]} rotation={[0, 0, 0.2]} color={detailColor} {...materialProps} />
                 <ThreeToedClaw position={[0, -1.6, 0.1]} color={clawColor} scale={0.5} />
             </group>
          </group>
      </group>

      {/* --- LEGS --- */}
      <group position={[0, -1.5, 0]}>
        <group position={[1.1, 0.5, 0]} ref={leftLegRef}>
            <PointsShape geometry={new SphereGeometry(1.2, 16, 16)} scale={[0.8, 1.4, 1]} color={skinColor} {...materialProps} />
            <group position={[0, -1.2, 0.5]}>
                 <PointsShape geometry={new CylinderGeometry(0.5, 0.4, 1.8, 12, 8)} position={[0, -0.5, 0]} rotation={[0.2, 0, 0]} color={skinColor} {...materialProps} />
                 <ThreeToedClaw position={[0, -1.5, 0.3]} rotation={[0.2, 0, 0]} color={clawColor} scale={0.8} />
            </group>
        </group>
        <group position={[-1.1, 0.5, 0]} ref={rightLegRef}>
            <PointsShape geometry={new SphereGeometry(1.2, 16, 16)} scale={[0.8, 1.4, 1]} color={skinColor} {...materialProps} />
            <group position={[0, -1.2, 0.5]}>
                 <PointsShape geometry={new CylinderGeometry(0.5, 0.4, 1.8, 12, 8)} position={[0, -0.5, 0]} rotation={[0.2, 0, 0]} color={skinColor} {...materialProps} />
                 <ThreeToedClaw position={[0, -1.5, 0.3]} rotation={[0.2, 0, 0]} color={clawColor} scale={0.8} />
            </group>
        </group>
      </group>

    </group>
  );
};

const TeethRow = ({ count, radius, color, inverted }: any) => {
    const teeth = [];
    const dir = inverted ? -1 : 1;
    for(let i=0; i<count; i++) {
        // U-shape arrangement
        const t = (i / (count - 1)); 
        const angle = (t - 0.5) * 1.5; // -0.75 to 0.75 radians
        const x = Math.sin(angle) * radius * 1.2;
        const z = Math.cos(angle) * radius; 
        
        teeth.push(
            <PointsShape 
                key={i} 
                geometry={new ConeGeometry(0.05, 0.18, 5)} 
                position={[x, dir * 0.1, z]} 
                rotation={[dir * Math.PI, 0, 0]} 
                color={color} 
                size={0.04} 
            />
        )
    }
    return <group>{teeth}</group>;
}

const ThreeToedClaw = ({ position, rotation, scale = 1, color }: any) => {
    return (
        <group position={position} rotation={rotation} scale={[scale, scale, scale]}>
            <PointsShape geometry={new SphereGeometry(0.4, 8, 8)} scale={[1, 0.5, 1]} color={color} size={0.04} />
            <PointsShape geometry={new ConeGeometry(0.08, 0.6, 6)} position={[0, 0, 0.5]} rotation={[1.6, 0, 0]} color={color} size={0.03} />
            <PointsShape geometry={new ConeGeometry(0.08, 0.5, 6)} position={[-0.25, 0, 0.4]} rotation={[1.6, 0, 0.3]} color={color} size={0.03} />
            <PointsShape geometry={new ConeGeometry(0.08, 0.5, 6)} position={[0.25, 0, 0.4]} rotation={[1.6, 0, -0.3]} color={color} size={0.03} />
        </group>
    )
}

const PointsShape = ({ geometry, position, rotation, scale, color, size, opacity = 1 }: any) => {
    return (
        <points position={position} rotation={rotation} scale={scale}>
            <primitive object={geometry} attach="geometry" />
            <pointsMaterial size={size} color={color} sizeAttenuation transparent opacity={opacity} />
        </points>
    )
}

export default Player;


