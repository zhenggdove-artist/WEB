import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CatmullRomCurve3, Vector3, Color, MathUtils } from 'three';

// --- GLOBAL CONFIGURATION (EDIT HERE / 全局配置) ---
export const PLANET_CONFIG = {
  // --- CORE PLANET SETTINGS (底部核心星球設定) ---
  position: { x: 250, y: -350, z: 0 },
  radius: 200,
  planetColor: "#ffe733",
  planetOuterPointCount: 10000,
  planetInnerPointCount: 300000, 
  
  // --- CENTRAL ALTAR SETTINGS (中央祭壇設定) ---
  altarColor: "#91041c", // 祭壇主體顏色
  altarConeColor: "#ff0066", // 祭壇頂部三角錐顏色 (獨立控制 - 設為亮粉色以測試)

  // --- SKY PLANET SETTINGS (天空第二星球設定) ---
  skyPlanetPosition: { x: 200, y: 250, z: -100 }, 
  skyPlanetRadius: 200,                            
  skyPlanetColor: "#91041c",                      
  skyPlanetOuterCount: 38000,
  skyPlanetInnerCount: 50000,

  // --- TENTACLE SETTINGS (觸手設定) ---
  tentacleCount: 100, 
  tentacleRootColor: "#ffe733", 
  tentacleTipColor1: "#33ddffff", 
  tentacleTipColor2: "#61cffbff", 
  tentacleRadiusMin: 2, 
  tentacleRadiusMax: 10, 
  tentacleBaseLength: 3, 
  tentacleLengthJitter: 3 
};

// --- TENTACLE INTERNAL SETTINGS ---
const BASE_DENSITY = { pointsPerRing: 30 }; 

const GenericPointShader = {
    vertexShader: `
        attribute float size;
        attribute vec3 customColor;
        varying vec3 vColor;
        void main() {
            vColor = customColor;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (400.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        varying vec3 vColor;
        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            if(length(coord) > 0.5) discard;
            gl_FragColor = vec4(vColor, 1.0);
        }
    `
};

// --- PLANET COMPONENT ---
interface PlanetProps {
  color?: string;
  outerCount?: number;
  innerCount?: number;
  size?: number;
  rotationSpeed?: number;
  noiseAmplitude?: number;
}

const Planet: React.FC<PlanetProps> = ({ 
  color = '#00F0FF', 
  outerCount = 15000,
  innerCount = 0, 
  size = 2.8, 
  rotationSpeed = 0.1, 
  noiseAmplitude = 0.12 
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  
  const particles = useMemo(() => {
    const totalCount = outerCount + innerCount;
    const tempPositions = new Float32Array(totalCount * 3);
    const phi = Math.PI * (3 - Math.sqrt(5)); 

    let pIndex = 0;

    // 1. OUTER SHELL (Fibonacci)
    for (let i = 0; i < outerCount; i++) {
      const y = 1 - (i / (outerCount - 1)) * 2; 
      const radiusAtY = Math.sqrt(1 - y * y);   
      const theta = phi * i;                    

      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      const noise = 1 + (Math.random() - 0.5) * noiseAmplitude;

      tempPositions[pIndex * 3] = x * size * noise;
      tempPositions[pIndex * 3 + 1] = y * size * noise;
      tempPositions[pIndex * 3 + 2] = z * size * noise;
      pIndex++;
    }

    // 2. INNER VOLUME
    for (let i = 0; i < innerCount; i++) {
        const r = size * Math.cbrt(Math.random()) * 0.95;
        const theta = Math.random() * Math.PI * 2;
        const phiAng = Math.acos(2 * Math.random() - 1);

        const x = r * Math.sin(phiAng) * Math.cos(theta);
        const y = r * Math.sin(phiAng) * Math.sin(theta);
        const z = r * Math.cos(phiAng);

        tempPositions[pIndex * 3] = x;
        tempPositions[pIndex * 3 + 1] = y;
        tempPositions[pIndex * 3 + 2] = z;
        pIndex++;
    }

    return tempPositions;
  }, [outerCount, innerCount, size, noiseAmplitude]);

  useFrame((state, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += rotationSpeed * delta;
      pointsRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.15) * 0.05;
    }
  });

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particles.length / 3}
            array={particles}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.6}                   
          color={color}                
          sizeAttenuation={true}       
          transparent={true}
          opacity={0.8}
          blending={THREE.AdditiveBlending} 
          depthWrite={false}
        />
      </points>
      <mesh>
        <sphereGeometry args={[size * 0.9, 32, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
    </group>
  );
};

