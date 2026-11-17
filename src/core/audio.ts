// Tiny Web Audio synth. No audio files: every sound is generated on the fly.
import { store } from './storage';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (!store.settings.sound) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    master!.gain.value = store.settings.volume * 0.5;
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  type?: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  vol?: number;
  delay?: number;
}

function tone({ type = 'square', from, to, dur, vol = 0.3, delay = 0 }: ToneOpts): void {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.4, filterFreq = 1200, delay = 0): void {
  const c = ac();
  if (!c || !master || !noiseBuf) return;
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(filterFreq, t0);
  f.frequency.exponentialRampToValueAtTime(80, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** unlock audio on first gesture */
  prime(): void {
    ac();
  },
  key(): void {
    tone({ type: 'triangle', from: 1400 + Math.random() * 300, to: 900, dur: 0.035, vol: 0.12 });
  },
  laser(): void {
    tone({ type: 'sawtooth', from: 1800, to: 220, dur: 0.12, vol: 0.14 });
  },
  explode(big = false): void {
    noise(big ? 0.7 : 0.35, big ? 0.55 : 0.35, big ? 2200 : 1500);
    tone({ type: 'sine', from: big ? 160 : 220, to: 40, dur: big ? 0.6 : 0.25, vol: 0.3 });
  },
  error(): void {
    tone({ type: 'square', from: 140, to: 90, dur: 0.14, vol: 0.18 });
    noise(0.08, 0.15, 3000);
  },
  repair(streak = 0): void {
    const k = 1 + Math.min(streak, 24) * 0.035;
    tone({ type: 'triangle', from: 660 * k, dur: 0.06, vol: 0.14 });
    tone({ type: 'triangle', from: 990 * k, dur: 0.08, vol: 0.12, delay: 0.05 });
  },
  combo(level: number): void {
    const base = 440 * Math.pow(1.122, Math.min(level, 12));
    tone({ type: 'square', from: base, dur: 0.07, vol: 0.12 });
    tone({ type: 'square', from: base * 1.5, dur: 0.1, vol: 0.1, delay: 0.06 });
  },
  power(): void {
    [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'square', from: f, dur: 0.1, vol: 0.12, delay: i * 0.06 }));
  },
  hit(): void {
    noise(0.5, 0.5, 900);
    tone({ type: 'sawtooth', from: 300, to: 50, dur: 0.5, vol: 0.25 });
  },
  gameOver(): void {
    [392, 330, 262, 196].forEach((f, i) => tone({ type: 'sawtooth', from: f, to: f * 0.97, dur: 0.25, vol: 0.16, delay: i * 0.18 }));
  },
  win(): void {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.18, vol: 0.16, delay: i * 0.09 }));
  },
  achievement(): void {
    [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'square', from: f, dur: 0.12, vol: 0.1, delay: i * 0.07 }));
  },
  whoosh(): void {
    noise(0.45, 0.3, 4000);
    tone({ type: 'sine', from: 200, to: 1200, dur: 0.4, vol: 0.12 });
  },
  boot(): void {
    tone({ type: 'sine', from: 60, to: 420, dur: 0.8, vol: 0.2 });
    noise(0.3, 0.1, 6000, 0.5);
  },
  thud(): void {
    tone({ type: 'sine', from: 120, to: 45, dur: 0.18, vol: 0.22 });
    noise(0.1, 0.12, 600);
  },
  beep(high = false): void {
    tone({ type: 'square', from: high ? 1320 : 660, dur: high ? 0.35 : 0.16, vol: 0.14 });
  },
  skid(): void {
    noise(0.35, 0.22, 5000);
    tone({ type: 'sawtooth', from: 900, to: 400, dur: 0.3, vol: 0.06 });
  },
  hurt(): void {
    tone({ type: 'sawtooth', from: 220, to: 70, dur: 0.3, vol: 0.22 });
    noise(0.2, 0.25, 1400);
  },
  block(): void {
    tone({ type: 'triangle', from: 1500, to: 1200, dur: 0.12, vol: 0.16 });
    tone({ type: 'square', from: 300, dur: 0.08, vol: 0.1 });
  },
  snip(): void {
    noise(0.06, 0.3, 8000);
    tone({ type: 'square', from: 2400, to: 1800, dur: 0.05, vol: 0.1 });
  },
  tick(fast = false): void {
    tone({ type: 'square', from: fast ? 1800 : 1200, dur: 0.03, vol: 0.06 });
  },
  alarm(): void {
    tone({ type: 'square', from: 880, to: 660, dur: 0.18, vol: 0.12 });
  },
};

/** Continuous engine hum for Neon Racer. */
export function createEngine(): { set(speed: number): void; stop(): void } {
  const c = ac();
  if (!c || !master) return { set() {}, stop() {} };
  const osc = c.createOscillator();
  const osc2 = c.createOscillator();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  osc.type = 'sawtooth';
  osc2.type = 'square';
  f.type = 'lowpass';
  f.frequency.value = 500;
  g.gain.value = 0;
  osc.connect(f);
  osc2.connect(f);
  f.connect(g).connect(master);
  osc.start();
  osc2.start();
  return {
    set(speed: number) {
      const t = c.currentTime;
      const s = Math.max(0, Math.min(1, speed));
      osc.frequency.setTargetAtTime(48 + s * 110, t, 0.08);
      osc2.frequency.setTargetAtTime(24 + s * 55, t, 0.08);
      f.frequency.setTargetAtTime(300 + s * 1400, t, 0.1);
      g.gain.setTargetAtTime(0.035 + s * 0.06, t, 0.1);
    },
    stop() {
      const t = c.currentTime;
      g.gain.setTargetAtTime(0, t, 0.05);
      osc.stop(t + 0.3);
      osc2.stop(t + 0.3);
    },
  };
}
