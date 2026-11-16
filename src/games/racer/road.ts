// Pseudo-3D synthwave road (segment projection, classic arcade racer style).
import type { Rng } from '../../core/rng';

export const SEG_LEN = 200;
const ROAD_W = 2000; // half width in world units
const CAM_H = 1000;
const DRAW_DIST = 150;
const CAM_DEPTH = 1 / Math.tan((50 * Math.PI) / 180);
const CAR_W = 520;

export interface Segment {
  index: number;
  curve: number;
}

export interface CarSprite {
  z: number; // world z
  lane: number; // -1..1 of road half width
  color: string;
  name?: string;
  ghost?: boolean;
  player?: boolean;
  skid?: number;
  brake?: boolean;
}

export interface RoadState {
  camZ: number;
  speed: number; // 0..1 for effects
  cars: CarSprite[];
  startZ: number;
  finishZ: number;
  t: number;
}

export function buildTrack(rng: Rng, count: number): Segment[] {
  const segs: Segment[] = [];
  const add = (n: number, curve: number) => {
    for (let i = 0; i < n; i++) {
      // ease in and out of every bend
      const k = Math.sin((i / n) * Math.PI);
      segs.push({ index: segs.length, curve: curve * k });
    }
  };
  add(40, 0); // straight start
  while (segs.length < count) {
    const r = rng();
    const len = 30 + Math.floor(rng() * 60);
    if (r < 0.3) add(len, 0);
    else add(len, (rng() < 0.5 ? -1 : 1) * (1.5 + rng() * 4));
  }
  return segs;
}

interface Proj {
  x: number;
  y: number;
  w: number;
  scale: number;
}

