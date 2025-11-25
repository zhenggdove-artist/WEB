import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment as DreiEnv, Text3D, Center, MeshDistortMaterial } from '@react-three/drei';
import Player from './Player.tsx';
import WorldEnvironment from './WorldEnvironment.tsx';
import * as THREE from 'three';
import Chickens from './Chickens.tsx';

// --- LABEL CONFIGURATION (EDIT HERE) ---
// Adjust the position [x, y, z] to change height or location.
export const LABEL_DATA = [
    { 
      text: "Exhibition", 
      position: [0, 30, -110] // Higher Y for Altar
    }, 
    { 
      text: "CV", 
      position: [-30, 27, -105] 
    },       
    { 
      text: "Things", 
      position: [30, 27, -105] 
    }     
];

interface SceneProps {
  onTrigger: (url: string) => void;
  isLocked: boolean;
}

const Scene: React.FC<SceneProps> = ({ onTrigger, isLocked }) => {
  const [playerHitFlash, setPlayerHitFlash] = useState(false);
  const hitFlashTimer = useRef<number | null>(null);

  const triggerPlayerHitFlash = () => {
    setPlayerHitFlash(true);
    if (hitFlashTimer.current) window.clearTimeout(hitFlashTimer.current);
    hitFlashTimer.current = window.setTimeout(() => setPlayerHitFlash(false), 200);
  };

  useEffect(() => {
    return () => {
      if (hitFlashTimer.current) window.clearTimeout(hitFlashTimer.current);
    };
  }, []);

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#00ffff" />
      <pointLight position={[-10, 15, -10]} intensity={0.5} color="#ff00ff" />
      
      {/* Deep Fog for depth and fade out effect */}
      <fog attach="fog" args={['#050505', 150, 1500]} />

      <Player onTrigger={onTrigger} isLocked={isLocked} hitFlash={playerHitFlash} />
      <Chickens onPlayerHit={triggerPlayerHitFlash} />
      <WorldEnvironment />
      
      <ChromeLabelSystem />

      {/* Subtle reflections */}
      <DreiEnv preset="night" />
    </>
  );
};

// --- CHROME LABEL SYSTEM ---
const ChromeLabelSystem = () => {
    const { scene } = useThree();

    return (
        <group>
            {LABEL_DATA.map((l, i) => (
                <ChromeLabel key={i} text={l.text} position={l.position as [number, number, number]} scene={scene} />
            ))}
        </group>
    )
}

const ChromeLabel = ({ text, position, scene }: { text: string, position: [number, number, number], scene: THREE.Scene }) => {
    const ref = useRef<THREE.Group>(null);
    const [opacity, setOpacity] = useState(0);

    useFrame((state) => {
        if (!ref.current) return;
        
        // Find player to check distance
        const player = scene.getObjectByName('PlayerGroup');
        if (player) {
            const labelPos = new THREE.Vector3(...position);
            // Ignore Y height for distance check to make triggering easier
            const flatPlayerPos = new THREE.Vector3(player.position.x, 0, player.position.z);
            const flatLabelPos = new THREE.Vector3(labelPos.x, 0, labelPos.z);
            
            const dist = flatPlayerPos.distanceTo(flatLabelPos);
            
            // Fade in when closer than 50 units
            const targetOpacity = THREE.MathUtils.clamp(1 - (dist - 30) / 30, 0, 1);
            setOpacity(THREE.MathUtils.lerp(opacity, targetOpacity, 0.1));
        }

        // Float animation
        ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.5) * 0.5;
        // Look at camera
        ref.current.lookAt(state.camera.position);
    });

    return (
        <group position={position} ref={ref} visible={opacity > 0.01}>
            <Center>
                <Text3D 
                    font="https://threejs.org/examples/fonts/optimer_bold.typeface.json"
                    size={5}
                    height={0.5}
                    curveSegments={12}
                    bevelEnabled
                    bevelThickness={0.8} // Very thick bevel for aggressive look
                    bevelSize={0.15}     // Sharp bevel size
                    bevelOffset={0}
                    bevelSegments={3}    // Low segments for jagged/sharp look
                >
                    {text}
                    {/* LIQUID CHROME MATERIAL */}
                    <MeshDistortMaterial
                        color="#ffffff"
                        metalness={1.0}
                        roughness={0.0}
                        envMapIntensity={2.0}
                        distort={0.4} // The twisting effect
                        speed={3}     // Speed of the liquid motion
                        transparent
                        opacity={opacity}
                    />
                </Text3D>
            </Center>
        </group>
    )
}

export default Scene;
