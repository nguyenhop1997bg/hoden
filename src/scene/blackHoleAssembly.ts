import * as THREE from 'three';
import {
  createRelativisticBlackHoleMaterial,
  createTidalDisruptionMaterial,
} from './shaders';

function hash2Periodic(ix: number, iy: number, period: number, seed: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let n = (px * 374761393 + py * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const a = hash2Periodic(ix, iy, period, seed);
  const b = hash2Periodic(ix + 1, iy, period, seed);
  const c = hash2Periodic(ix, iy + 1, period, seed);
  const d = hash2Periodic(ix + 1, iy + 1, period, seed);

  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

function periodicFbm(u: number, v: number, basePeriod: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = basePeriod;
  for (let o = 0; o < 4; o++) {
    sum += amp * periodicValueNoise(u, v, period, seed + o * 97);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

function createSeamlessNoiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;
      data[idx] = Math.round(periodicFbm(u, v, 4, 11) * 255);
      data[idx + 1] = Math.round(periodicFbm(u, v, 8, 53) * 255);
      data[idx + 2] = Math.round(periodicFbm(u, v, 16, 131) * 255);
      data[idx + 3] = Math.round(periodicFbm(u, v, 6, 223) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function seededRand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export interface RelativisticBlackHoleAssembly {
  group: THREE.Group;
  uniforms: {
    uTime: { value: number };
    uSpectrumWeights: { value: THREE.Vector2 };
    uDirectTonemap: { value: number };
    uObserverRedshift: { value: number };
    uNoiseTex: { value: THREE.DataTexture };
  };
  dispose: () => void;
}

export function createRelativisticBlackHoleAssembly(): RelativisticBlackHoleAssembly {
  const noiseTex = createSeamlessNoiseTexture(256);
  const uTime = { value: 0 };
  const uSpectrumWeights = { value: new THREE.Vector2(0.0, 0.0) };
  const uDirectTonemap = { value: 0.0 };
  const uObserverRedshift = { value: 1.0 };
  const uNoiseTex = { value: noiseTex };

  const group = new THREE.Group();

  // 1) Raymarched Schwarzschild Black Hole & Accretion Disk
  const skyGeo = new THREE.SphereGeometry(100, 48, 36);
  const skyMat = createRelativisticBlackHoleMaterial({
    uTime,
    uSpectrumWeights,
    uDirectTonemap,
    uObserverRedshift,
    uNoiseTex,
  });
  const cosmosSphere = new THREE.Mesh(skyGeo, skyMat);
  cosmosSphere.frustumCulled = false;
  cosmosSphere.renderOrder = 0;
  group.add(cosmosSphere);

  // 2) Single-draw-call GPU-instanced Tidal Disruption Streams (180 curved filaments)
  const STREAM_COUNT = 180;
  const ribbonGeo = new THREE.PlaneGeometry(1, 1, 8, 1);
  const seeds = new Float32Array(STREAM_COUNT * 4);
  const tilts = new Float32Array(STREAM_COUNT * 2);

  for (let i = 0; i < STREAM_COUNT; i++) {
    const r0 = 3.8 + seededRand(i * 5 + 1) * 5.2;
    const phaseOffset = seededRand(i * 5 + 2);
    const phi0 = seededRand(i * 5 + 3) * Math.PI * 2;
    const speedRate = 0.065 + seededRand(i * 5 + 4) * 0.075;

    seeds[i * 4] = r0;
    seeds[i * 4 + 1] = phaseOffset;
    seeds[i * 4 + 2] = phi0;
    seeds[i * 4 + 3] = speedRate;

    // 75% closely hug the accretion plane; 25% dive from tilted halo orbits
    const haloStream = seededRand(i * 5 + 5) > 0.75;
    tilts[i * 2] = haloStream
      ? (seededRand(i * 7 + 1) - 0.5) * 0.55
      : (seededRand(i * 7 + 1) - 0.5) * 0.14;
    tilts[i * 2 + 1] = seededRand(i * 7 + 2) * Math.PI * 2;
  }

  ribbonGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  ribbonGeo.setAttribute('aTilt', new THREE.InstancedBufferAttribute(tilts, 2));

  const streamMat = createTidalDisruptionMaterial({
    uTime,
    uSpectrumWeights,
    uDirectTonemap,
  });

  const tidalStreams = new THREE.InstancedMesh(ribbonGeo, streamMat, STREAM_COUNT);
  tidalStreams.frustumCulled = false;
  tidalStreams.renderOrder = 1;
  group.add(tidalStreams);

  return {
    group,
    uniforms: {
      uTime,
      uSpectrumWeights,
      uDirectTonemap,
      uObserverRedshift,
      uNoiseTex,
    },
    dispose: () => {
      skyGeo.dispose();
      skyMat.dispose();
      ribbonGeo.dispose();
      streamMat.dispose();
      noiseTex.dispose();
    },
  };
}