const WorldEnvironment = () => {
  const stairCount = 40;
  const stairWidth = 80; 
  const stairDepth = 0.5;
  const stairHeight = 0.2;

  const stairs = useMemo(() => {
    const items = [];
    for (let i = 0; i < stairCount; i++) {
      items.push(
        <PointsObj
          key={`stair-${i}`}
          geometry={new THREE.BoxGeometry(stairWidth, stairHeight, stairDepth, 150, 4, 8)}
          position={[0, i * stairHeight, -5 - i * stairDepth]}
          color={i % 5 === 0 ? "#00ffcc" : "#111122"}
          size={0.06}
          opacity={0.9}
        />
      );
    }
    return items;
  }, []);

  // Remap logic for Core Planet
  const { x, y, z } = PLANET_CONFIG.position;
  const corePlanetPos = [-z, y, -x];

  // Remap logic for Sky Planet
  const { x: sx, y: sy, z: sz } = PLANET_CONFIG.skyPlanetPosition;
  const skyPlanetPos = [-sz, sy, -sx];

  return (
    <group>
      {/* --- CORE PLANET (Bottom) --- */}
      <group>
         <group position={corePlanetPos as any}>
            <Planet 
                size={PLANET_CONFIG.radius} 
                outerCount={PLANET_CONFIG.planetOuterPointCount}
                innerCount={PLANET_CONFIG.planetInnerPointCount}
                color={PLANET_CONFIG.planetColor}
                rotationSpeed={0.02}
                noiseAmplitude={0.05}
            />
         </group>
         <BiologicalTentacleSystem />
      </group>

      {/* --- SKY PLANET (Top) --- */}
      <group position={skyPlanetPos as any}>
          <Planet 
              size={PLANET_CONFIG.skyPlanetRadius}
              outerCount={PLANET_CONFIG.skyPlanetOuterCount}
              innerCount={PLANET_CONFIG.skyPlanetInnerCount}
              color={PLANET_CONFIG.skyPlanetColor}
              rotationSpeed={-0.05} // Rotate opposite way
              noiseAmplitude={0.08}
          />
          {/* Optional Glow for Sky Planet */}
          <pointLight distance={200} intensity={2} color={PLANET_CONFIG.skyPlanetColor} />
      </group>

      {/* --- STAIRS --- */}
      <group>{stairs}</group>

      {/* --- TOP PLATFORM --- */}
      <group position={[0, 7.8, -75]}>
         <PointsObj 
            geometry={new THREE.BoxGeometry(80, 1, 100, 200, 6, 200)} 
            position={[0, 0, 0]} 
            color="#222255" 
            size={0.06}
            opacity={1}
         />
      </group>

      {/* --- CENTER: HYPER VOID SPIRE (Altar) --- */}
      <group position={[0, 8, -110]}>
         <HyperSpireAltar />
      </group>

      {/* --- LEFT: HYPER GLITCH MONOLITH --- */}
      <group position={[-30, 8, -105]} rotation={[0, 0.6, 0]}>
        <HyperGlitchMonolith />
      </group>

      {/* --- RIGHT: HYPER BURNING DEBRIS --- */}
      <group position={[30, 8, -105]}>
         <HyperBurningDebris />
      </group>

    </group>
  );
};

// --- SYSTEMS ---

const generateRingedPoints = (curve: CatmullRomCurve3, numRings: number, pointsPerRing: number, baseRadius: number, rootColor: Color, tipColor: Color) => {
    const points = [];
    const sizes = [];
    const colors = [];
    const normal = new THREE.Vector3();
    const binormal = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const tempColor = new THREE.Color();
    const frames = curve.computeFrenetFrames(numRings, false);

    for (let i = 0; i < numRings; i++) {
      const u = i / (numRings - 1);
      curve.getPointAt(u, tangent);
      normal.copy(frames.normals[i]);
      binormal.copy(frames.binormals[i]);

      const pos = curve.getPointAt(u, new THREE.Vector3());
      const currentRadius = baseRadius * (1.0 - u * 0.7); 
      tempColor.copy(rootColor).lerp(tipColor, u);

      for (let j = 0; j < pointsPerRing; j++) {
        const angle = (j / pointsPerRing) * Math.PI * 2;
        const sin = Math.sin(angle), cos = Math.cos(angle);

        const px = pos.x + currentRadius * (normal.x * cos + binormal.x * sin);
        const py = pos.y + currentRadius * (normal.y * cos + binormal.y * sin);
        const pz = pos.z + currentRadius * (normal.z * cos + binormal.z * sin);

        points.push(px, py, pz);
        sizes.push(0.3 + Math.random() * 0.3); 
        colors.push(tempColor.r, tempColor.g, tempColor.b);
      }
    }
    return { points, sizes, colors };
};