export function createRoad(canvas: HTMLCanvasElement, track: Segment[]) {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let horizon = 0;
  let skyShift = 0;
  const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() }));
  const ridge = Array.from({ length: 48 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 1.7) * 0.45 + Math.sin(i * 0.53) * 0.3));
  const ridge2 = Array.from({ length: 36 }, (_, i) => 0.2 + Math.abs(Math.sin(i * 2.3 + 1) * 0.35 + Math.cos(i * 0.71) * 0.25));
  // make both ridges tile seamlessly
  ridge[ridge.length - 1] = ridge[0];
  ridge2[ridge2.length - 1] = ridge2[0];

  function resize(): void {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    horizon = H * 0.42;
  }
  resize();

  function project(worldX: number, relZ: number): Proj {
    const scale = CAM_DEPTH / relZ;
    return {
      x: W / 2 + scale * worldX * (W / 2),
      y: horizon + scale * CAM_H * (H / 2),
      w: scale * ROAD_W * (W / 2),
      scale,
    };
  }

  function drawSky(t: number, curveNow: number, speed: number): void {
    skyShift += curveNow * speed * 0.004;
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#07001a');
    g.addColorStop(0.55, '#2a0049');
    g.addColorStop(1, '#b0136e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizon + 2);
    for (const s of stars) {
      ctx.fillStyle = `rgba(255,230,255,${0.3 + 0.5 * Math.abs(Math.sin(t + s.s * 9))})`;
      ctx.fillRect(((s.x * W - skyShift * 20) % W + W) % W, s.y * horizon * 0.7, 1.5, 1.5);
    }
    // synthwave sun
    const sunR = Math.min(W, H) * 0.2;
    const sx = W / 2 - skyShift * 40;
    const sy = horizon - sunR * 0.35;
    const sg = ctx.createLinearGradient(0, sy - sunR, 0, sy + sunR);
    sg.addColorStop(0, '#ffe94a');
    sg.addColorStop(0.5, '#ff8a2b');
    sg.addColorStop(1, '#ff2bd6');
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, horizon);
    ctx.clip();
    ctx.shadowColor = '#ff5fb0';
    ctx.shadowBlur = 60;
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // stripes cut out of the sun
    ctx.fillStyle = '#2a0049';
    for (let i = 0; i < 7; i++) {
      const yy = sy + sunR * 0.1 + i * sunR * 0.13;
      ctx.fillRect(sx - sunR, yy, sunR * 2, 2 + i * 1.6);
    }
    // mountains (two parallax layers)
    const drawRidge = (pts: number[], height: number, shift: number, fill: string, stroke: string) => {
      const off = ((shift % W) + W) % W;
      for (const base of [off - W, off]) {
        ctx.beginPath();
        ctx.moveTo(base, horizon);
        pts.forEach((p, i) => ctx.lineTo(base + (i / (pts.length - 1)) * W, horizon - p * height));
        ctx.lineTo(base + W, horizon);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = stroke;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };
    drawRidge(ridge2, H * 0.16, -skyShift * 60, '#1a0033', 'rgba(0,240,255,0.55)');
    drawRidge(ridge, H * 0.11, -skyShift * 110, '#12002a', 'rgba(255,43,214,0.7)');
    ctx.restore();
  }

  function poly(x1: number, y1: number, w1: number, x2: number, y2: number, w2: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1);
    ctx.lineTo(x2 - w2, y2);
    ctx.lineTo(x2 + w2, y2);
    ctx.lineTo(x1 + w1, y1);
    ctx.closePath();
    ctx.fill();
  }

  function drawCar(car: CarSprite, x: number, y: number, w: number, t: number): void {
    const h = w * 0.42;
    const sway = car.skid ? Math.sin(t * 40) * w * 0.06 * car.skid : 0;
    ctx.save();
    ctx.translate(x + sway, y);
    if (car.skid) ctx.rotate(Math.sin(t * 30) * 0.05 * car.skid);
    if (car.ghost) ctx.globalAlpha = 0.38;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.55, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // wheels
    ctx.fillStyle = '#05000a';
    ctx.fillRect(-w * 0.48, -h * 0.32, w * 0.16, h * 0.32);
    ctx.fillRect(w * 0.32, -h * 0.32, w * 0.16, h * 0.32);
    // body
    const body = car.ghost ? 'rgba(180,240,255,0.25)' : '#140428';
    ctx.fillStyle = body;
    ctx.strokeStyle = car.color;
    ctx.lineWidth = Math.max(1.5, w * 0.025);
    ctx.shadowColor = car.color;
    ctx.shadowBlur = car.ghost ? 6 : 16;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.2);
    ctx.lineTo(-w * 0.46, -h * 0.62);
    ctx.lineTo(-w * 0.3, -h * 0.72);
    ctx.lineTo(-w * 0.22, -h);
    ctx.lineTo(w * 0.22, -h);
    ctx.lineTo(w * 0.3, -h * 0.72);
    ctx.lineTo(w * 0.46, -h * 0.62);
    ctx.lineTo(w * 0.5, -h * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // rear window
    ctx.shadowBlur = 0;
    ctx.fillStyle = car.ghost ? 'rgba(0,240,255,0.2)' : 'rgba(0,240,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(-w * 0.19, -h * 0.95);
    ctx.lineTo(w * 0.19, -h * 0.95);
    ctx.lineTo(w * 0.26, -h * 0.74);
    ctx.lineTo(-w * 0.26, -h * 0.74);
    ctx.closePath();
    ctx.fill();
    // tail light bar
    ctx.fillStyle = car.brake ? '#ff2b4d' : car.color;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = car.ghost ? 4 : 18;
    ctx.fillRect(-w * 0.42, -h * 0.52, w * 0.84, h * 0.09);
    ctx.shadowBlur = 0;
    // exhaust flame when moving fast
    if (car.player && !car.ghost) {
      const f = 0.5 + Math.random() * 0.5;
      ctx.fillStyle = `rgba(0,240,255,${0.5 * f})`;
      ctx.beginPath();
      ctx.ellipse(-w * 0.28, -h * 0.18, w * 0.05, h * 0.06 * f, 0, 0, Math.PI * 2);
      ctx.ellipse(w * 0.28, -h * 0.18, w * 0.05, h * 0.06 * f, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (car.name && w > 40) {
      ctx.font = `700 ${Math.max(10, Math.min(16, w * 0.12))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = car.ghost ? 'rgba(200,240,255,0.7)' : car.color;
      ctx.fillText(car.name, x, y - h - 8);
    }
  }

  function draw(st: RoadState): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const baseIndex = Math.max(0, Math.floor(st.camZ / SEG_LEN));
    const base = track[Math.min(baseIndex, track.length - 1)];
    drawSky(st.t, base.curve, st.speed);
    // ground
    ctx.fillStyle = '#0b0018';
    ctx.fillRect(0, horizon, W, H - horizon);

    const basePct = (st.camZ % SEG_LEN) / SEG_LEN;
    let x = 0;
    let dx = -(base.curve * basePct);
    let maxy = H;
    const proj: (Proj & { clip: number })[] = [];
    for (let n = 0; n < DRAW_DIST; n++) {
      const i = baseIndex + n;
      const seg = track[Math.min(i, track.length - 1)];
      const z1 = i * SEG_LEN - st.camZ;
      const z2 = (i + 1) * SEG_LEN - st.camZ;
      const p1 = project(-x, Math.max(z1, 1));
      const p2 = project(-x - dx, Math.max(z2, 1));
      x += dx;
      dx += seg.curve;
      proj[n] = { ...p1, clip: maxy };
      if (z1 <= CAM_DEPTH || p2.y >= maxy) continue;
      const alt = Math.floor(i / 3) % 2 === 0;
      // ground stripe (grid rows)
      ctx.fillStyle = alt ? '#140028' : '#0e001e';
      ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);
      if (Math.floor(i / 3) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,43,214,0.25)';
        ctx.fillRect(0, p2.y, W, Math.max(1, (p1.y - p2.y) * 0.08));
      }
      // rumble strips + road
      poly(p1.x, p1.y, p1.w * 1.12, p2.x, p2.y, p2.w * 1.12, alt ? '#ff2bd6' : '#f4ecff');
      poly(p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, alt ? '#1d0b33' : '#211039');
      // lane markers
      if (alt) {
        for (const lane of [-1 / 3, 1 / 3]) {
          poly(p1.x + lane * p1.w * 2, p1.y, p1.w * 0.02, p2.x + lane * p2.w * 2, p2.y, p2.w * 0.02, 'rgba(0,240,255,0.8)');
        }
      }
      // start and finish lines
      const segZ = i * SEG_LEN;
      if ((segZ <= st.finishZ && segZ + SEG_LEN > st.finishZ) || (segZ <= st.startZ && segZ + SEG_LEN > st.startZ)) {
        const cells = 12;
        for (let c = 0; c < cells; c++) {
          const f1 = -1 + (2 * c) / cells;
          const f2 = -1 + (2 * (c + 1)) / cells;
          ctx.fillStyle = c % 2 ? '#fff' : '#000';
          ctx.beginPath();
          ctx.moveTo(p1.x + f1 * p1.w, p1.y);
          ctx.lineTo(p1.x + f2 * p1.w, p1.y);
          ctx.lineTo(p2.x + f2 * p2.w, p2.y);
          ctx.lineTo(p2.x + f1 * p2.w, p2.y);
          ctx.fill();
        }
      }
      maxy = p2.y;
    }

    // roadside poles + finish arch + cars, far to near
    const items: { n: number; draw: () => void }[] = [];
    for (let n = DRAW_DIST - 1; n > 0; n--) {
      const i = baseIndex + n;
      const p = proj[n];
      if (!p || p.y > p.clip + 2) continue;
      if (i % 6 === 0) {
        items.push({
          n,
          draw: () => {
            for (const side of [-1, 1]) {
              const px = p.x + side * p.w * 1.35;
              const ph = p.scale * 2400 * (H / 2);
              ctx.strokeStyle = i % 12 === 0 ? '#00f0ff' : '#ff2bd6';
              ctx.lineWidth = Math.max(1, p.scale * 60 * (W / 2));
              ctx.shadowColor = ctx.strokeStyle;
              ctx.shadowBlur = 10;
              ctx.beginPath();
              ctx.moveTo(px, p.y);
              ctx.lineTo(px, p.y - ph);
              ctx.stroke();
              ctx.fillStyle = '#fff';
              ctx.fillRect(px - ctx.lineWidth, p.y - ph - ctx.lineWidth, ctx.lineWidth * 2, ctx.lineWidth * 2);
              ctx.shadowBlur = 0;
            }
          },
        });
      }
      const segZ = i * SEG_LEN;
      if (segZ <= st.finishZ && segZ + SEG_LEN > st.finishZ) {
        items.push({
          n,
          draw: () => {
            const ph = p.scale * 3600 * (H / 2);
            const left = p.x - p.w * 1.3;
            const right = p.x + p.w * 1.3;
            ctx.strokeStyle = '#ffe94a';
            ctx.shadowColor = '#ffe94a';
            ctx.shadowBlur = 16;
            ctx.lineWidth = Math.max(2, p.scale * 120 * (W / 2));
            ctx.beginPath();
            ctx.moveTo(left, p.y);
            ctx.lineTo(left, p.y - ph);
            ctx.lineTo(right, p.y - ph);
            ctx.lineTo(right, p.y);
            ctx.stroke();
            ctx.shadowBlur = 0;
            const fs = Math.max(8, p.scale * 700 * (W / 2));
            ctx.font = `900 ${fs}px Orbitron, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffe94a';
            ctx.fillText('FINISH', p.x, p.y - ph - fs * 0.2);
          },
        });
      }
    }
    for (const car of st.cars) {
      const rel = car.z - st.camZ;
      if (rel <= SEG_LEN * 0.6 || rel > (DRAW_DIST - 1) * SEG_LEN) continue;
      const n = Math.floor(rel / SEG_LEN);
      const p = proj[n];
      const pn = proj[n + 1] ?? p;
      if (!p) continue;
      const f = (rel % SEG_LEN) / SEG_LEN;
      const px = p.x + (pn.x - p.x) * f;
      const py = p.y + (pn.y - p.y) * f;
      const pw = p.w + (pn.w - p.w) * f;
      const scale = p.scale + (pn.scale - p.scale) * f;
      items.push({ n: n + f, draw: () => drawCar(car, px + car.lane * pw, py, scale * CAR_W * (W / 2), st.t) });
    }
    items.sort((a, b) => b.n - a.n);
    for (const it of items) it.draw();

    // speed lines
    if (st.speed > 0.35) {
      ctx.strokeStyle = `rgba(255,255,255,${(st.speed - 0.35) * 0.35})`;
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = (0.35 + Math.random() * 0.4) * W;
        const cx = W / 2;
        const cy = horizon;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6);
        ctx.lineTo(cx + Math.cos(a) * (r + 50), cy + Math.sin(a) * (r + 50) * 0.6);
        ctx.stroke();
      }
    }
  }

  return { resize, draw };
}
