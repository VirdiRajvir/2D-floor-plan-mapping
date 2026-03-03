'use client';

import { useRef, useEffect, useState, Suspense, useMemo } from 'react';
import { Canvas, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, Center, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { Model3DAsset } from '@/lib/types';

// ── PLY Mesh ────────────────────────────────────────────────
function PLYModel({ url }: { url: string }) {
  const geometry = useLoader(PLYLoader, url);

  const processedGeometry = useMemo(() => {
    geometry.computeVertexNormals();
    geometry.center();
    // Auto-scale to fit in a unit sphere
    geometry.computeBoundingSphere();
    const s = geometry.boundingSphere?.radius || 1;
    const scale = 2 / s;
    geometry.scale(scale, scale, scale);
    return geometry;
  }, [geometry]);

  const hasColors = processedGeometry.hasAttribute('color');

  return (
    <mesh geometry={processedGeometry}>
      {hasColors ? (
        <meshStandardMaterial vertexColors />
      ) : (
        <meshStandardMaterial color="#94a3b8" metalness={0.1} roughness={0.6} />
      )}
    </mesh>
  );
}

// ── OBJ Mesh ────────────────────────────────────────────────
function OBJModel({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);

  useEffect(() => {
    // Center and auto-scale
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 4 / maxDim;

    obj.position.sub(center);
    obj.scale.setScalar(scale);

    // Apply default material if missing
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (!mesh.material || (mesh.material as THREE.Material).type === 'MeshBasicMaterial') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: '#94a3b8',
            metalness: 0.1,
            roughness: 0.6,
          });
        }
      }
    });
  }, [obj]);

  return <primitive object={obj} />;
}

// ── Gaussian Splat Viewer (canvas-level, not part of R3F) ───
function GaussianSplatCanvas({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    async function init() {
      try {
        const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d');
        if (disposed) return;

        const viewer = new GaussianSplats3D.Viewer({
          cameraUp: [0, -1, 0],
          initialCameraPosition: [0, 0, 5],
          initialCameraLookAt: [0, 0, 0],
          rootElement: containerRef.current!,
          sharedMemoryForWorkers: false,
        });

        await viewer.addSplatScene(url);
        if (disposed) return;

        setLoading(false);
        viewer.start();

        return () => {
          disposed = true;
          viewer.dispose();
        };
      } catch (e) {
        if (!disposed) {
          setError(`Failed to load splat: ${e instanceof Error ? e.message : 'Unknown error'}`);
          setLoading(false);
        }
      }
    }

    const cleanup = init();
    return () => {
      disposed = true;
      cleanup?.then(fn => fn?.());
    };
  }, [url]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Loading Gaussian splat...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Auto-fit camera to scene ────────────────────────────────
function AutoFitCamera() {
  const { camera, scene } = useThree();

  useEffect(() => {
    const timer = setTimeout(() => {
      const box = new THREE.Box3().setFromObject(scene);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
      const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.5;
      camera.position.set(center.x + dist * 0.5, center.y + dist * 0.3, center.z + dist);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
    }, 100);
    return () => clearTimeout(timer);
  }, [camera, scene]);

  return null;
}

// ── Loading fallback ────────────────────────────────────────
function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#818cf8" wireframe />
    </mesh>
  );
}

// ── Main ThreeDViewer ───────────────────────────────────────
interface ThreeDViewerProps {
  asset: Model3DAsset;
}

export function ThreeDViewer({ asset }: ThreeDViewerProps) {
  const [error, setError] = useState<string | null>(null);

  // Gaussian splats use their own canvas
  if (asset.format === 'splat' || asset.renderMode === 'splat') {
    return <GaussianSplatCanvas url={asset.url} />;
  }

  return (
    <div className="w-full h-full relative">
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900/80">
          <div className="text-center text-red-400">
            <p className="text-sm font-medium">Failed to load 3D model</p>
            <p className="text-xs mt-1 text-slate-500">{error}</p>
          </div>
        </div>
      )}

      <Canvas
        camera={{ position: [3, 2, 5], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
        }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
        <directionalLight position={[-3, 3, -2]} intensity={0.4} />
        <hemisphereLight args={['#b1e1ff', '#b97a20', 0.3]} />

        <Suspense fallback={<LoadingFallback />}>
          <Center>
            {asset.format === 'ply' && <PLYModel url={asset.url} />}
            {asset.format === 'obj' && <OBJModel url={asset.url} />}
          </Center>
          <AutoFitCamera />
        </Suspense>

        <OrbitControls
          enableDamping
          dampingFactor={0.12}
          minDistance={0.5}
          maxDistance={50}
          makeDefault
        />

        {/* Grid helper */}
        <gridHelper args={[10, 20, '#334155', '#1e293b']} position={[0, -2, 0]} />
      </Canvas>
    </div>
  );
}