const BiologicalTentacleSystem = () => {
    const groupRef = useRef<THREE.Group>(null);
    const tentsRef = useRef<any[]>([]);

    const pX = PLANET_CONFIG.position.x;
    const pY = PLANET_CONFIG.position.y;
    const pZ = PLANET_CONFIG.position.z;
    const pRadius = PLANET_CONFIG.radius;
    const tCount = PLANET_CONFIG.tentacleCount;
    const tRadMin = PLANET_CONFIG.tentacleRadiusMin;
    const tRadMax = PLANET_CONFIG.tentacleRadiusMax;
    const tBaseLen = PLANET_CONFIG.tentacleBaseLength;
    const tJitter = PLANET_CONFIG.tentacleLengthJitter;
    const tRootCol = PLANET_CONFIG.tentacleRootColor;
    const tTipCol1 = PLANET_CONFIG.tentacleTipColor1;
    const tTipCol2 = PLANET_CONFIG.tentacleTipColor2;

    useEffect(() => {
        if (!groupRef.current) return;
        
        while(groupRef.current.children.length > 0){ 
            const child = groupRef.current.children[0];
            if(child instanceof THREE.Points) {
                child.geometry.dispose();
                // @ts-ignore
                if(child.material.dispose) child.material.dispose();
            }
            groupRef.current.remove(child); 
        }
        tentsRef.current = [];

        const planetCenter = new Vector3(-pZ, pY, -pX);
        const planetRadius = pRadius;
        
        if (tCount <= 0) return; 

        for (let t = 0; t < tCount; t++) {
             const theta = Math.random() * Math.PI * 2; 
             const phi = Math.acos(2 * Math.random() - 1);

             const x = planetRadius * Math.sin(phi) * Math.cos(theta);
             const y = planetRadius * Math.sin(phi) * Math.sin(theta);
             const z = planetRadius * Math.cos(phi);
                
             const startPos = new Vector3(
                planetCenter.x + x,
                planetCenter.y + y,
                planetCenter.z + z
             );

             const pathPoints = [];
             const length = tBaseLen + Math.random() * tJitter;
             const numSegments = Math.max(10, Math.floor(length / 2)); 

             const dir = startPos.clone().sub(planetCenter).normalize(); 
             dir.x += (Math.random() - 0.5) * 0.5;
             dir.y += (Math.random() - 0.5) * 0.5;
             dir.z += (Math.random() - 0.5) * 0.5;
             dir.normalize();

             for(let i=0; i<numSegments; i++) {
                 const p = startPos.clone().add(dir.clone().multiplyScalar(i * (length/numSegments)));
                 p.x += (Math.random()-0.5) * (length * 0.05); 
                 p.z += (Math.random()-0.5) * (length * 0.05);
                 pathPoints.push(p);
             }
             
             const curve = new CatmullRomCurve3(pathPoints);
             const rootColor = new Color(tRootCol); 
             const tipColor = new Color(Math.random() > 0.5 ? tTipCol1 : tTipCol2);
             const tentacleRadius = tRadMin + Math.random() * (tRadMax - tRadMin);
             const dynamicRings = Math.max(30, Math.floor(length * 2));

             const { points, sizes, colors } = generateRingedPoints(curve, dynamicRings, BASE_DENSITY.pointsPerRing, tentacleRadius, rootColor, tipColor);
             
             const geo = new THREE.BufferGeometry();
             geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
             geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(sizes), 1));
             geo.setAttribute('customColor', new THREE.BufferAttribute(new Float32Array(colors), 3));

             const mat = new THREE.ShaderMaterial({
                 vertexShader: GenericPointShader.vertexShader,
                 fragmentShader: GenericPointShader.fragmentShader,
                 blending: THREE.AdditiveBlending,
                 depthTest: false,
                 transparent: true
             });

             const mesh = new THREE.Points(geo, mat);
             groupRef.current.add(mesh);

             tentsRef.current.push({
                 mesh,
                 curve,
                 pathPoints,
                 rootColor,
                 tipColor,
                 radius: tentacleRadius,
                 dynamicRings, 
                 length: length, 
                 seed: Math.random() * 1000,
                 speed: 0.3 + Math.random() * 0.5
             });
        }
    }, [pX, pY, pZ, pRadius, tCount, tRadMin, tRadMax, tBaseLen, tJitter, tRootCol, tTipCol1, tTipCol2]); 

    useFrame((state) => {
        const time = state.clock.getElapsedTime();
        
        tentsRef.current.forEach(tent => {
             const { curve, pathPoints, seed, speed, mesh, radius, dynamicRings, length } = tent;
             for(let i=1; i<pathPoints.length; i++) {
                 const rest = pathPoints[i];
                 const amp = (i / pathPoints.length) * (length * 0.1); 
                 const t = time * speed + i * 0.15;
                 const nx = Math.sin(t + seed);
                 const ny = Math.cos(t * 1.2 + seed);
                 const nz = Math.sin(t * 0.8 + seed);
                 curve.points[i].x = rest.x + nx * amp;
                 curve.points[i].y = rest.y + ny * amp;
                 curve.points[i].z = rest.z + nz * amp;
             }

             const { points } = generateRingedPoints(curve, dynamicRings, BASE_DENSITY.pointsPerRing, radius, tent.rootColor, tent.tipColor);
             
             const posAttr = mesh.geometry.attributes.position;
             if (posAttr.array.length === points.length) {
                for(let k=0; k<points.length; k++) {
                    posAttr.array[k] = points[k];
                }
                posAttr.needsUpdate = true;
             }
        });
    });

    return <group ref={groupRef} />;
};

