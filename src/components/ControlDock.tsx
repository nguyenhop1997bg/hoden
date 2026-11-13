import { useEffect } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  Film,
  Pause,
  Play,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import type {
  CameraPreset,
  SceneControlState,
  SpectrumMode,
} from '../scene/AxonSceneCanvas';

interface ControlDockProps {
  controlState: SceneControlState;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onChangeCamera: (preset: CameraPreset) => void;
  onChangeSpeed: (speed: number) => void;
  onChangeSpectrum: (mode: SpectrumMode) => void;
  onChangeSpectralMorph: (value: number) => void;
  onToggleAutoMorph: () => void;
  onToggleAutoOrbit: () => void;
  onToggleSound: () => void;
  onToggleCinemaTour: () => void;
  onCaptureSnapshot: () => void;
}

const CAMERA_OPTIONS: { id: CameraPreset; label: string }[] = [
  { id: 'gargantua', label: 'Gargantua' },
  { id: 'equatorial', label: 'Edge-On' },
  { id: 'orbital', label: 'Orbital' },
  { id: 'horizon', label: 'Horizon' },
];

const SPEED_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Pause' },
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
];

const SPECTRUM_OPTIONS: { id: SpectrumMode; label: string }[] = [
  { id: 'natural', label: 'Natural' },
  { id: 'amber', label: 'Amber' },
  { id: 'xray', label: 'X-Ray' },
];

