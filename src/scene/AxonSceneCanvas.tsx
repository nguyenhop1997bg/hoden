import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createRelativisticBlackHoleAssembly } from './blackHoleAssembly';
import { CinemaOpticsShader } from './shaders';
import { SpaceAudioEngine } from './spaceAudio';

export type CameraPreset = 'gargantua' | 'equatorial' | 'orbital' | 'horizon';
export type SpectrumMode = 'natural' | 'amber' | 'xray';

export interface SceneControlState {
  cameraPreset: CameraPreset;
  motionSpeed: number;
  spectrumMode: SpectrumMode;
  spectralMorph: number;
  autoMorph: boolean;
  autoOrbit: boolean;
  soundEnabled: boolean;
  cinemaTour: boolean;
}

interface AxonSceneCanvasProps {
  controlState: SceneControlState;
  captureSignal: number;
  onCancelTour?: () => void;
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  gargantua: { pos: [2.2, 2.7, 17.5], target: [0, 0, 0] },
  equatorial: { pos: [0.0, 0.38, 16.0], target: [0, 0, 0] },
  orbital: { pos: [-8.6, 9.2, 13.8], target: [0, 0, 0] },
  horizon: { pos: [3.2, 1.15, 6.2], target: [0, 0, 0] },
};

// Pre-allocated scratch math helpers & tour curve (zero GC in render loop)
const _presetCamVec = new THREE.Vector3();
const _presetTargetVec = new THREE.Vector3();
const _tourPosVec = new THREE.Vector3();
const _tourTargetVec = new THREE.Vector3(0, 0, 0);

const CINEMA_TOUR_CURVE = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(2.2, 2.7, 17.5),
    new THREE.Vector3(12.2, 1.35, 9.8),
    new THREE.Vector3(0.4, 0.42, -15.4),
    new THREE.Vector3(-11.4, 7.2, -9.2),
    new THREE.Vector3(-7.6, 2.9, 6.8),
    new THREE.Vector3(3.4, 1.12, 5.15),
    new THREE.Vector3(8.2, -2.1, 12.2),
  ],
  true,
  'catmullrom',
  0.5,
);

function getTargetDpr(w: number, h: number, isSoftwareGl: boolean): number {
  if (isSoftwareGl) return 1;
  const raw = window.devicePixelRatio || 1;
  const area = w * h;
  if (area > 2_000_000) return Math.min(raw, 1.0);
  if (area > 1_100_000) return Math.min(raw, 1.15);
  return Math.min(raw, 1.25);
}

