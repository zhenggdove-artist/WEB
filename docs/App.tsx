import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Loader } from '@react-three/drei';
import Scene from './components/Scene.tsx';
import UIOverlay from './components/UIOverlay.tsx';

export default function App() {
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [isFading, setIsFading] = useState(false);

  const handleTrigger = (url: string) => {
    if (isFading) return;
    console.log("Triggered redirect to:", url);
    setRedirectUrl(url);
    setIsFading(true);
    
    // Wait for fade animation then redirect
    setTimeout(() => {
      window.location.href = url;
    }, 2000);
  };

  return (
    <div className="app-container">
      {/* Increased Z position from 14 to 30 for further initial distance */}
      <Canvas
        camera={{ position: [0, 15, 30], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#050011']} />
        <Suspense fallback={null}>
          <Scene onTrigger={handleTrigger} isLocked={isFading} />
          <Stars radius={100} depth={50} count={6000} factor={4} saturation={1} fade speed={2} />
        </Suspense>
        {/* Unlocked Controls: Zoom enabled, no angle limits, allows free viewing */}
        <OrbitControls 
            makeDefault
            enableZoom={true} 
            enablePan={false} 
        /> 
      </Canvas>
      
      <UIOverlay isFading={isFading} />
      <Loader />
    </div>
  );
}