const FireMaterial = {
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(1.0, 0.5, 0.0) },
  },
  vertexShader: `
    uniform float uTime;
    attribute float aOffset;
    attribute float aSpeed;
    varying float vAlpha;
    
    void main() {
      vec3 pos = position;
      float height = 15.0; 
      float y = mod(pos.y + uTime * aSpeed + aOffset, height);
      pos.y = y;
      pos.x += sin(uTime * 2.0 + aOffset + y * 0.2) * (0.5 + y * 0.1);
      pos.z += cos(uTime * 1.5 + aOffset + y * 0.2) * (0.5 + y * 0.1);

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = 200.0 / -mvPosition.z; 
      
      vAlpha = 1.0 - pow(y / height, 2.0); 
      if(vAlpha < 0.0) vAlpha = 0.0;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    varying float vAlpha;
    
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      if(dist > 0.5) discard;
      float glow = 1.0 - (dist * 2.0);
      gl_FragColor = vec4(uColor, vAlpha * glow);
    }
  `
};

// --- HYPER COMPLEX SYSTEMS (5x Detail) ---

const HyperSpireAltar = () => {
    const groupRef = useRef<THREE.Group>(null);
    const baseColor = PLANET_CONFIG.altarColor;
    const coneColor = PLANET_CONFIG.altarConeColor;

    // Generate 5 concentric rings
    const rings = useMemo(() => {
        return [0, 1, 2, 3, 4].map(i => ({
            radius: 6 + i * 2,
            speed: (i % 2 === 0 ? 1 : -1) * (0.1 + i * 0.05),
            tilt: i * 0.1
        }));
    }, []);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        if(groupRef.current) {
            // Animate rings
            groupRef.current.children.forEach((child, i) => {
                if (child.userData.isRing) {
                    const r = rings[child.userData.index];
                    child.rotation.y = t * r.speed;
                    child.rotation.x = Math.sin(t * 0.5 + r.tilt) * 0.2;
                }
            });
        }
    });

  return (
    <group ref={groupRef}>
      {/* Dense Base Structure */}
      <PointsObj geometry={new THREE.CylinderGeometry(10, 15, 4, 100, 10)} position={[0, 2, 0]} color="#440055" size={0.06} />
      <PointsObj geometry={new THREE.CylinderGeometry(8, 10, 2, 100, 5)} position={[0, 5, 0]} color="#660077" size={0.05} />
      <PointsObj geometry={new THREE.CylinderGeometry(4, 8, 30, 64, 50, true)} position={[0, 15, 0]} color="#8800ff" size={0.04} opacity={0.6} />
      
      {/* Hyper Beam */}
      <PointsObj geometry={new THREE.CylinderGeometry(1, 1, 80, 24, 150, true)} position={[0, 40, 0]} color={baseColor} size={0.06} opacity={0.9} />
      <PointsObj geometry={new THREE.CylinderGeometry(0.2, 0.2, 80, 12, 50, true)} position={[0, 40, 0]} color="#ffffff" size={0.08} opacity={1} />

      {/* 5 Rotating Rings */}
      {rings.map((r, i) => (
          <points key={i} position={[0, 12 + i * 2, 0]} userData={{ isRing: true, index: i }}>
             <primitive object={new THREE.TorusGeometry(r.radius, 0.2, 16, 120)} attach="geometry" />
             <pointsMaterial size={0.1} color={i===4 ? coneColor : baseColor} transparent opacity={0.8} blending={THREE.AdditiveBlending} />
          </points>
      ))}

      {/* Floating Crystal Shards */}
      {Array.from({length: 20}).map((_, i) => (
          <PointsObj 
            key={`shard-${i}`}
            geometry={new THREE.OctahedronGeometry(1 + Math.random(), 0)}
            position={[Math.sin(i)*15, 10 + Math.random()*20, Math.cos(i)*15]}
            color={coneColor}
            size={0.05}
          />
      ))}

      {/* Explicit Top Cone */}
      <PointsObj 
        geometry={new THREE.ConeGeometry(4, 10, 4, 40, true)} 
        position={[0, 25, 0]} 
        color={coneColor} 
        size={0.05} 
        opacity={1} 
      />
      
      {/* Eye */}
      <group position={[0, 18, 0]}>
        <RefinedEye />
      </group>
      
      <pointLight position={[0, 20, 0]} distance={80} intensity={10} color={baseColor} />
    </group>
  );
};

