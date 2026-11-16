import type { Rng } from '../../core/rng';
import type { Power } from './levels';

export type RockKind = 'letter' | 'word' | 'boss' | 'power';

export interface Rock {
  id: number;
  kind: RockKind;
  text: string; // lowercase target text
  typed: number;
  power?: Power;
  // path from the black hole to the ground
  sx: number;
  sy: number;
  tx: number;
  curve: number;
  p: number; // 0..1 progress
  fall: number; // seconds to fall
  x: number;
  y: number;
  r: number;
  rot: number;
  spin: number;
  shape: number[]; // radius multipliers
  hue: string;
  dead: boolean;
  flash: number;
  /** armored rocks need their word typed this many extra times */
  armor: number;
  /** splitter rocks break into two letter rocks */
  splitter: boolean;
  trail: { x: number; y: number }[];
}

export interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  color: string;
}

export interface FloatNum {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  size: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

export interface Laser {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  color: string;
}

let nextId = 1;

export function makeRock(
  rng: Rng,
  kind: RockKind,
  text: string,
  from: { x: number; y: number },
  toX: number,
  fall: number,
  power?: Power,
): Rock {
  const r = kind === 'boss' ? 58 : kind === 'letter' ? 24 : kind === 'power' ? 30 : Math.min(46, 20 + text.length * 3);
  const pts = kind === 'boss' ? 14 : 10;
  const shape = Array.from({ length: pts }, () => 0.72 + rng() * 0.36);
  const hue = kind === 'boss' ? '#ff3860' : kind === 'power' ? '#ffe94a' : kind === 'word' ? '#b14dff' : '#00f0ff';
  return {
    id: nextId++,
    kind,
    text,
    typed: 0,
    power,
    sx: from.x,
    sy: from.y,
    tx: toX,
    curve: (rng() - 0.5) * 2,
    p: 0,
    fall,
    x: from.x,
    y: from.y,
    r,
    rot: rng() * Math.PI * 2,
    spin: (rng() - 0.5) * 2,
    shape,
    hue,
    dead: false,
    flash: 0,
    armor: 0,
    splitter: false,
    trail: [],
  };
}

export function burst(list: Particle[], x: number, y: number, n: number, colors: string[], speed = 260): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random());
    const life = 0.4 + Math.random() * 0.6;
    list.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      max: life,
      size: 1.5 + Math.random() * 3,
      color: colors[i % colors.length],
    });
  }
}

export function debrisBurst(list: Debris[], x: number, y: number, n: number, color: string, size: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 260;
    list.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 12,
      size: size * (0.25 + Math.random() * 0.35),
      life: 0.7 + Math.random() * 0.5,
      color,
    });
  }
}
