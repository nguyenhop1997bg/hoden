export class SpaceAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private subOscA: OscillatorNode | null = null;
  private subOscB: OscillatorNode | null = null;
  private padOsc: OscillatorNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private enabled = false;
  private disposed = false;

  private ensureInitialized() {
    if (this.ctx || this.disposed) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0, ctx.currentTime);
    masterGain.connect(ctx.destination);
    this.masterGain = masterGain;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(160, ctx.currentTime);
    lowpass.Q.setValueAtTime(1.4, ctx.currentTime);
    lowpass.connect(masterGain);
    this.filterNode = lowpass;

    // Deep gravitational sub-bass drone (41.5 Hz + 42.2 Hz gentle beating)
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.24, ctx.currentTime);
    subGain.connect(lowpass);

    const oscA = ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.setValueAtTime(41.5, ctx.currentTime);
    oscA.connect(subGain);
    oscA.start();
    this.subOscA = oscA;

    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.setValueAtTime(42.15, ctx.currentTime);
    const oscBGain = ctx.createGain();
    oscBGain.gain.setValueAtTime(0.18, ctx.currentTime);
    oscB.connect(oscBGain);
    oscBGain.connect(lowpass);
    oscB.start();
    this.subOscB = oscB;

    // Subtle cosmic fifth harmonic
    const padOsc = ctx.createOscillator();
    padOsc.type = 'sine';
    padOsc.frequency.setValueAtTime(124.5, ctx.currentTime);
    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0.032, ctx.currentTime);
    padOsc.connect(padGain);
    padGain.connect(lowpass);
    padOsc.start();
    this.padOsc = padOsc;

    // Procedural stereo pink-filtered cosmic radiation wind
    const sampleRate = ctx.sampleRate;
    const bufferLen = sampleRate * 4;
    const noiseBuf = ctx.createBuffer(2, bufferLen, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = noiseBuf.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < bufferLen; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.06;
      }
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(260, ctx.currentTime);
    bandpass.Q.setValueAtTime(0.9, ctx.currentTime);
    this.noiseFilter = bandpass;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.32, ctx.currentTime);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.065, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(95, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(bandpass.frequency);
    lfo.start();
    this.lfoOsc = lfo;

    noiseSrc.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start();
    this.noiseSource = noiseSrc;
  }

  public async setEnabled(enable: boolean) {
    if (this.disposed) return;
    this.enabled = enable;

    if (enable) {
      this.ensureInitialized();
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => {});
      }
      if (this.ctx && this.masterGain) {
        this.masterGain.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.35);
      }
    } else if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.25);
    }
  }

  public setProximity(distance: number) {
    if (!this.enabled || !this.ctx || !this.filterNode || !this.subOscA) return;
    const t = Math.min(Math.max((distance - 4.6) / 14.0, 0), 1);
    const cutoff = 95 + t * 145;
    const baseFreq = 37.5 + t * 5.0;
    const now = this.ctx.currentTime;
    this.filterNode.frequency.setTargetAtTime(cutoff, now, 0.25);
    this.subOscA.frequency.setTargetAtTime(baseFreq, now, 0.25);
  }

  public setSpectralMix(xrayMix: number) {
    if (!this.enabled || !this.ctx || !this.padOsc || !this.noiseFilter) return;
    const m = Math.min(Math.max(xrayMix, 0), 1);
    const now = this.ctx.currentTime;
    this.padOsc.frequency.setTargetAtTime(124.5 + m * 62.25, now, 0.3);
    this.noiseFilter.frequency.setTargetAtTime(260 + m * 170, now, 0.3);
  }

  public dispose() {
    this.disposed = true;
    try {
      this.subOscA?.stop();
      this.subOscB?.stop();
      this.padOsc?.stop();
      this.noiseSource?.stop();
      this.lfoOsc?.stop();
      this.ctx?.close().catch(() => {});
    } catch {
      // Ignore cleanup errors on already-closed AudioContext
    }
    this.ctx = null;
  }
}