const RefinedEye = () => {
    const irisRef = useRef<THREE.Group>(null);
    useFrame((state) => {
        if(irisRef.current) irisRef.current.rotation.z = state.clock.getElapsedTime() * 0.5;
    });
    return (
        <group scale={[3, 3, 3]} rotation={[0, 0, 0]}>
            <PointsObj geometry={new THREE.SphereGeometry(0.3, 32, 32)} color="#000000" size={0.02} />
            <group ref={irisRef}>
                <PointsObj geometry={new THREE.RingGeometry(0.35, 0.9, 64, 16)} color="#00ff99" size={0.02} opacity={1} />
                <PointsObj geometry={new THREE.RingGeometry(0.5, 0.7, 64, 5)} position={[0,0,0.01]} color="#ffffff" size={0.01} opacity={0.5} />
            </group>
        </group>
    )
}

const HyperGlitchMonolith = () => {
    const [glitchFactor, setGlitch] = useState(0);
    const groupRef = useRef<THREE.Group>(null);

    useFrame((state) => {
        if (Math.random() > 0.92) setGlitch(Math.random());
        else setGlitch(MathUtils.lerp(glitchFactor, 0, 0.1));
        
        if(groupRef.current) {
            groupRef.current.rotation.y += 0.005;
        }
    });

    const monolithPoints = useMemo(() => {
        // Generate multiple overlapping blocks instead of one
        const blocks = [];
        for(let b=0; b<5; b++) {
            const w = 4 + Math.random()*6;
            const h = 10 + Math.random()*15;
            const d = 1 + Math.random()*3;
            const offX = (Math.random()-0.5)*5;
            const offY = (Math.random()-0.5)*5;
            
            // Grid points for each block
            for(let i=0; i<1000; i++) {
                const px = (Math.random()-0.5)*w + offX;
                const py = (Math.random()-0.5)*h + offY;
                const pz = (Math.random()-0.5)*d;
                blocks.push(px, py, pz);
            }
        }
        return new Float32Array(blocks);
    }, []);

    return (
        <group ref={groupRef}>
            {/* Main Fractured Data Cloud */}
            <points>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={monolithPoints.length/3} array={monolithPoints} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial 
                    color={new THREE.Color().setHSL(0.6, 1, 0.5 + glitchFactor * 0.5)} 
                    size={0.08 + glitchFactor * 0.1} 
                    sizeAttenuation 
                    transparent 
                    opacity={0.8} 
                />
            </points>
            
            {/* Surrounding Data Ring */}
            <points rotation={[0.5, 0, 0]}>
                 <primitive object={new THREE.TorusGeometry(12, 0.5, 16, 100)} attach="geometry" />
                 <pointsMaterial size={0.05} color="#00ffff" transparent opacity={0.3} />
            </points>

            {/* Core Glitch Planes */}
             <PointsObj 
                geometry={new THREE.PlaneGeometry(12, 25, 50, 80)} 
                position={[0, 0, 0]} 
                color="#ffffff" 
                size={glitchFactor > 0.5 ? 0.08 : 0.0} 
                opacity={glitchFactor * 0.6}
            />
            <pointLight position={[0, 5, 4]} distance={40} intensity={8 + glitchFactor * 10} color="#00ccff" />
        </group>
    );
};