function detectSoftwareWebGL(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) || '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export function AxonSceneCanvas({
  controlState,
  captureSignal,
  onCancelTour,
}: AxonSceneCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<SceneControlState>(controlState);
  const onCancelTourRef = useRef(onCancelTour);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const presetTriggerRef = useRef<{
    active: boolean;
    preset: CameraPreset;
  }>({ active: false, preset: controlState.cameraPreset });

  const autoMorphSyncRef = useRef(false);
  const requestWakeRef = useRef<(() => void) | null>(null);
  const captureActionRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<SpaceAudioEngine | null>(null);

  useEffect(() => {
    onCancelTourRef.current = onCancelTour;
  }, [onCancelTour]);

  useEffect(() => {
    const prevPreset = controlRef.current.cameraPreset;
    const prevSound = controlRef.current.soundEnabled;
    const prevAutoMorph = controlRef.current.autoMorph;
    controlRef.current = controlState;

    if (controlState.cinemaTour) {
      presetTriggerRef.current.active = false;
    } else if (prevPreset !== controlState.cameraPreset) {
      presetTriggerRef.current = {
        active: true,
        preset: controlState.cameraPreset,
      };
    }

    if (!prevAutoMorph && controlState.autoMorph) {
      autoMorphSyncRef.current = true;
    }

    if (prevSound !== controlState.soundEnabled) {
      void audioRef.current?.setEnabled(controlState.soundEnabled);
    }

    requestWakeRef.current?.();
  }, [controlState]);

  useEffect(() => {
    if (captureSignal > 0) {
      captureActionRef.current?.();
    }
  }, [captureSignal]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    let renderer: THREE.WebGLRenderer;
    const isSoftwareGl = detectSoftwareWebGL();

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const initialDpr = getTargetDpr(width, height, isSoftwareGl);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(initialDpr);
    renderer.setSize(width, height);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000001);

    const initialPreset = CAMERA_PRESETS[controlRef.current.cameraPreset];
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 240);
    camera.position.set(...initialPreset.pos);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(...initialPreset.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.045;
    controls.enablePan = false;
    controls.minDistance = 4.6;
    controls.maxDistance = 30.0;
    controls.minPolarAngle = 0.06;
    controls.maxPolarAngle = Math.PI - 0.06;
    controls.autoRotate =
      !isSoftwareGl &&
      !prefersReducedMotion &&
      controlRef.current.autoOrbit &&
      !controlRef.current.cinemaTour;
    controls.autoRotateSpeed = 0.18;
    controls.update();

    const assembly = createRelativisticBlackHoleAssembly();
    assembly.uniforms.uDirectTonemap.value = isSoftwareGl ? 1.0 : 0.0;
    scene.add(assembly.cosmosSphere);

    const audioEngine = new SpaceAudioEngine();
    audioRef.current = audioEngine;
    if (controlRef.current.soundEnabled) {
      void audioEngine.setEnabled(true);
    }

    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    let outputPass: OutputPass | null = null;
    let opticsPass: ShaderPass | null = null;

    if (!isSoftwareGl) {
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(initialDpr);
      composer.setSize(width, height);

      composer.addPass(new RenderPass(scene, camera));

      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.18,
        0.32,
        0.94,
      );
      composer.addPass(bloomPass);

      outputPass = new OutputPass();
      composer.addPass(outputPass);

      opticsPass = new ShaderPass(CinemaOpticsShader);
      opticsPass.uniforms.uResolution.value.set(width, height);
      composer.addPass(opticsPass);

      renderer.compile(scene, camera);
    }

    function renderFrame() {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    }

    captureActionRef.current = () => {
      if (disposed) return;
      renderFrame();
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'black-hole-singularity.png';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
    };

    let userDragging = false;

    const handleControlsStart = () => {
      userDragging = true;
      presetTriggerRef.current.active = false;
      if (controlRef.current.cinemaTour) {
        onCancelTourRef.current?.();
      }
    };

    const handleControlsEnd = () => {
      userDragging = false;
    };

    const handleControlsChange = () => {
      if (
        prefersReducedMotion ||
        (controlRef.current.motionSpeed === 0 &&
          !controlRef.current.cinemaTour &&
          !controlRef.current.autoMorph)
      ) {
        requestRender();
      }
    };

    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('end', handleControlsEnd);
    controls.addEventListener('change', handleControlsChange);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      cancelScheduledFrame();
      setWebglUnavailable(true);
    };
    const handleContextRestored = () => {
      setWebglUnavailable(false);
      requestRender();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const dpr = getTargetDpr(w, h, isSoftwareGl);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h);
      if (composer) {
        composer.setPixelRatio(dpr);
        composer.setSize(w, h);
      }
      if (bloomPass) {
        bloomPass.resolution.set(w, h);
      }
      if (opticsPass) {
        opticsPass.uniforms.uResolution.value.set(w, h);
      }
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    let frameId = 0;
    let disposed = false;
    let simTime = 14.2;
    let morphClock = 0.0;
    let lastTimestamp = performance.now();
    let renderBusy = false;
    let renderDirty = false;
    let currentAmber = controlRef.current.spectrumMode === 'amber' ? 1.0 : 0.0;
    let currentXray = controlRef.current.spectralMorph;
    let currentFov = 45.0;
    let currentRedshift = 1.0;
    let tourProgress = 0.0;

    function cancelScheduledFrame() {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function updateSceneTransforms(dt: number) {
      const {
        motionSpeed,
        spectrumMode,
        spectralMorph,
        autoMorph,
        autoOrbit,
        cinemaTour,
      } = controlRef.current;
      const effectiveSpeed = prefersReducedMotion ? 0 : motionSpeed;
      simTime += dt * effectiveSpeed;

      controls.autoRotate =
        !isSoftwareGl &&
        !prefersReducedMotion &&
        autoOrbit &&
        motionSpeed > 0 &&
        !userDragging &&
        !presetTriggerRef.current.active &&
        !cinemaTour;
      controls.autoRotateSpeed = 0.18 * Math.max(motionSpeed, 0.45);

      assembly.uniforms.uTime.value = simTime;

      const targetAmber = spectrumMode === 'amber' && !autoMorph ? 1.0 : 0.0;
      currentAmber += (targetAmber - currentAmber) * (1 - Math.exp(-3.2 * dt));

      if (autoMorph && !prefersReducedMotion) {
        if (autoMorphSyncRef.current) {
          const clamped = THREE.MathUtils.clamp(currentXray, 0, 1);
          morphClock = Math.acos(1.0 - 2.0 * clamped) / 0.28;
          autoMorphSyncRef.current = false;
        }
        const morphRate =
          effectiveSpeed > 0
            ? Math.min(Math.max(effectiveSpeed, 0.6), 1.5)
            : 0.85;
        morphClock += dt * morphRate;
        const targetAutoXray = 0.5 - 0.5 * Math.cos(morphClock * 0.28);
        currentXray +=
          (targetAutoXray - currentXray) * (1 - Math.exp(-4.0 * dt));
      } else {
        autoMorphSyncRef.current = false;
        currentXray += (spectralMorph - currentXray) * (1 - Math.exp(-2.2 * dt));
      }

      assembly.uniforms.uSpectrumWeights.value.set(currentAmber, currentXray);

      if (cinemaTour && !userDragging && !prefersReducedMotion) {
        const tourRate =
          effectiveSpeed > 0
            ? Math.min(Math.max(effectiveSpeed, 0.5), 1.6)
            : 0.75;
        tourProgress = (tourProgress + dt * 0.024 * tourRate) % 1.0;
        CINEMA_TOUR_CURVE.getPointAt(tourProgress, _tourPosVec);
        const tourAlpha = 1 - Math.exp(-3.2 * dt);
        camera.position.lerp(_tourPosVec, tourAlpha);
        controls.target.lerp(_tourTargetVec, 1 - Math.exp(-4.0 * dt));
      } else if (presetTriggerRef.current.active && !userDragging) {
        const presetData = CAMERA_PRESETS[presetTriggerRef.current.preset];
        _presetCamVec.set(...presetData.pos);
        _presetTargetVec.set(...presetData.target);

        const alpha = 1 - Math.exp(-3.8 * dt);
        camera.position.lerp(_presetCamVec, alpha);
        controls.target.lerp(_presetTargetVec, alpha);

        if (
          camera.position.distanceTo(_presetCamVec) < 0.02 &&
          controls.target.distanceTo(_presetTargetVec) < 0.02
        ) {
          camera.position.copy(_presetCamVec);
          controls.target.copy(_presetTargetVec);
          presetTriggerRef.current.active = false;
        }
      }

      controls.update();

      const camDist = camera.position.length();
      const proxRaw = THREE.MathUtils.clamp((16.0 - camDist) / (16.0 - 5.2), 0, 1);
      const prox = proxRaw * proxRaw * (3.0 - 2.0 * proxRaw);

      const targetFov = 43.0 + prox * 10.0;
      currentFov += (targetFov - currentFov) * (1 - Math.exp(-3.6 * dt));
      if (Math.abs(camera.fov - currentFov) > 0.01) {
        camera.fov = currentFov;
        camera.updateProjectionMatrix();
      }

      const targetRedshift = 1.0 - prox * 0.16;
      currentRedshift +=
        (targetRedshift - currentRedshift) * (1 - Math.exp(-4.0 * dt));
      assembly.uniforms.uObserverRedshift.value = currentRedshift;

      audioEngine.setProximity(camDist);
      audioEngine.setSpectralMix(currentXray);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min((now - lastTimestamp) / 1000, 0.05);
        lastTimestamp = now;
        updateSceneTransforms(dt);
        renderFrame();

        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    let loopActive = false;
    function startOrWakeLoop() {
      if (disposed) return;
      const continuous =
        !prefersReducedMotion &&
        (controlRef.current.motionSpeed > 0 ||
          presetTriggerRef.current.active ||
          controlRef.current.cinemaTour ||
          controlRef.current.autoMorph);

      if (continuous) {
        if (!loopActive) {
          loopActive = true;
          lastTimestamp = performance.now();
          const step = (now: number) => {
            if (disposed) return;
            const stillContinuous =
              !prefersReducedMotion &&
              (controlRef.current.motionSpeed > 0 ||
                presetTriggerRef.current.active ||
                controlRef.current.cinemaTour ||
                controlRef.current.autoMorph);
            if (!stillContinuous) {
              loopActive = false;
              requestRender();
              return;
            }
            const dt = Math.min((now - lastTimestamp) / 1000, 0.05);
            lastTimestamp = now;
            updateSceneTransforms(dt);
            renderFrame();
            if (isSoftwareGl) {
              afterDraw(() => step(performance.now()));
            } else {
              frameId = requestAnimationFrame(step);
            }
          };
          frameId = requestAnimationFrame(step);
        }
      } else {
        loopActive = false;
        requestRender();
      }
    }

    requestWakeRef.current = startOrWakeLoop;
    startOrWakeLoop();

    return () => {
      disposed = true;
      requestWakeRef.current = null;
      captureActionRef.current = null;
      audioRef.current = null;
      cancelScheduledFrame();

      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('end', handleControlsEnd);
      controls.removeEventListener('change', handleControlsChange);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);

      audioEngine.dispose();
      controls.dispose();
      bloomPass?.dispose();
      outputPass?.dispose();
      opticsPass?.dispose();
      composer?.dispose();
      assembly.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  if (webglUnavailable) {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_50%,rgba(245,158,11,0.22)_0%,rgba(20,10,4,0.65)_36%,#000001_74%)]"
      />
    );
  }

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing"
      aria-label="Relativistic Kerr Black Hole Light Capture Simulation"
    />
  );
}
