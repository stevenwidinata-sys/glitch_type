// Per-game crate opening animations (closing = the same animation reversed).
// Each animation is a pure function of t (0 = crate in the claw, 1 = screen
// fully covered), drawn on a full-screen overlay canvas that survives the
// route change, so the transition into the game is seamless.
import type { CrateDef, GameId } from './crates';
import { drawCrateFace } from './crate-art';
import { sfx } from '../../core/audio';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Scene {
  W: number;
  H: number;
  rect: Rect;
  def: CrateDef;
  face: HTMLCanvasElement; // pre-rendered crate front
  seed: number[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeIn = (t: number) => t * t * t;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** crate position/size moving from its rect to the screen center, grown by `grow` */
function crateAt(s: Scene, p: number, grow: number) {
  const cx = lerp(s.rect.x + s.rect.w / 2, s.W / 2, p);
  const cy = lerp(s.rect.y + s.rect.h / 2, s.H / 2, p);
  const targetW = Math.min(s.W * 0.62, s.H * 0.9 * (s.rect.w / s.rect.h)) * grow;
  const w = lerp(s.rect.w, targetW, p);
  return { cx, cy, w, h: (w * s.rect.h) / s.rect.w };
}

function drawFace(ctx: CanvasRenderingContext2D, s: Scene, cx: number, cy: number, w: number, h: number, rot = 0, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.shadowColor = s.def.color;
  ctx.shadowBlur = 30;
  ctx.drawImage(s.face, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// ---------------- BLACK HOLE: sucked into a growing black hole ----------------
function blackhole(ctx: CanvasRenderingContext2D, s: Scene, t: number): void {
  const { W, H } = s;
  const diag = Math.hypot(W, H);
  ctx.fillStyle = `rgba(4,0,10,${clamp01(t * 1.6) * 0.92})`;
  ctx.fillRect(0, 0, W, H);
  const hr = lerp(6, diag * 0.62, easeIn(seg(t, 0.15, 1)));
  const now = performance.now() / 1000;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  const glow = ctx.createRadialGradient(0, 0, hr * 0.5, 0, 0, hr * 2.4 + 40);
  glow.addColorStop(0, 'rgba(255,43,214,0.55)');
  glow.addColorStop(0.5, 'rgba(139,43,255,0.25)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-W, -H, W * 2, H * 2);
  ctx.save();
  ctx.scale(1, 0.35);
  for (let i = 0; i < 5; i++) {
    ctx.rotate(now * (1.5 + i * 0.4) + i);
    ctx.beginPath();
    ctx.arc(0, 0, hr * (1.3 + i * 0.22) + 10, 0, Math.PI * 1.4);
    ctx.strokeStyle = i % 2 ? '#00f0ff' : '#ff2bd6';
    ctx.lineWidth = 6 - i;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 20;
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  // the crate spirals in
  const p = ease(seg(t, 0, 0.7));
  const startX = s.rect.x + s.rect.w / 2;
  const startY = s.rect.y + s.rect.h / 2;
  const ang = p * Math.PI * 3;
  const rad = (1 - p) * Math.hypot(startX - W / 2, startY - H / 2);
  const base = Math.atan2(startY - H / 2, startX - W / 2);
  const cx = W / 2 + Math.cos(base + ang) * rad;
  const cy = H / 2 + Math.sin(base + ang) * rad;
  const sc = 1 - p * 0.97;
  if (sc > 0.03) drawFace(ctx, s, cx, cy, s.rect.w * sc * (1 + p * 0.6), s.rect.h * sc, p * 9);
  // event horizon
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,255,0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

// ---------------- REPAIR: glitch-shatter into pixels -> terminal ----------------
function repair(ctx: CanvasRenderingContext2D, s: Scene, t: number): void {
  const { W, H, rect } = s;
  ctx.fillStyle = `rgba(3,0,8,${clamp01(t * 2) * 0.85})`;
  ctx.fillRect(0, 0, W, H);
  const cols = 14;
  const rows = 8;
  const cwid = rect.w / cols;
  const chei = rect.h / rows;
  const shatter = ease(seg(t, 0.08, 0.55));
  const fw = s.face.width / cols;
  const fh = s.face.height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      const rnd = s.seed[k % s.seed.length];
      const rnd2 = s.seed[(k * 7) % s.seed.length];
      const x0 = rect.x + c * cwid;
      const y0 = rect.y + r * chei;
      const tx = rnd * W;
      const ty = rnd2 * H;
      const x = lerp(x0, tx, shatter);
      const y = lerp(y0, ty, shatter);
      const fade = 1 - seg(t, 0.45, 0.7);
      if (fade <= 0) continue;
      ctx.globalAlpha = fade;
      const jitter = t > 0.02 && Math.random() < 0.3 ? (Math.random() - 0.5) * 10 : 0;
      ctx.drawImage(s.face, c * fw, r * fh, fw, fh, x + jitter, y, cwid * (1 + shatter), chei * (1 + shatter));
      if (shatter > 0.1 && rnd > 0.7) {
        ctx.fillStyle = rnd2 > 0.5 ? 'rgba(0,240,255,0.6)' : 'rgba(255,43,214,0.6)';
        ctx.fillRect(x + 4, y, cwid * (1 + shatter), 2);
      }
    }
  }
  ctx.globalAlpha = 1;
  // terminal cells rebuild across the screen
  const build = seg(t, 0.4, 1);
  if (build > 0) {
    const size = 28;
    const nx = Math.ceil(W / size);
    const ny = Math.ceil(H / size);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const k = (x * 31 + y * 17) % s.seed.length;
        if (s.seed[k] * 0.9 > build) continue;
        ctx.fillStyle = '#05000c';
        ctx.fillRect(x * size, y * size, size + 1, size + 1);
        if (build < 0.98 && s.seed[(k + 3) % s.seed.length] > 0.82) {
          ctx.fillStyle = 'rgba(0,240,255,0.35)';
          ctx.fillRect(x * size + 6, y * size + 12, size - 12, 3);
        }
      }
    }
    if (build < 0.99) {
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillStyle = '#39ff88';
      ctx.textAlign = 'center';
      const dots = '.'.repeat(1 + Math.floor(build * 6) % 4);
      ctx.fillText(`> REBUILDING TERMINAL${dots}  ${Math.round(build * 100)}%`, W / 2, H / 2);
    }
  }
}

// ---------------- NEON RACER: doors fly open, a car speeds out ----------------
function racer(ctx: CanvasRenderingContext2D, s: Scene, t: number): void {
  const { W, H } = s;
  ctx.fillStyle = `rgba(8,0,18,${clamp01(t * 2) * 0.88})`;
  ctx.fillRect(0, 0, W, H);
  const m = ease(seg(t, 0, 0.35));
  const box = crateAt(s, m, 1);
  const open = ease(seg(t, 0.33, 0.6));
  // light from inside
  if (open > 0) {
    // the crate's interior behind the doors
    ctx.fillStyle = '#140800';
    ctx.fillRect(box.cx - box.w / 2, box.cy - box.h / 2, box.w, box.h);
    const lg = ctx.createRadialGradient(box.cx, box.cy, 0, box.cx, box.cy, box.w * (0.4 + open));
    lg.addColorStop(0, `rgba(255,240,180,${open})`);
    lg.addColorStop(0.5, `rgba(255,194,26,${open * 0.5})`);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    // speed lines
    const sp = seg(t, 0.5, 1);
    ctx.strokeStyle = `rgba(255,230,140,${sp * 0.6})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const a = s.seed[i] * Math.PI * 2;
      const r0 = (0.1 + ((s.seed[i + 1] + sp * 2) % 1)) * Math.max(W, H) * 0.6;
      ctx.beginPath();
      ctx.moveTo(box.cx + Math.cos(a) * r0, box.cy + Math.sin(a) * r0);
      ctx.lineTo(box.cx + Math.cos(a) * (r0 + 60 * sp), box.cy + Math.sin(a) * (r0 + 60 * sp));
      ctx.stroke();
    }
  }
  // doors (left and right halves swing toward the viewer)
  const fw = s.face.width / 2;
  const doorW = (box.w / 2) * (1 - open * 0.95);
  ctx.save();
  ctx.shadowColor = s.def.color;
  ctx.shadowBlur = 24;
  if (open < 1) {
    ctx.drawImage(s.face, 0, 0, fw, s.face.height, box.cx - box.w / 2 - open * box.w * 0.15, box.cy - box.h / 2 - open * 10, doorW, box.h + open * 20);
    ctx.drawImage(s.face, fw, 0, fw, s.face.height, box.cx + box.w / 2 - doorW + open * box.w * 0.15, box.cy - box.h / 2 - open * 10, doorW, box.h + open * 20);
  }
  ctx.restore();
  // car rushing at the camera
  const car = easeIn(seg(t, 0.5, 1));
  if (car > 0) {
    const cw = lerp(box.w * 0.25, W * 2.2, car);
    const ch = cw * 0.38;
    const cx = box.cx;
    const cy = lerp(box.cy + box.h * 0.1, H * 0.62, car);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#12002a';
    ctx.strokeStyle = '#ff2bd6';
    ctx.lineWidth = Math.max(2, cw * 0.012);
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(-cw / 2, ch * 0.2);
    ctx.lineTo(-cw * 0.38, -ch * 0.2);
    ctx.lineTo(-cw * 0.2, -ch * 0.5);
    ctx.lineTo(cw * 0.2, -ch * 0.5);
    ctx.lineTo(cw * 0.38, -ch * 0.2);
    ctx.lineTo(cw / 2, ch * 0.2);
    ctx.lineTo(cw / 2, ch * 0.45);
    ctx.lineTo(-cw / 2, ch * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // windshield + headlights
    ctx.fillStyle = 'rgba(0,240,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(-cw * 0.17, -ch * 0.42);
    ctx.lineTo(cw * 0.17, -ch * 0.42);
    ctx.lineTo(cw * 0.3, -ch * 0.18);
    ctx.lineTo(-cw * 0.3, -ch * 0.18);
    ctx.fill();
    ctx.fillStyle = '#fff6c0';
    ctx.shadowColor = '#ffe94a';
    ctx.shadowBlur = 40;
    ctx.fillRect(-cw * 0.44, ch * 0.08, cw * 0.16, ch * 0.12);
    ctx.fillRect(cw * 0.28, ch * 0.08, cw * 0.16, ch * 0.12);
    ctx.restore();
  }
  const flash = seg(t, 0.85, 1);
  if (flash > 0) {
    ctx.fillStyle = `rgba(14,0,26,${flash})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------------- BOMB DEFUSE: lid pops, warning lights, look inside ----------------
function bomb(ctx: CanvasRenderingContext2D, s: Scene, t: number): void {
  const { W, H } = s;
  ctx.fillStyle = `rgba(10,0,4,${clamp01(t * 2) * 0.9})`;
  ctx.fillRect(0, 0, W, H);
  const m = ease(seg(t, 0, 0.3));
  const shake = seg(t, 0.2, 0.32) * (1 - seg(t, 0.32, 0.36)) * 10;
  const zoom = easeIn(seg(t, 0.5, 1));
  const box = crateAt(s, m, 1 + zoom * 4);
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;
  // beacon sweep
  const beacon = seg(t, 0.32, 0.5);
  if (beacon > 0) {
    const a = performance.now() / 160;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    for (const off of [0, Math.PI]) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(W, H));
      g.addColorStop(0, `rgba(255,40,40,${0.5 * beacon})`);
      g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, Math.max(W, H), a + off - 0.35, a + off + 0.35);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  const lid = ease(seg(t, 0.3, 0.55));
  const fh = s.face.height;
  const lidFrac = 0.28;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.shadowColor = s.def.color;
  ctx.shadowBlur = 24;
  // body of the crate (below the lid), opened: dark interior visible
  const bodyTop = box.cy - box.h / 2 + box.h * lidFrac;
  ctx.drawImage(s.face, 0, fh * lidFrac, s.face.width, fh * (1 - lidFrac), box.cx - box.w / 2, bodyTop, box.w, box.h * (1 - lidFrac));
  if (lid > 0) {
    // interior hole with red glow
    const ig = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + box.h * 0.4);
    ig.addColorStop(0, `rgba(255,30,30,${0.8 * lid})`);
    ig.addColorStop(1, 'rgba(20,0,0,1)');
    ctx.fillStyle = ig;
    ctx.fillRect(box.cx - box.w * 0.44, bodyTop - box.h * 0.02, box.w * 0.88, box.h * 0.5 * lid);
  }
  // lid flying off
  ctx.save();
  ctx.translate(box.cx + lid * box.w * 0.6, box.cy - box.h / 2 + (box.h * lidFrac) / 2 - lid * H * 0.7);
  ctx.rotate(lid * 2.4);
  ctx.drawImage(s.face, 0, 0, s.face.width, fh * lidFrac, -box.w / 2, (-box.h * lidFrac) / 2, box.w, box.h * lidFrac);
  ctx.restore();
  ctx.restore();
  // diving into the bomb
  if (zoom > 0) {
    ctx.fillStyle = `rgba(20,0,2,${zoom})`;
    ctx.fillRect(0, 0, W, H);
  }
  const warn = seg(t, 0.45, 0.95);
  if (warn > 0 && warn < 1 && Math.sin(performance.now() / 90) > -0.2) {
    ctx.font = `900 ${Math.min(80, W * 0.09)}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff3b3b';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 30;
    ctx.fillText('⚠ ARMED', W / 2, H / 2);
    ctx.shadowBlur = 0;
  }
}

// ---------------- BOSS DUEL: crate cracks, boss roars out ----------------
function boss(ctx: CanvasRenderingContext2D, s: Scene, t: number): void {
  const { W, H } = s;
  ctx.fillStyle = `rgba(6,0,14,${clamp01(t * 2) * 0.9})`;
  ctx.fillRect(0, 0, W, H);
  const m = ease(seg(t, 0, 0.3));
  const box = crateAt(s, m, 1);
  const crack = seg(t, 0.25, 0.48);
  const burst = ease(seg(t, 0.48, 0.75));
  const shakeAmt = (seg(t, 0.2, 0.48) * 8 + seg(t, 0.55, 0.8) * (1 - seg(t, 0.8, 1)) * 26) * (t < 1 ? 1 : 0);
  ctx.save();
  ctx.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
  // boss rising behind the crate
  const rise = ease(seg(t, 0.45, 0.85));
  if (rise > 0) {
    const bs = Math.min(W, H) * lerp(0.3, 1.25, rise);
    const by = lerp(box.cy + bs * 0.3, H * 0.52, rise);
    ctx.save();
    ctx.translate(W / 2, by);
    ctx.fillStyle = '#0d0020';
    ctx.strokeStyle = '#9b4dff';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#9b4dff';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.moveTo(-bs * 0.5, bs * 0.5);
    ctx.lineTo(-bs * 0.45, -bs * 0.1);
    ctx.lineTo(-bs * 0.55, -bs * 0.45); // horn
    ctx.lineTo(-bs * 0.25, -bs * 0.25);
    ctx.lineTo(0, -bs * 0.32);
    ctx.lineTo(bs * 0.25, -bs * 0.25);
    ctx.lineTo(bs * 0.55, -bs * 0.45); // horn
    ctx.lineTo(bs * 0.45, -bs * 0.1);
    ctx.lineTo(bs * 0.5, bs * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // eyes
    ctx.fillStyle = '#ff2b4d';
    ctx.shadowColor = '#ff2b4d';
    ctx.shadowBlur = 30;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * bs * 0.15, -bs * 0.08, bs * 0.07, bs * 0.035, side * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // jagged mouth
    ctx.strokeStyle = '#ff2b4d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const x = -bs * 0.2 + (i / 8) * bs * 0.4;
      const y = bs * 0.1 + (i % 2 ? bs * 0.05 : 0) + rise * bs * 0.04;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  // crate pieces
  const fw = s.face.width / 2;
  const fh = s.face.height / 2;
  const pieces = [
    [0, 0, -1, -1],
    [1, 0, 1, -1],
    [0, 1, -1, 1],
    [1, 1, 1, 1],
  ];
  for (const [ix, iy, dx, dy] of pieces) {
    const px = box.cx + (ix - 0.5) * (box.w / 2) + dx * burst * W * 0.6;
    const py = box.cy + (iy - 0.5) * (box.h / 2) + dy * burst * H * 0.5 + burst * burst * H * 0.4;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(dx * burst * 2.2);
    ctx.globalAlpha = 1 - seg(t, 0.7, 0.85);
    ctx.shadowColor = s.def.color;
    ctx.shadowBlur = 20;
    ctx.drawImage(s.face, ix * fw, iy * fh, fw, fh, -box.w / 4, -box.h / 4, box.w / 2, box.h / 2);
    ctx.restore();
  }
  // glowing cracks
  if (crack > 0 && burst < 0.2) {
    ctx.strokeStyle = '#e0c2ff';
    ctx.shadowColor = '#9b4dff';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      let x = box.cx;
      let y = box.cy;
      ctx.moveTo(x, y);
      const a = (i / 7) * Math.PI * 2 + s.seed[i];
      const steps = 5;
      for (let k = 1; k <= steps; k++) {
        const f = (k / steps) * crack;
        x = box.cx + Math.cos(a + (s.seed[i * 3 + k] - 0.5) * 0.6) * box.w * 0.55 * f;
        y = box.cy + Math.sin(a + (s.seed[i * 5 + k] - 0.5) * 0.6) * box.h * 0.55 * f;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  const roar = seg(t, 0.6, 0.95);
  if (roar > 0 && roar < 1) {
    ctx.font = `900 ${Math.min(110, W * 0.12) * (1 + roar * 0.2)}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,43,77,${1 - roar * 0.6})`;
    ctx.shadowColor = '#ff2b4d';
    ctx.shadowBlur = 30;
    ctx.fillText('ROAAAR', W / 2 + (Math.random() - 0.5) * 12, H * 0.2 + (Math.random() - 0.5) * 8);
    ctx.shadowBlur = 0;
  }
  const cover = seg(t, 0.85, 1);
  if (cover > 0) {
    ctx.fillStyle = `rgba(8,0,18,${cover})`;
    ctx.fillRect(0, 0, W, H);
  }
}

const ANIMS: Record<GameId, (ctx: CanvasRenderingContext2D, s: Scene, t: number) => void> = {
  blackhole,
  repair,
  racer,
  bomb,
  boss,
};

const DURATION: Record<GameId, number> = { blackhole: 1500, repair: 1500, racer: 1600, bomb: 1600, boss: 1800 };

// ---------------- overlay runner ----------------
let overlay: { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; scene: Scene | null } | null = null;
let runId = 0;

function ensureOverlay() {
  if (overlay) return overlay;
  const cv = document.createElement('canvas');
  cv.className = 'crate-overlay';
  document.body.append(cv);
  overlay = { cv, ctx: cv.getContext('2d')!, scene: null };
  return overlay;
}

function sizeOverlay(o: NonNullable<typeof overlay>): { W: number; H: number; dpr: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (o.cv.width !== Math.round(W * dpr) || o.cv.height !== Math.round(H * dpr)) {
    o.cv.width = Math.round(W * dpr);
    o.cv.height = Math.round(H * dpr);
  }
  return { W, H, dpr };
}

function makeScene(def: CrateDef, rect: Rect): Scene {
  const face = document.createElement('canvas');
  face.width = 640;
  face.height = Math.round((640 * rect.h) / rect.w);
  const fctx = face.getContext('2d')!;
  fctx.translate(face.width / 2, face.height / 2);
  drawCrateFace(fctx, def, face.width - 4, face.height - 4, 0);
  const seed = Array.from({ length: 160 }, () => Math.random());
  return { W: window.innerWidth, H: window.innerHeight, rect, def, face, seed };
}

function removeOverlay(): void {
  overlay?.cv.remove();
  overlay = null;
}

function animate(ms: number, step: (k: number) => void): Promise<void> {
  const id = ++runId;
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (id !== runId) return resolve();
      const k = Math.min(1, (performance.now() - start) / ms);
      step(k);
      if (k < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

function paint(t: number, alpha = 1): void {
  if (!overlay?.scene) return;
  const { W, H, dpr } = sizeOverlay(overlay);
  const s = overlay.scene;
  s.W = W;
  s.H = H;
  const ctx = overlay.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  overlay.cv.style.opacity = String(alpha);
  ANIMS[s.def.id](ctx, s, t);
}

/** Crate in the claw -> full screen. Resolves when the screen is covered (navigate then). */
export async function playOpening(def: CrateDef, rect: Rect, reduced: boolean): Promise<void> {
  const o = ensureOverlay();
  o.scene = makeScene(def, rect);
  o.cv.style.pointerEvents = 'auto';
  playSfx(def.id);
  await animate(reduced ? 350 : DURATION[def.id], (k) => paint(reduced ? 1 : k));
}

/** After the new page is mounted: fade the covered overlay away. */
export async function revealPage(): Promise<void> {
  if (!overlay?.scene) return removeOverlay();
  overlay.cv.style.pointerEvents = 'none';
  await animate(380, (k) => paint(1, 1 - k));
  removeOverlay();
}

/** Called before leaving a game: fade the themed cover in over the current page. */
export async function coverForClosing(def: CrateDef): Promise<void> {
  const o = ensureOverlay();
  o.scene = makeScene(def, { x: window.innerWidth / 2 - 80, y: 80, w: 160, h: 90 });
  o.cv.style.pointerEvents = 'auto';
  await animate(240, (k) => paint(1, k));
}

/** Full screen -> crate in the claw (the opening, reversed). */
export async function playClosing(def: CrateDef, rect: Rect, reduced: boolean): Promise<void> {
  const o = ensureOverlay();
  const scene = makeScene(def, rect);
  o.scene = scene;
  o.cv.style.pointerEvents = 'auto';
  if (reduced) {
    await animate(250, (k) => paint(0, 1 - k));
  } else {
    await animate(DURATION[def.id] * 0.8, (k) => paint(1 - ease(k)));
  }
  removeOverlay();
}

export function hasCover(): boolean {
  return !!overlay;
}

function playSfx(id: GameId): void {
  if (id === 'blackhole') sfx.whoosh();
  else if (id === 'repair') sfx.error();
  else if (id === 'racer') sfx.power();
  else if (id === 'bomb') sfx.hit();
  else sfx.explode(true);
}
