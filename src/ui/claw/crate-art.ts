// Draws a neon cargo crate with a fake-3D extrusion. Shared by the machine
// canvas and the crate opening/closing animations.
import type { CrateDef } from './crates';

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export interface CrateDrawOpts {
  glow?: number; // extra glow 0..1
  depth?: boolean; // draw 3D sides (default true)
}

export function drawCrate(
  ctx: CanvasRenderingContext2D,
  def: CrateDef,
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number,
  opts: CrateDrawOpts = {},
): void {
  const hw = w / 2;
  const hh = h / 2;
  const col = def.color;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  if (opts.depth !== false) {
    const pts = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([lx, ly]) => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos }));
    const E = { x: w * 0.1, y: -w * 0.08 };
    for (let i = 0; i < 4; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % 4];
      const nx = p2.y - p1.y;
      const ny = -(p2.x - p1.x);
      if (nx * E.x + ny * E.y <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x + E.x, p2.y + E.y);
      ctx.lineTo(p1.x + E.x, p1.y + E.y);
      ctx.closePath();
      ctx.fillStyle = ny < 0 ? shade(col, 0.25) : shade(col, -0.45);
      ctx.fill();
      ctx.strokeStyle = shade(col, -0.65);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      for (let k = 1; k < 10; k++) {
        const f = k / 10;
        ctx.beginPath();
        ctx.moveTo(p1.x + (p2.x - p1.x) * f, p1.y + (p2.y - p1.y) * f);
        ctx.lineTo(p1.x + (p2.x - p1.x) * f + E.x, p1.y + (p2.y - p1.y) * f + E.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  drawCrateFace(ctx, def, w, h, opts.glow ?? 0);
  ctx.restore();
}

/** Front face centered on the origin (no rotation applied). */
export function drawCrateFace(ctx: CanvasRenderingContext2D, def: CrateDef, w: number, h: number, glow = 0): void {
  const hw = w / 2;
  const hh = h / 2;
  const col = def.color;
  ctx.shadowColor = col;
  ctx.shadowBlur = 8 + glow * 26;
  const g = ctx.createLinearGradient(0, -hh, 0, hh);
  g.addColorStop(0, shade(col, 0.1));
  g.addColorStop(1, shade(col, -0.38));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-hw, -hh, w, h, Math.min(4, w * 0.03));
  ctx.fill();
  ctx.shadowBlur = 0;
  // corrugation
  ctx.save();
  ctx.beginPath();
  ctx.rect(-hw + 5, -hh + 5, w - 10, h - 10);
  ctx.clip();
  const step = Math.max(6, w / 22);
  for (let rx = -hw + 6; rx < hw; rx += step) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(rx, -hh, step * 0.35, h);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(rx + step * 0.35, -hh, 1, h);
  }
  ctx.restore();
  // frame + hinges
  ctx.strokeStyle = shade(col, -0.55);
  ctx.lineWidth = Math.max(2, w * 0.018);
  ctx.strokeRect(-hw + 3, -hh + 3, w - 6, h - 6);
  ctx.fillStyle = shade(col, -0.6);
  for (const hy of [-hh * 0.55, hh * 0.4]) ctx.fillRect(hw - w * 0.08, hy, w * 0.035, h * 0.12);
  // stencil
  const small = Math.max(7, h * 0.11);
  ctx.font = `700 ${small}px "JetBrains Mono", monospace`;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(def.sub, -hw + w * 0.06, -hh + h * 0.09);
  ctx.textAlign = 'right';
  ctx.font = `900 ${small * 1.5}px sans-serif`;
  ctx.fillText(def.glyph, hw - w * 0.12, -hh + h * 0.06);
  // label
  const words = def.label.split(' ');
  const longest = Math.max(...words.map((wd) => wd.length));
  const fs = Math.min(h * (words.length > 1 ? 0.26 : 0.34), (w * 0.8) / (longest * 0.8));
  ctx.font = `900 ${fs}px Orbitron, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  words.forEach((word, wi) => {
    const ly = (wi - (words.length - 1) / 2) * fs * 1.04 + h * 0.1;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(word, 2, ly + 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(word, 0, ly);
  });
}