export function ControlDock({
  controlState,
  collapsed,
  onToggleCollapse,
  onChangeCamera,
  onChangeSpeed,
  onChangeSpectrum,
  onChangeSpectralMorph,
  onToggleAutoMorph,
  onToggleAutoOrbit,
  onToggleSound,
  onToggleCinemaTour,
  onCaptureSnapshot,
}: ControlDockProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        onToggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleCollapse]);

  return (
    <div
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[96vw] pointer-events-none"
      aria-label="Black hole simulation controls"
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show controls (H)' : 'Hide controls (H)'}
        className={`pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#08060d]/82 px-2.5 py-1.5 text-xs font-medium transition-opacity duration-200 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F8FAFC] ${
          collapsed
            ? 'text-[#F8FAFC]/50 opacity-50 hover:opacity-100 hover:text-[#F8FAFC]'
            : 'text-[#F8FAFC]/85 opacity-100'
        }`}
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Hide</span>
          </>
        )}
      </button>

      <div
        className={`pointer-events-auto transition-[transform,opacity] duration-200 ease-out origin-bottom ${
          collapsed
            ? 'translate-y-6 opacity-0 pointer-events-none h-0 overflow-hidden'
            : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="flex flex-wrap xl:flex-nowrap items-center justify-center gap-2 rounded-xl border border-white/14 bg-[#08060d]/92 px-3 py-2 shadow-[0_12px_36px_rgba(0,0,0,0.72)]">
          {/* Camera Presets */}
          <div
            className="flex items-center gap-1 rounded-lg bg-[#12101a] p-1"
            role="group"
            aria-label="Camera angle"
          >
            <Eye className="w-3.5 h-3.5 text-[#CBD5E1]/70 ml-1.5 mr-1 shrink-0" aria-hidden="true" />
            {CAMERA_OPTIONS.map((opt) => {
              const active =
                !controlState.cinemaTour && controlState.cameraPreset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeCamera(opt.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F8FAFC] ${
                    active
                      ? 'bg-[#F8FAFC] text-[#020107] shadow-xs'
                      : 'text-[#CBD5E1] hover:text-[#F8FAFC]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="hidden xl:block w-px h-5 bg-white/12" aria-hidden="true" />

          {/* Time Dilation Speed */}
          <div
            className="flex items-center gap-1 rounded-lg bg-[#12101a] p-1"
            role="group"
            aria-label="Simulation speed"
          >
            {controlState.motionSpeed === 0 ? (
              <Pause className="w-3.5 h-3.5 text-[#CBD5E1]/70 ml-1.5 mr-1 shrink-0" aria-hidden="true" />
            ) : (
              <Play className="w-3.5 h-3.5 text-[#CBD5E1]/70 ml-1.5 mr-1 shrink-0" aria-hidden="true" />
            )}
            {SPEED_OPTIONS.map((opt) => {
              const active = controlState.motionSpeed === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => onChangeSpeed(opt.value)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md tabular-nums transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F8FAFC] ${
                    active
                      ? 'bg-[#F8FAFC] text-[#020107] shadow-xs'
                      : 'text-[#CBD5E1] hover:text-[#F8FAFC]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="hidden xl:block w-px h-5 bg-white/12" aria-hidden="true" />

          {/* Spectrum Filter + Continuous Natural -> X-Ray Morph Slider */}
          <div
            className="flex items-center gap-1.5 rounded-lg bg-[#12101a] p-1"
            role="group"
            aria-label="Spectral grade"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#CBD5E1]/70 ml-1.5 shrink-0" aria-hidden="true" />
            {SPECTRUM_OPTIONS.map((opt) => {
              const active =
                !controlState.autoMorph &&
                controlState.spectrumMode === opt.id &&
                (opt.id !== 'natural' || controlState.spectralMorph < 0.05) &&
                (opt.id !== 'xray' || controlState.spectralMorph > 0.95);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeSpectrum(opt.id)}
                  className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F8FAFC] ${
                    active
                      ? 'bg-[#F8FAFC] text-[#020107] shadow-xs'
                      : 'text-[#CBD5E1] hover:text-[#F8FAFC]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}

            <div className="flex items-center gap-1.5 px-1.5">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={controlState.spectralMorph}
                onChange={(e) => onChangeSpectralMorph(parseFloat(e.target.value))}
                aria-label="Natural to X-Ray spectral morph"
                className="w-16 sm:w-20 h-1.5 accent-sky-400 cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={onToggleAutoMorph}
              aria-pressed={controlState.autoMorph}
              aria-label="Toggle automatic Natural to X-Ray spectral morph"
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F8FAFC] ${
                controlState.autoMorph
                  ? 'bg-sky-500/25 text-sky-200'
                  : 'text-[#CBD5E1]/75 hover:text-[#F8FAFC]'
              }`}
            >
              <Waves className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Morph</span>
            </button>
          </div>

          <div className="hidden xl:block w-px h-5 bg-white/12" aria-hidden="true" />

          {/* Utility toggles: Drift, Cinema Tour, Sound, Capture */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleAutoOrbit}
              aria-pressed={controlState.autoOrbit}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F8FAFC] ${
                controlState.autoOrbit && !controlState.cinemaTour
                  ? 'border-amber-400/40 bg-amber-500/18 text-amber-200'
                  : 'border-white/12 bg-transparent text-[#CBD5E1]/75 hover:text-[#F8FAFC]'
              }`}
            >
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Drift</span>
            </button>

            <button
              type="button"
              onClick={onToggleCinemaTour}
              aria-pressed={controlState.cinemaTour}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F8FAFC] ${
                controlState.cinemaTour
                  ? 'border-amber-400/40 bg-amber-500/18 text-amber-200'
                  : 'border-white/12 bg-transparent text-[#CBD5E1]/75 hover:text-[#F8FAFC]'
              }`}
            >
              <Film className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tour</span>
            </button>

            <button
              type="button"
              onClick={onToggleSound}
              aria-pressed={controlState.soundEnabled}
              aria-label={controlState.soundEnabled ? 'Mute deep-space audio' : 'Enable deep-space audio'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F8FAFC] ${
                controlState.soundEnabled
                  ? 'border-amber-400/40 bg-amber-500/18 text-amber-200'
                  : 'border-white/12 bg-transparent text-[#CBD5E1]/75 hover:text-[#F8FAFC]'
              }`}
            >
              {controlState.soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>Sound</span>
            </button>

            <button
              type="button"
              onClick={onCaptureSnapshot}
              aria-label="Capture PNG snapshot"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/12 bg-transparent text-[#CBD5E1]/80 hover:text-[#F8FAFC] hover:border-white/25 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F8FAFC]"
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Capture</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
