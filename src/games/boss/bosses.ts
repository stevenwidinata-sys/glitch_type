// The 5 glitch bosses: stats, special mechanics and how each one is drawn.

export interface BossView {
  t: number;
  hurt: number; // 0..1 flash after taking damage
  windup: number; // 0..1 while charging an attack
  shield: boolean;
  heads: boolean[]; // hydra: which heads are alive
  dying: number; // 0..1 death animation
  offsetX: number; // phantom teleport
}

export interface BossDef {
  n: number;
  id: string;
  name: string;
  title: string;
  color: string;
  hp: number;
  attackLen: [number, number];
  blockLen: [number, number];
  windup: number; // seconds you get to type the block word
  interval: number; // seconds between attacks
  damage: number;
  heads?: number;
  shieldEvery?: number; // firewall golem: raises a shield every N seconds
  lag?: boolean; // phantom: words fade and blink
  double?: boolean; // kernel: some attacks need two block words
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: BossView): void;
}

function glow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function eyes(ctx: CanvasRenderingContext2D, xs: number[], y: number, r: number, color: string, angry: number): void {
  ctx.fillStyle = color;
  glow(ctx, color, 18);
  for (const x of xs) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.55 - angry * 0.25), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

// ---------------- 1. BITBUG ----------------
function drawBitbug(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: BossView): void {
  const bob = Math.sin(v.t * 4) * s * 0.03;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.lineCap = 'round';
  // legs
  ctx.strokeStyle = '#2bd876';
  ctx.lineWidth = s * 0.025;
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const a = Math.sin(v.t * 9 + i * 2 + (side > 0 ? 1 : 0)) * 0.3;
      const bx = side * s * 0.18;
      const by = -s * 0.05 + i * s * 0.12;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + side * s * 0.25, by - s * 0.08 + a * s * 0.1);
      ctx.lineTo(bx + side * s * 0.38, by + s * 0.12 + a * s * 0.08);
      ctx.stroke();
    }
  }
  // body segments
  glow(ctx, '#39ff88', 24);
  ctx.fillStyle = '#0a2a18';
  ctx.strokeStyle = '#39ff88';
  ctx.lineWidth = s * 0.018;
  for (const [cy, rx, ry] of [
    [s * 0.22, s * 0.2, s * 0.17],
    [s * 0.02, s * 0.22, s * 0.14],
    [-s * 0.18, s * 0.16, s * 0.12],
  ]) {
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // antennae with glitch pixels
  ctx.strokeStyle = '#39ff88';
  ctx.lineWidth = s * 0.012;
  for (const side of [-1, 1]) {
    const tip = { x: side * s * 0.22, y: -s * 0.48 + Math.sin(v.t * 6 + side) * s * 0.03 };
    ctx.beginPath();
    ctx.moveTo(side * s * 0.05, -s * 0.28);
    ctx.quadraticCurveTo(side * s * 0.1, -s * 0.45, tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = Math.random() < 0.5 ? '#ff2bd6' : '#00f0ff';
    ctx.fillRect(tip.x - s * 0.02, tip.y - s * 0.02, s * 0.04, s * 0.04);
  }
  eyes(ctx, [-s * 0.07, s * 0.07], -s * 0.2, s * 0.045, v.windup > 0 ? '#ff2b4d' : '#eaffef', v.windup);
  // glitch slices
  if (Math.random() < 0.15) {
    ctx.fillStyle = 'rgba(57,255,136,0.35)';
    ctx.fillRect(-s * 0.4, (Math.random() - 0.5) * s * 0.6, s * 0.8, s * 0.03);
  }
  ctx.restore();
}

// ---------------- 2. FIREWALL GOLEM ----------------
function drawGolem(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: BossView): void {
  ctx.save();
  ctx.translate(x, y + Math.sin(v.t * 2) * s * 0.015);
  const brick = (bx: number, by: number, w: number, h: number) => {
    ctx.fillStyle = '#2a0d05';
    ctx.strokeStyle = '#ff7a2b';
    ctx.lineWidth = s * 0.01;
    ctx.fillRect(bx, by, w, h);
    ctx.strokeRect(bx, by, w, h);
  };
  glow(ctx, '#ff7a2b', 16);
  // legs
  brick(-s * 0.22, s * 0.22, s * 0.16, s * 0.24);
  brick(s * 0.06, s * 0.22, s * 0.16, s * 0.24);
  // arms swing during windup
  const swing = v.windup * 0.6;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * s * 0.3, -s * 0.15);
    ctx.rotate(side * (0.2 + swing) * -1);
    brick(-s * 0.07, 0, s * 0.14, s * 0.36);
    ctx.restore();
  }
  // torso of bricks
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      brick(-s * 0.27 + c * s * 0.18 + (r % 2 ? s * 0.04 : 0), -s * 0.25 + r * s * 0.12, s * 0.17, s * 0.11);
    }
  }
  // head
  brick(-s * 0.13, -s * 0.44, s * 0.26, s * 0.18);
  ctx.shadowBlur = 0;
  // lava core
  const core = ctx.createRadialGradient(0, -s * 0.05, 0, 0, -s * 0.05, s * 0.12);
  core.addColorStop(0, '#fff6a0');
  core.addColorStop(0.5, '#ff7a2b');
  core.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, -s * 0.05, s * (0.11 + Math.sin(v.t * 5) * 0.01), 0, Math.PI * 2);
  ctx.fill();
  eyes(ctx, [-s * 0.05, s * 0.05], -s * 0.36, s * 0.03, v.windup > 0 ? '#ff2b4d' : '#ffe94a', v.windup);
  // firewall shield
  if (v.shield) {
    for (let i = 0; i < 16; i++) {
      const fx = -s * 0.55 + (i / 15) * s * 1.1;
      const fh = s * (0.5 + 0.25 * Math.sin(v.t * 12 + i * 1.7));
      const g = ctx.createLinearGradient(0, s * 0.45, 0, s * 0.45 - fh);
      g.addColorStop(0, 'rgba(255,90,0,0.9)');
      g.addColorStop(1, 'rgba(255,230,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(fx - s * 0.05, s * 0.45);
      ctx.quadraticCurveTo(fx, s * 0.45 - fh * 1.2, fx + s * 0.05, s * 0.45);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------- 3. CAPTCHA HYDRA ----------------
export function hydraHeadPos(x: number, y: number, s: number, i: number, t: number): { x: number; y: number } {
  const spread = [-0.42, 0, 0.42][i];
  return { x: x + spread * s + Math.sin(t * 1.6 + i * 2) * s * 0.04, y: y - s * (i === 1 ? 0.42 : 0.3) + Math.cos(t * 2 + i) * s * 0.03 };
}

function drawHydra(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: BossView): void {
  ctx.save();
  // body
  glow(ctx, '#00f0ff', 20);
  ctx.fillStyle = '#04202a';
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = s * 0.015;
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.25, s * 0.35, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const alive = v.heads[i] ?? true;
    const hp = hydraHeadPos(x, y, s, i, v.t);
    const droop = alive ? 0 : s * 0.35;
    // neck
    ctx.strokeStyle = alive ? '#00f0ff' : '#355';
    ctx.lineWidth = s * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + (i - 1) * s * 0.15, y + s * 0.15);
    ctx.quadraticCurveTo(x + (i - 1) * s * 0.4, y - s * 0.05 + droop * 0.4, hp.x, hp.y + droop);
    ctx.stroke();
    ctx.strokeStyle = alive ? '#04202a' : '#122';
    ctx.lineWidth = s * 0.045;
    ctx.stroke();
    // head
    ctx.save();
    ctx.translate(hp.x, hp.y + droop);
    ctx.rotate(alive ? Math.sin(v.t * 2 + i) * 0.1 : 0.9);
    ctx.fillStyle = alive ? '#06303d' : '#1a2224';
    ctx.strokeStyle = alive ? '#00f0ff' : '#355';
    ctx.lineWidth = s * 0.012;
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.06);
    ctx.lineTo(s * 0.12, -s * 0.03);
    ctx.lineTo(s * 0.14, s * 0.04);
    ctx.lineTo(-s * 0.1, s * 0.07);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (alive) {
      // distorted captcha squiggle on the head
      ctx.strokeStyle = '#ff2bd6';
      ctx.lineWidth = s * 0.006;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) ctx.lineTo(-s * 0.07 + k * s * 0.035, Math.sin(v.t * 8 + k) * s * 0.015);
      ctx.stroke();
      eyes(ctx, [s * 0.05], -s * 0.02, s * 0.022, v.windup > 0 ? '#ff2b4d' : '#eaffff', v.windup);
    }
    ctx.restore();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ---------------- 4. LAG PHANTOM ----------------
function drawPhantom(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: BossView): void {
  ctx.save();
  ctx.translate(x + v.offsetX * s, y + Math.sin(v.t * 2.5) * s * 0.05);
  ctx.globalAlpha = 0.55 + 0.35 * Math.abs(Math.sin(v.t * 3)) * (Math.random() < 0.08 ? 0.2 : 1);
  glow(ctx, '#d6b8ff', 30);
  const g = ctx.createLinearGradient(0, -s * 0.45, 0, s * 0.4);
  g.addColorStop(0, 'rgba(230,215,255,0.95)');
  g.addColorStop(1, 'rgba(155,77,255,0.15)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-s * 0.28, s * 0.35);
  ctx.bezierCurveTo(-s * 0.32, -s * 0.2, -s * 0.2, -s * 0.48, 0, -s * 0.48);
  ctx.bezierCurveTo(s * 0.2, -s * 0.48, s * 0.32, -s * 0.2, s * 0.28, s * 0.35);
  for (let i = 0; i <= 6; i++) {
    const wx = s * 0.28 - (i / 6) * s * 0.56;
    ctx.lineTo(wx, s * 0.35 + Math.sin(v.t * 6 + i) * s * 0.05 + (i % 2 ? s * 0.06 : 0));
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  // hollow eyes + loading spinner mouth
  ctx.fillStyle = '#0b0018';
  for (const ex of [-s * 0.09, s * 0.09]) {
    ctx.beginPath();
    ctx.ellipse(ex, -s * 0.18, s * 0.05, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (v.windup > 0) eyes(ctx, [-s * 0.09, s * 0.09], -s * 0.18, s * 0.025, '#ff2b4d', 0);
  ctx.strokeStyle = '#0b0018';
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.arc(0, s * 0.02, s * 0.06, v.t * 6, v.t * 6 + Math.PI * 1.5);
  ctx.stroke();
  // afterimages
  if (Math.random() < 0.3) {
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#9b4dff';
    ctx.fillRect(-s * 0.3 + (Math.random() - 0.5) * s * 0.3, -s * 0.4, s * 0.6, s * 0.05);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ---------------- 5. THE KERNEL ----------------
function drawKernel(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: BossView): void {
  ctx.save();
  ctx.translate(x, y);
  // tendrils
  ctx.strokeStyle = 'rgba(255,60,80,0.6)';
  ctx.lineWidth = s * 0.012;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + v.t * 0.3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * s * 0.25, Math.sin(a) * s * 0.25);
    for (let k = 1; k <= 5; k++) {
      const r = s * (0.25 + k * 0.06);
      ctx.lineTo(Math.cos(a + Math.sin(v.t * 2 + k + i) * 0.2) * r, Math.sin(a + Math.sin(v.t * 2 + k + i) * 0.2) * r);
    }
    ctx.stroke();
  }
  // rotating hex rings
  for (let ring = 0; ring < 3; ring++) {
    ctx.save();
    ctx.rotate(v.t * (ring % 2 ? -0.6 : 0.4) * (1 + v.windup * 3));
    ctx.strokeStyle = ring === 1 ? '#ffe94a' : '#ff2b4d';
    glow(ctx, ctx.strokeStyle, 16);
    ctx.lineWidth = s * 0.012;
    const r = s * (0.18 + ring * 0.09);
    ctx.beginPath();
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    // circuit nodes
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.cos(a) * r - s * 0.008, Math.sin(a) * r - s * 0.008, s * 0.016, s * 0.016);
    }
    ctx.restore();
  }
  ctx.shadowBlur = 0;
  // core eye
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.14);
  core.addColorStop(0, '#fff');
  core.addColorStop(0.3, v.windup > 0 ? '#ff2b4d' : '#ffe94a');
  core.addColorStop(1, 'rgba(120,0,20,0.9)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(Math.sin(v.t) * s * 0.03, 0, s * 0.025, s * 0.08 * (1 - v.windup * 0.5), 0, 0, Math.PI * 2);
  ctx.fill();
  if (v.shield) {
    ctx.strokeStyle = 'rgba(0,240,255,0.8)';
    glow(ctx, '#00f0ff', 20);
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

export const BOSSES: BossDef[] = [
  {
    n: 1, id: 'bitbug', name: 'BITBUG', title: 'the glitch insect', color: '#39ff88',
    hp: 200, attackLen: [3, 4], blockLen: [3, 4], windup: 4.2, interval: 6, damage: 18, draw: drawBitbug,
  },
  {
    n: 2, id: 'golem', name: 'FIREWALL GOLEM', title: 'blocks everything', color: '#ff7a2b',
    hp: 380, attackLen: [4, 5], blockLen: [4, 5], windup: 3.8, interval: 5.5, damage: 20, shieldEvery: 11, draw: drawGolem,
  },
  {
    n: 3, id: 'hydra', name: 'CAPTCHA HYDRA', title: 'prove you are human', color: '#00f0ff',
    hp: 450, attackLen: [4, 6], blockLen: [4, 5], windup: 3.6, interval: 5, damage: 20, heads: 3, draw: drawHydra,
  },
  {
    n: 4, id: 'phantom', name: 'LAG PHANTOM', title: '999ms of pure fear', color: '#c9a6ff',
    hp: 500, attackLen: [5, 6], blockLen: [4, 6], windup: 3.4, interval: 4.8, damage: 22, lag: true, draw: drawPhantom,
  },
  {
    n: 5, id: 'kernel', name: 'THE KERNEL', title: 'root of all errors', color: '#ff2b4d',
    hp: 700, attackLen: [6, 9], blockLen: [5, 7], windup: 3.4, interval: 4.4, damage: 24, shieldEvery: 14, double: true, draw: drawKernel,
  },
];
