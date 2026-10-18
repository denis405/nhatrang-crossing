import type { VehicleKind } from '../game/vehicles';

/** Tiny WebAudio synth: every sound is generated, no files. */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Must be called from a user gesture (iOS). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      this.startAmbience();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startAmbience(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.value = 0;
    // slow wobble so the traffic "breathes"
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 80;
    lfo.connect(lfoGain).connect(lp.frequency);
    src.connect(lp).connect(g).connect(this.master!);
    src.start();
    lfo.start();
    this.ambience = g;
  }

  /** 0..1 traffic loudness. */
  setTraffic(level: number): void {
    if (!this.ambience || !this.ctx) return;
    this.ambience.gain.setTargetAtTime(0.05 + level * 0.12, this.ctx.currentTime, 0.4);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slide = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, vol: number, at = 0): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur);
  }

  step(): void {
    this.burst(0.05, 1800, 0.12);
  }

  tick(): void {
    this.tone(1320, 0.03, 'square', 0.035);
  }

  horn(kind: VehicleKind): void {
    const j = 1 + (Math.random() - 0.5) * 0.12;
    switch (kind) {
      case 'bus':
        this.tone(196 * j, 0.45, 'sawtooth', 0.09);
        this.tone(247 * j, 0.45, 'sawtooth', 0.06);
        break;
      case 'car':
        this.tone(392 * j, 0.22, 'square', 0.05);
        this.tone(466 * j, 0.22, 'square', 0.04);
        break;
      default: {
        // the classic "bíp bíp" of a scooter
        const f = (kind === 'grab' ? 620 : kind === 'tourist' ? 470 : 540) * j;
        this.tone(f, 0.08, 'square', 0.05);
        this.tone(f, 0.08, 'square', 0.05, 0.12);
      }
    }
  }

  nearMiss(): void {
    this.burst(0.35, 600, 0.18);
  }

  crash(): void {
    this.burst(0.5, 300, 0.6);
    this.burst(0.25, 1200, 0.35, 0.03);
    this.tone(110, 0.3, 'triangle', 0.25, 0, -60);
  }

  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'square', 0.05, i * 0.1));
  }
}

export const sfx = new Sfx();
