import * as THREE from 'three';
import { createRelativisticBlackHoleMaterial } from './shaders';

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

export interface RelativisticBlackHoleAssembly {
  cosmosSphere: THREE.Mesh;
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

  return {
    cosmosSphere,
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
      noiseTex.dispose();
    },
  };
}