const HyperBurningDebris = () => {
    // Generate massive amount of paper
    const papers = useMemo(() => {
        const arr = [];
        for(let i=0; i<150; i++) {
            const angle = Math.random() * Math.PI;
            const px = (Math.random() - 0.5) * 20; // Wider area
            const pz = (Math.random() - 0.5) * 20;
            const lift = Math.random() * 2;
            arr.push(
                <group key={i} position={[px, 0.1 + lift, pz]} rotation={[Math.random()*1, angle, Math.random()*0.5]}>
                    <PointsObj 
                        geometry={new THREE.PlaneGeometry(1.2, 1.6, 12, 16)} 
                        rotation={[-Math.PI/2, 0, 0]} 
                        color={Math.random() > 0.8 ? "#ffaa00" : "#dddddd"} 
                        size={0.03} 
                    />
                </group>
            )
        }
        return arr;
    }, []);

    // Broken Stone Columns
    const columns = useMemo(() => {
        return [-6, 6, -3].map((offX, i) => (
             <group key={`col-${i}`} position={[offX, 2, (Math.random()-0.5)*10]} rotation={[0.2, 0, (Math.random()-0.5)]}>
                  <PointsObj geometry={new THREE.CylinderGeometry(1.5, 2, 6, 20, 10)} color="#555555" size={0.05} />
             </group>
        ));
    }, []);

    return (
        <group>
            {papers}
            {columns}
            {/* Primary Fire */}
            <ShaderFire position={[0, 0.5, 0]} color={new THREE.Color("#ff5500")} count={5000} height={18} width={8} />
            <ShaderFire position={[5, 0.5, 3]} color={new THREE.Color("#ff3300")} count={3000} height={12} width={5} />
            <ShaderFire position={[-4, 0.5, -4]} color={new THREE.Color("#ffaa00")} count={3000} height={15} width={6} />
            
            {/* High Altitude Embers */}
            <ShaderFire position={[0, 15, 0]} color={new THREE.Color("#ffff00")} count={2000} height={30} width={15} speedMult={3} />
            
            <pointLight position={[0, 8, 0]} distance={60} intensity={12} color="#ff4400" />
        </group>
    )
}

const ShaderFire = ({ position, color, count = 400, height = 10, width = 3, speedMult = 1 }: any) => {
    const meshRef = useRef<THREE.Points>(null);
    const [geoAttributes] = useState(() => {
        const pos = new Float32Array(count * 3);
        const offsets = new Float32Array(count);
        const speeds = new Float32Array(count);
        for(let i=0; i<count; i++) {
            pos[i*3] = (Math.random() - 0.5) * width;
            pos[i*3+1] = Math.random() * height; 
            pos[i*3+2] = (Math.random() - 0.5) * width;
            offsets[i] = Math.random() * 10;
            speeds[i] = (1.0 + Math.random()) * speedMult;
        }
        return { pos, offsets, speeds };
    });

    useFrame((state) => {
        if(meshRef.current) {
            const material = meshRef.current.material as THREE.ShaderMaterial;
            material.uniforms.uTime.value = state.clock.getElapsedTime();
        }
    });

    return (
        <points position={position} ref={meshRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={geoAttributes.pos} itemSize={3} />
                <bufferAttribute attach="attributes-aOffset" count={count} array={geoAttributes.offsets} itemSize={1} />
                <bufferAttribute attach="attributes-aSpeed" count={count} array={geoAttributes.speeds} itemSize={1} />
            </bufferGeometry>
            <shaderMaterial 
                vertexShader={FireMaterial.vertexShader}
                fragmentShader={FireMaterial.fragmentShader}
                uniforms={{ uTime: { value: 0 }, uColor: { value: color } }}
                transparent
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </points>
    )
}

const PointsObj = ({ geometry, position, rotation, color, size, opacity = 1 }: any) => {
    return (
        <points position={position} rotation={rotation}>
            <primitive object={geometry} attach="geometry" />
            <pointsMaterial size={size} color={color} sizeAttenuation transparent opacity={opacity} />
        </points>
    );
};

export default WorldEnvironment;