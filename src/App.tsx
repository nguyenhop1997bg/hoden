import { useCallback, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import {
  AxonSceneCanvas,
  type CameraPreset,
  type SceneControlState,
  type SpectrumMode,
} from './scene/AxonSceneCanvas';

export default function App() {
  const [dockCollapsed, setDockCollapsed] = useState(true);
  const [captureSignal, setCaptureSignal] = useState(0);
  const [sceneControl, setSceneControl] = useState<SceneControlState>({
    cameraPreset: 'gargantua',
    motionSpeed: 1,
    spectrumMode: 'natural',
    spectralMorph: 0,
    autoMorph: false,
    autoOrbit: true,
    soundEnabled: false,
    cinemaTour: false,
  });

  const handleChangeCamera = useCallback((cameraPreset: CameraPreset) => {
    setSceneControl((prev) => ({
      ...prev,
      cameraPreset,
      cinemaTour: false,
    }));
  }, []);

  const handleChangeSpeed = useCallback((motionSpeed: number) => {
    setSceneControl((prev) => ({ ...prev, motionSpeed }));
  }, []);

  const handleChangeSpectrum = useCallback((spectrumMode: SpectrumMode) => {
    setSceneControl((prev) => ({
      ...prev,
      spectrumMode,
      spectralMorph: spectrumMode === 'xray' ? 1 : 0,
      autoMorph: false,
    }));
  }, []);

  const handleChangeSpectralMorph = useCallback((spectralMorph: number) => {
    setSceneControl((prev) => ({
      ...prev,
      spectralMorph,
      spectrumMode: spectralMorph > 0.5 ? 'xray' : 'natural',
      autoMorph: false,
    }));
  }, []);

  const handleToggleAutoMorph = useCallback(() => {
    setSceneControl((prev) => ({
      ...prev,
      autoMorph: !prev.autoMorph,
    }));
  }, []);

  const handleToggleAutoOrbit = useCallback(() => {
    setSceneControl((prev) => ({
      ...prev,
      autoOrbit: !prev.autoOrbit,
      cinemaTour: false,
    }));
  }, []);

  const handleToggleSound = useCallback(() => {
    setSceneControl((prev) => ({
      ...prev,
      soundEnabled: !prev.soundEnabled,
    }));
  }, []);

  const handleToggleCinemaTour = useCallback(() => {
    setSceneControl((prev) => ({
      ...prev,
      cinemaTour: !prev.cinemaTour,
    }));
  }, []);

  const handleCancelTour = useCallback(() => {
    setSceneControl((prev) =>
      prev.cinemaTour ? { ...prev, cinemaTour: false } : prev,
    );
  }, []);

  const handleCaptureSnapshot = useCallback(() => {
    setCaptureSignal((prev) => prev + 1);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setDockCollapsed((prev) => !prev);
  }, []);

  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#000001]">
      <AxonSceneCanvas
        controlState={sceneControl}
        captureSignal={captureSignal}
        onCancelTour={handleCancelTour}
      />

      <ControlDock
        controlState={sceneControl}
        collapsed={dockCollapsed}
        onToggleCollapse={handleToggleCollapse}
        onChangeCamera={handleChangeCamera}
        onChangeSpeed={handleChangeSpeed}
        onChangeSpectrum={handleChangeSpectrum}
        onChangeSpectralMorph={handleChangeSpectralMorph}
        onToggleAutoMorph={handleToggleAutoMorph}
        onToggleAutoOrbit={handleToggleAutoOrbit}
        onToggleSound={handleToggleSound}
        onToggleCinemaTour={handleToggleCinemaTour}
        onCaptureSnapshot={handleCaptureSnapshot}
      />
    </main>
  );
}
