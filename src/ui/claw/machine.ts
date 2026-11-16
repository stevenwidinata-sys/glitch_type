// Physics + claw logic + rendering for the inside of the glass.
// A grabbed crate leaves the physics world and rides the claw rigidly,
// so it can never slip, swing, or get stuck.
import Matter from 'matter-js';
import { sfx } from '../../core/audio';
import { store } from '../../core/storage';
import { CRATES, type CrateDef, type GameId } from './crates';
import { drawCrate } from './crate-art';
import { clawState } from './state';

const { Engine, Bodies, Body, Composite, Query, Events, Sleeping } = Matter;

type ClawMode = 'idle' | 'drop' | 'grab' | 'miss' | 'lift' | 'holding' | 'release';

interface Crate {
  def: CrateDef;
  body: Matter.Body;
  inWorld: boolean;
}

export interface MachineEvents {
  /** crate lifted to the top: time to open it */
  onLifted(def: CrateDef): void;
  onMiss(): void;
  onThud(strength: number): void;
}

export function createMachine(canvas: HTMLCanvasElement, events: MachineEvents) {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let cw = 0;
  let ch = 0;
  let s = 1; // claw scale
  let railY = 0;
  let floorY = 0;

  const engine = Engine.create({ gravity: { x: 0, y: 1.2 }, enableSleeping: true });
  engine.positionIterations = 10;
  engine.velocityIterations = 8;
  let walls: Matter.Body[] = [];

  function measure(): void {
    const r = canvas.getBoundingClientRect();
    W = Math.max(200, r.width);
    H = Math.max(200, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cw = Math.max(78, Math.min(168, W * 0.2));
    ch = cw * 0.56;
    s = Math.max(0.62, Math.min(1.1, W / 680));
    railY = 16;
    floorY = H - 10;
  }

  function buildWalls(): void {
    if (walls.length) Composite.remove(engine.world, walls);
    const t = 400;
    const o = { isStatic: true, friction: 1, restitution: 0, collisionFilter: { category: 1 } };
    walls = [
      Bodies.rectangle(W / 2, floorY + t / 2, W + t * 2, t, o),
      Bodies.rectangle(-t / 2, H / 2, t, H + t * 2, o),
      Bodies.rectangle(W + t / 2, H / 2, t, H + t * 2, o),
      Bodies.rectangle(W / 2, -t / 2, W + t * 2, t, o), // ceiling keeps crates inside the glass
    ];
    Composite.add(engine.world, walls);
  }

  function makeBody(x: number, y: number, a: number): Matter.Body {
    return Bodies.rectangle(x, y, cw, ch, {
      angle: a,
      chamfer: { radius: Math.min(6, cw * 0.04) },
      friction: 0.9,
      frictionStatic: 1.2,
      frictionAir: 0.02,
      restitution: 0.04,
      density: 0.002,
      slop: 0.02,
      sleepThreshold: 40,
    });
  }

  measure();
  buildWalls();

  const crates: Crate[] = CRATES.map((def) => ({ def, body: makeBody(0, 0, 0), inWorld: false }));

  function addToWorld(c: Crate, x: number, y: number, a: number): void {
    // rebuild the body so its size always matches the current glass size
    c.body = makeBody(x, y, a);
    Composite.add(engine.world, c.body);
    c.inWorld = true;
  }

  function removeFromWorld(c: Crate): void {
    if (!c.inWorld) return;
    Composite.remove(engine.world, c.body);
    c.inWorld = false;
  }

  function wakeAll(): void {
    for (const c of crates) if (c.inWorld) Sleeping.set(c.body, false);
  }

  // ---- claw ----
  const claw = {
    x: W * clawState.clawX,
    tip: 0,
    open: 1,
    mode: 'idle' as ClawMode,
    timer: 0,
    dir: 0,
    vx: 0,
    held: null as Crate | null,
    heldX: 0,
    heldY: 0,
    heldA: 0,
    cancel: false,
  };
  const restTip = () => railY + 64 * s;
  claw.tip = restTip();

  let missText = 0;
  let thudCool = 0;

  Events.on(engine, 'collisionStart', (ev) => {
    for (const p of ev.pairs) {
      const v = p.bodyA.speed + p.bodyB.speed;
      if (v > 4 && thudCool <= 0) {
        thudCool = 0.07;
        events.onThud(v);
      }
    }
  });

  // ---- tornado ----
  let tornado = 0;
  const swirl = Array.from({ length: 70 }, () => ({ a: Math.random() * Math.PI * 2, h: Math.random(), r: Math.random() }));

  // ---- spawning ----
  const spawnQueue: Crate[] = [];
  let spawnTimer = 0;

  function initialLayout(returning: GameId | null): void {
    const pile = clawState.pile;
    for (const c of crates) {
      if (c.def.id === returning) continue;
      const saved = pile?.find((p) => p.id === c.def.id);
      if (saved) addToWorld(c, saved.x * W, Math.min(saved.y * H, floorY - ch / 2), saved.a);
      else spawnQueue.push(c);
    }
    if (spawnQueue.length) spawnTimer = 0.15;
  }

  function spawnOne(c: Crate): void {
    const x = cw / 2 + 10 + Math.random() * Math.max(10, W - cw - 20);
    addToWorld(c, x, ch * 0.6 + railY, (Math.random() - 0.5) * 0.8);
    Body.setVelocity(c.body, { x: (Math.random() - 0.5) * 4, y: 2 });
    Body.setAngularVelocity(c.body, (Math.random() - 0.5) * 0.1);
  }

  // ---- input API ----
  function crateUnder(x: number, y: number): Crate | null {
    const live = crates.filter((c) => c.inWorld);
    const bodies = live.map((c) => c.body);
    for (const off of [0, -14 * s, 14 * s, -24 * s, 24 * s]) {
      const hit = Query.point(bodies, { x: x + off, y });
      if (hit.length) return live.find((c) => c.body === hit[0]) ?? null;
    }
    return null;
  }

  function drop(): boolean {
    if (claw.mode !== 'idle' || spawnQueue.length) return false;
    claw.mode = 'drop';
    claw.cancel = false;
    sfx.laser();
    return true;
  }

  function cancel(): void {
    if (claw.mode === 'drop') {
      claw.mode = 'lift';
      claw.cancel = true;
      sfx.whoosh();
    }
  }

  function startTornado(): boolean {
    if (claw.mode !== 'idle' || tornado > 0 || spawnQueue.length) return false;
    tornado = 1.6;
    wakeAll();
    for (const c of crates) {
      if (!c.inWorld) continue;
      Body.setVelocity(c.body, { x: (Math.random() - 0.5) * 10, y: -10 - Math.random() * 8 });
      Body.setAngularVelocity(c.body, (Math.random() - 0.5) * 0.5);
    }
    sfx.whoosh();
    return true;
  }

  /** a crate comes back from a game: it starts in the claw */
  function hold(id: GameId): void {
    const c = crates.find((x) => x.def.id === id);
    if (!c) return;
    removeFromWorld(c);
    claw.held = c;
    claw.mode = 'holding';
    claw.open = 0;
    claw.tip = restTip();
    claw.heldX = claw.x;
    claw.heldY = claw.tip + ch / 2 - 4 * s;
    claw.heldA = 0;
  }

  /** drop the held crate back into the pile */
  function releaseHeld(): void {
    if (claw.mode !== 'holding' || !claw.held) return;
    const c = claw.held;
    addToWorld(c, claw.heldX, claw.heldY, 0);
    Body.setVelocity(c.body, { x: 0, y: 1 });
    wakeAll();
    claw.held = null;
    claw.mode = 'release';
    claw.timer = 0.3;
  }

  /** screen-space rectangle of the held crate */
  function heldRect(): { x: number; y: number; w: number; h: number } | null {
    if (!claw.held) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + claw.heldX - cw / 2, y: r.top + claw.heldY - ch / 2, w: cw, h: ch };
  }

  // ---- update ----
  const STEP = 1000 / 60;
  let accMs = 0;

  function physics(dtMs: number): void {
    accMs += Math.min(dtMs, 100);
    let n = 0;
    while (accMs >= STEP && n < 5) {
      if (tornado > 0) {
        const phase = performance.now() / 180;
        for (const c of crates) {
          if (!c.inWorld) continue;
          const m = c.body.mass;
          const lift = tornado > 0.7 ? 0.0019 : 0.0006;
          const side = Math.cos(phase + c.body.position.y * 0.03) * 0.0012;
          Body.applyForce(c.body, c.body.position, { x: m * side + m * ((W / 2 - c.body.position.x) / W) * 0.0016, y: -m * lift });
        }
      }
      Engine.update(engine, STEP);
      accMs -= STEP;
      n++;
      for (const c of crates) {
        if (!c.inWorld) continue;
        const b = c.body;
        const v = b.velocity;
        const sp = Math.hypot(v.x, v.y);
        if (sp > 24) Body.setVelocity(b, { x: (v.x / sp) * 24, y: (v.y / sp) * 24 });
        if (Math.abs(b.angularVelocity) > 0.35) Body.setAngularVelocity(b, Math.sign(b.angularVelocity) * 0.35);
        const p = b.position;
        if (p.x < -40 || p.x > W + 40 || p.y > H + 40 || p.y < -60) {
          Body.setPosition(b, { x: W / 2 + (Math.random() - 0.5) * W * 0.4, y: railY + ch });
          Body.setVelocity(b, { x: 0, y: 0 });
        }
      }
    }
    if (n === 5) accMs = 0;
  }

  function updateClaw(dt: number): void {
    const speed = Math.max(380, W * 0.95);
    switch (claw.mode) {
      case 'idle': {
        claw.vx += (claw.dir * speed - claw.vx) * Math.min(1, dt * 14);
        claw.x = Math.max(28 * s, Math.min(W - 28 * s, claw.x + claw.vx * dt));
        claw.tip += (restTip() - claw.tip) * Math.min(1, dt * 10);
        claw.open = Math.min(1, claw.open + dt * 4);
        break;
      }
      case 'drop': {
        claw.vx = 0;
        claw.open = 1;
        claw.tip += Math.max(700, H * 1.6) * dt;
        const hit = crateUnder(claw.x, claw.tip + 3);
        if (hit) {
          removeFromWorld(hit);
          wakeAll();
          claw.held = hit;
          claw.heldX = hit.body.position.x;
          claw.heldY = hit.body.position.y;
          claw.heldA = hit.body.angle;
          claw.mode = 'grab';
          claw.timer = 0.2;
          sfx.thud();
        } else if (claw.tip >= floorY - 4) {
          claw.tip = floorY - 4;
          claw.mode = 'miss';
          claw.timer = 0.2;
        }
        break;
      }
      case 'grab':
      case 'miss': {
        claw.open = Math.max(0, claw.open - dt * 7);
        claw.timer -= dt;
        if (claw.held) followClaw(dt * 14);
        if (claw.timer <= 0) claw.mode = 'lift';
        break;
      }
      case 'lift': {
        claw.tip -= Math.max(520, H * 1.2) * dt;
        if (claw.held) followClaw(dt * 14);
        else claw.open = Math.max(0, claw.open - dt * 7);
        if (claw.tip <= restTip()) {
          claw.tip = restTip();
          if (claw.held) {
            followClaw(1);
            claw.mode = 'holding';
            sfx.power();
            events.onLifted(claw.held.def);
          } else {
            if (!claw.cancel) {
              missText = 1.1;
              sfx.error();
              events.onMiss();
            }
            claw.mode = 'idle';
          }
        }
        break;
      }
      case 'holding':
        break;
      case 'release': {
        claw.open = Math.min(1, claw.open + dt * 6);
        claw.timer -= dt;
        if (claw.timer <= 0) claw.mode = 'idle';
        break;
      }
    }
  }

  /** move the grabbed crate rigidly into position under the claw, turning upright */
  function followClaw(k: number): void {
    const f = Math.min(1, k);
    const tx = claw.x;
    const ty = claw.tip + ch / 2 - 4 * s;
    claw.heldX += (tx - claw.heldX) * f;
    claw.heldY += (ty - claw.heldY) * f;
    let da = -claw.heldA % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    // turn to the nearest upright orientation
    claw.heldA += da * f;
  }

  // ---- render ----
  function drawInterior(t: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#14002a');
    g.addColorStop(1, '#2a0040');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // back wall grid
    ctx.strokeStyle = 'rgba(255,43,214,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = (t * 8) % 28; y < H; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // floor glow
    const fg = ctx.createLinearGradient(0, floorY - 60, 0, H);
    fg.addColorStop(0, 'rgba(0,240,255,0)');
    fg.addColorStop(1, 'rgba(0,240,255,0.18)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, floorY - 60, W, H - floorY + 60);
    ctx.fillStyle = '#0a0014';
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(W, floorY);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawTornado(t: number): void {
    if (tornado <= 0) return;
    const a = Math.min(1, tornado / 0.4);
    ctx.save();
    ctx.globalAlpha = a * 0.85;
    const cx = W / 2 + Math.sin(t * 3) * W * 0.08;
    for (const p of swirl) {
      p.a += 0.18 + p.r * 0.1;
      p.h -= 0.006;
      if (p.h < 0) p.h = 1;
      const y = floorY - p.h * (floorY - railY);
      const rad = (0.08 + p.h * 0.42) * W * (0.6 + p.r * 0.4);
      const x = cx + Math.cos(p.a) * rad;
      const yy = y + Math.sin(p.a) * rad * 0.12;
      ctx.strokeStyle = p.r > 0.5 ? 'rgba(0,240,255,0.7)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x - Math.sin(p.a) * 18, yy + Math.cos(p.a) * 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawClaw(t: number): void {
    // rail
    ctx.fillStyle = '#1a0533';
    ctx.fillRect(0, railY - 6, W, 12);
    ctx.strokeStyle = 'rgba(0,240,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-2, railY - 6, W + 4, 12);
    for (let x = 10; x < W; x += 26) {
      ctx.fillStyle = 'rgba(0,240,255,0.3)';
      ctx.fillRect(x, railY - 2, 10, 4);
    }
    const x = claw.x;
    const headY = claw.tip - 34 * s;
    // aim beam
    if (claw.mode === 'idle') {
      ctx.setLineDash([4, 7]);
      ctx.lineDashOffset = -t * 40;
      ctx.strokeStyle = 'rgba(255,43,214,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, claw.tip + 4);
      ctx.lineTo(x, floorY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // carriage + cable
    ctx.fillStyle = '#2a0a4a';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(x - 22 * s, railY - 10, 44 * s, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#c9b8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, railY + 10);
    ctx.lineTo(x, headY);
    ctx.stroke();
    // head
    ctx.fillStyle = '#1a0533';
    ctx.strokeStyle = '#ff2bd6';
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(x - 15 * s, headY);
    ctx.lineTo(x + 15 * s, headY);
    ctx.lineTo(x + 21 * s, headY + 13 * s);
    ctx.lineTo(x - 21 * s, headY + 13 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = Math.sin(t * 7) > 0 ? '#ffe94a' : '#553300';
    ctx.fillRect(x - 3 * s, headY + 4 * s, 6 * s, 4 * s);
    // prongs
    const spread = 0.1 + claw.open * 0.6;
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.lineWidth = 4 * s;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const px = x + side * 13 * s;
      const py = headY + 13 * s;
      const a1 = side * spread;
      const ex = px + Math.sin(a1) * 20 * s;
      const ey = py + Math.cos(a1) * 20 * s;
      const a2 = a1 - side * 1.1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex + Math.sin(a2) * 12 * s, ey + Math.cos(a2) * 12 * s);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';
    if (missText > 0) {
      ctx.globalAlpha = Math.min(1, missText * 1.5);
      ctx.font = `900 ${Math.round(20 * s)}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff3860';
      ctx.shadowColor = '#ff3860';
      ctx.shadowBlur = 14;
      ctx.fillText('MISSED!', x, claw.tip + 40 * s - (1.1 - missText) * 24);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  function render(t: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawInterior(t);
    for (const c of crates) {
      if (!c.inWorld) continue;
      drawCrate(ctx, c.def, c.body.position.x, c.body.position.y, cw, ch, c.body.angle);
    }
    drawTornado(t);
    if (claw.held) drawCrate(ctx, claw.held.def, claw.heldX, claw.heldY, cw, ch, claw.heldA, { glow: 0.8 });
    drawClaw(t);
  }

  function frame(dtMs: number, t: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    if (spawnQueue.length) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnOne(spawnQueue.shift()!);
        spawnTimer = 0.22;
      }
    }
    physics(dtMs);
    updateClaw(dt);
    tornado = Math.max(0, tornado - dt);
    missText = Math.max(0, missText - dt);
    thudCool -= dt;
    clawState.clawX = claw.x / W;
    render(t);
  }

  function resize(): void {
    const oldW = W;
    const oldH = H;
    measure();
    buildWalls();
    for (const c of crates) {
      if (!c.inWorld) continue;
      const p = c.body.position;
      const a = c.body.angle;
      removeFromWorld(c);
      addToWorld(c, Math.max(cw / 2, Math.min(W - cw / 2, (p.x / oldW) * W)), Math.min((p.y / oldH) * H, floorY - ch / 2), a);
    }
    claw.x = Math.max(28 * s, Math.min(W - 28 * s, (claw.x / oldW) * W));
    if (claw.mode === 'idle') claw.tip = restTip();
  }

  function savePile(): void {
    clawState.pile = crates
      .filter((c) => c.inWorld)
      .map((c) => ({ id: c.def.id, x: c.body.position.x / W, y: c.body.position.y / H, a: c.body.angle }));
  }

  function destroy(): void {
    Events.off(engine, 'collisionStart');
    Composite.clear(engine.world, false);
    Engine.clear(engine);
  }

  return {
    initialLayout,
    frame,
    resize,
    drop,
    cancel,
    hold,
    releaseHeld,
    heldRect,
    savePile,
    destroy,
    setDir(d: number) {
      claw.dir = d;
    },
    startTornado,
    get mode() {
      return claw.mode;
    },
    get reducedMotion() {
      return store.settings.reducedMotion;
    },
  };
}

export type Machine = ReturnType<typeof createMachine>;
