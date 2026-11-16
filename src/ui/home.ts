// The start screen: a claw machine full of neon cargo crates.
// Steer the claw with WASD / arrow keys (S or Space drops), or click a crate.
// The claw grabs it, drops it in the exit chute, and that mode launches.
import Matter from 'matter-js';
import '../styles/home.css';
import type { Screen } from '../router';
import { navigate } from '../router';
import { sfx } from '../core/audio';
import { store, save, todayKey } from '../core/storage';
import { streak } from '../core/stats';
import { unlock } from '../core/achievements';

const { Engine, Bodies, Body, Composite, Constraint, Query, Events } = Matter;

interface CrateDef {
  label: string;
  sub: string;
  route: string;
  color: string;
}

const CRATES: CrateDef[] = [
  { label: 'BLACK HOLE', sub: 'ARCADE', route: '/blackhole', color: '#ff2bd6' },
  { label: 'REPAIR', sub: 'TYPING TEST', route: '/repair', color: '#00d9ff' },
  { label: 'DAILY', sub: 'SEEDED RUN', route: '/daily', color: '#ffd23f' },
  { label: 'LESSONS', sub: 'TRAINING', route: '/lessons', color: '#2bff88' },
  { label: 'STATS', sub: 'PROGRESS', route: '/stats', color: '#9b4dff' },
  { label: 'SETTINGS', sub: 'CONFIG', route: '/settings', color: '#ff7a2b' },
];

interface Crate {
  def: CrateDef;
  key: string; // label lowercase without spaces
  body: Matter.Body;
  w: number;
  h: number;
  landed: boolean;
}

type ClawState = 'idle' | 'seek' | 'drop' | 'grab' | 'lift' | 'carry' | 'release' | 'return' | 'done';

const CAT_WALL = 0x0001;
const CAT_CRATE = 0x0002;
const CAT_GHOST = 0x0004;

let booted = false;

function shade(hex: string, amt: number): string {
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

export const homeScreen: Screen = (root) => {
  root.innerHTML = `
    <div class="home">
      <canvas class="home-bg"></canvas>
      <div class="home-giant" aria-hidden="true">
        <span class="row" data-text="GLITCH">GLITCH</span>
        <span class="row" data-text="_TYPE">_TYPE</span>
      </div>
      <canvas class="home-machine" aria-label="Claw machine: pick a mode"></canvas>
      <header class="home-top">
        <div class="home-logo"><span class="tag">GT</span><b>glitch_type</b><span class="muted ver">v1.0 // typing arcade</span></div>
        <div class="home-meta">
          <span class="chip credits">CREDITS <b>∞</b></span>
          <span class="chip streak"></span>
          <button class="chip sound" type="button"></button>
        </div>
      </header>
      <div class="home-hints">
        <span class="desk"><span class="kbd">A</span> <span class="kbd">D</span> move claw</span>
        <span class="desk"><span class="kbd">S</span> drop</span>
        <span class="desk"><span class="kbd">W</span> pull up</span>
        <span class="desk">or click a crate</span>
        <span class="touch">tap a crate to grab it · drag to throw</span>
      </div>
      <nav class="sr-only" aria-label="Modes">
        ${CRATES.map((c) => `<a href="#${c.route}">${c.label}</a>`).join('')}
      </nav>
    </div>`;

  const home = root.querySelector<HTMLDivElement>('.home')!;
  const bg = root.querySelector<HTMLCanvasElement>('.home-bg')!;
  const cv = root.querySelector<HTMLCanvasElement>('.home-machine')!;
  const bgx = bg.getContext('2d')!;
  const ctx = cv.getContext('2d')!;
  const soundBtn = root.querySelector<HTMLButtonElement>('.sound')!;
  const streakEl = root.querySelector<HTMLSpanElement>('.streak')!;

  // ---- top bar ----
  const s = streak();
  const dailyDone = store.daily[`${todayKey()}-bh`] !== undefined || store.daily[`${todayKey()}-rp`] !== undefined;
  streakEl.innerHTML = `🔥 <b>${s}</b> day streak${dailyDone ? ' · daily ✓' : ''}`;
  const paintSound = () => (soundBtn.innerHTML = store.settings.sound ? '♪ SOUND <b>ON</b>' : '♪ SOUND <b>OFF</b>');
  paintSound();
  soundBtn.addEventListener('click', () => {
    store.settings.sound = !store.settings.sound;
    save();
    paintSound();
    sfx.key();
  });

  // ---- sizing ----
  let W = 0;
  let H = 0;
  let floorY = 0;
  let chuteW = 0;
  let railY = 0;
  let cw = 0;
  let ch = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function measure(): void {
    W = window.innerWidth;
    H = window.innerHeight;
    railY = W < 640 ? 104 : 74;
    floorY = H - (W < 640 ? 122 : 104);
    chuteW = Math.max(96, Math.min(180, W * 0.13));
    cw = Math.max(112, Math.min(210, W * 0.135));
    ch = cw * 0.52;
    for (const c of [bg, cv]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
  }
  measure();

  // ---- physics world ----
  const engine = Engine.create({ gravity: { x: 0, y: 1.1 } });
  engine.positionIterations = 8;
  engine.velocityIterations = 6;
  let walls: Matter.Body[] = [];

  function buildWalls(): void {
    if (walls.length) Composite.remove(engine.world, walls);
    const opts = { isStatic: true, friction: 0.8, collisionFilter: { category: CAT_WALL } };
    const t = 200;
    walls = [
      Bodies.rectangle(chuteW + (W - chuteW) / 2, floorY + t / 2, W - chuteW, t, opts), // floor
      Bodies.rectangle(-t / 2, H / 2, t, H * 4, opts), // left wall
      Bodies.rectangle(W + t / 2, H / 2, t, H * 4, opts), // right wall
      Bodies.rectangle(chuteW - 7, floorY - 28, 14, 56, opts), // chute lip
    ];
    Composite.add(engine.world, walls);
  }
  buildWalls();

  const crates: Crate[] = CRATES.map((def, i) => {
    const body = Bodies.rectangle(0, 0, cw, ch, {
      chamfer: { radius: 6 },
      friction: 0.6,
      frictionAir: 0.012,
      restitution: 0.15,
      density: 0.002,
      collisionFilter: { category: CAT_CRATE, mask: CAT_WALL | CAT_CRATE },
    });
    const c: Crate = { def, key: def.label.toLowerCase().replace(/\s+/g, ''), body, w: cw, h: ch, landed: false };
    placeFromSky(c, i);
    return c;
  });

  function placeFromSky(c: Crate, i: number): void {
    const minX = chuteW + cw / 2 + 24;
    const maxX = W - cw / 2 - 16;
    const x = minX + Math.random() * Math.max(10, maxX - minX);
    Body.setPosition(c.body, { x, y: -ch - i * (ch + 70) });
    Body.setAngle(c.body, (Math.random() - 0.5) * 0.9);
    Body.setVelocity(c.body, { x: (Math.random() - 0.5) * 3, y: 0 });
    Body.setAngularVelocity(c.body, (Math.random() - 0.5) * 0.08);
    c.landed = false;
  }

  let cratesAdded = false;
  function dropCrates(): void {
    if (cratesAdded) return;
    cratesAdded = true;
    Composite.add(engine.world, crates.map((c) => c.body));
  }

  let lastThud = 0;
  Events.on(engine, 'collisionStart', (ev) => {
    for (const p of ev.pairs) {
      const speed = p.bodyA.speed + p.bodyB.speed;
      if (speed > 5 && performance.now() - lastThud > 70) {
        lastThud = performance.now();
        sfx.thud();
        if (speed > 12) kick(Math.min(10, speed * 0.4));
      }
    }
  });

  // ---- screen shake ----
  let shakeAmt = 0;
  function kick(n: number): void {
    if (store.settings.reducedMotion) return;
    shakeAmt = Math.max(shakeAmt, n);
  }

  // ---- claw ----
  const claw = {
    x: 0,
    tip: 0, // y of the claw tip
    open: 1, // 1 = open, 0 = closed
    state: 'idle' as ClawState,
    target: null as Crate | null,
    held: null as Crate | null,
    rope: null as Matter.Constraint | null,
    timer: 0,
    manual: false,
    vx: 0,
  };
  const restTip = () => railY + 110;
  claw.x = W * 0.62;
  claw.tip = restTip();

  let missText = 0;
  let cancelled = false;
  const keysDown = new Set<string>();

  function crateAt(x: number, y: number, list = crates): Crate | null {
    const bodies = list.map((c) => c.body);
    const hits = Query.point(bodies, { x, y });
    if (!hits.length) return null;
    return crates.find((c) => c.body === hits[0]) ?? null;
  }

  function startSeek(c: Crate): void {
    if (claw.state !== 'idle') return;
    claw.target = c;
    claw.manual = false;
    claw.state = 'seek';
  }

  function manualDrop(): void {
    if (claw.state !== 'idle') return;
    claw.target = null;
    claw.manual = true;
    claw.state = 'drop';
    sfx.laser();
  }

  function cancelDrop(): void {
    if (claw.state !== 'drop') return;
    claw.state = 'lift';
    claw.target = null;
    cancelled = true;
    sfx.whoosh();
  }

  function grab(c: Crate): void {
    const b = c.body;
    // grip the middle of whichever face is on top so the crate hangs straight
    const hw = c.w / 2;
    const hh = c.h / 2;
    const sin = Math.sin(b.angle);
    const cos = Math.cos(b.angle);
    const worldY = (p: { x: number; y: number }) => p.x * sin + p.y * cos;
    const local = [
      { x: 0, y: -hh },
      { x: 0, y: hh },
      { x: -hw, y: 0 },
      { x: hw, y: 0 },
    ].reduce((best, p) => (worldY(p) < worldY(best) ? p : best));
    claw.rope = Constraint.create({
      pointA: { x: claw.x, y: claw.tip },
      bodyB: b,
      pointB: local,
      length: 0,
      stiffness: 0.6,
      damping: 0.08,
    });
    Composite.add(engine.world, claw.rope);
    b.collisionFilter.category = CAT_GHOST;
    b.collisionFilter.mask = CAT_WALL;
    b.frictionAir = 0.05;
    claw.held = c;
    if (claw.manual) unlock('claw');
  }

  function release(): void {
    if (claw.rope) Composite.remove(engine.world, claw.rope);
    claw.rope = null;
    if (claw.held) {
      claw.held.body.frictionAir = 0.012;
      // fall straight through the lip and into the chute
      claw.held.body.collisionFilter.mask = 0;
    }
  }

  function launch(c: Crate): void {
    claw.state = 'done';
    sfx.whoosh();
    home.classList.add('launch');
    setTimeout(() => navigate(c.def.route), 520);
  }

  function updateClaw(dt: number): void {
    const speed = claw.manual || claw.state === 'idle' ? 520 : 760;
    switch (claw.state) {
      case 'idle': {
        let dir = 0;
        if (keysDown.has('left')) dir -= 1;
        if (keysDown.has('right')) dir += 1;
        claw.vx += (dir * 560 - claw.vx) * Math.min(1, dt * 10);
        claw.x = Math.max(chuteW + 30, Math.min(W - 30, claw.x + claw.vx * dt));
        claw.open = Math.min(1, claw.open + dt * 3);
        claw.tip += (restTip() - claw.tip) * Math.min(1, dt * 6);
        break;
      }
      case 'seek': {
        const t = claw.target!;
        const tx = t.body.position.x;
        const d = tx - claw.x;
        const step = Math.sign(d) * Math.min(Math.abs(d), speed * dt);
        claw.x += step;
        claw.vx = step / dt;
        if (Math.abs(d) < 3) {
          claw.state = 'drop';
          sfx.laser();
        }
        break;
      }
      case 'drop': {
        claw.vx = 0;
        if (claw.target) claw.x += (claw.target.body.position.x - claw.x) * Math.min(1, dt * 8);
        claw.tip += 620 * dt;
        claw.open = Math.min(1, claw.open + dt * 4);
        const list = claw.target ? [claw.target] : crates.filter((c) => c !== claw.held);
        let hit: Crate | null = null;
        for (const off of [0, -14, 14]) {
          hit = crateAt(claw.x + off, claw.tip + 4, list);
          if (hit) break;
        }
        if (hit) {
          grab(hit);
          claw.state = 'grab';
          claw.timer = 0.22;
          sfx.thud();
        } else if (claw.tip >= floorY - 6) {
          claw.tip = floorY - 6;
          claw.state = 'grab';
          claw.timer = 0.22;
        }
        break;
      }
      case 'grab': {
        claw.open = Math.max(0, claw.open - dt * 6);
        claw.timer -= dt;
        if (claw.timer <= 0) claw.state = 'lift';
        break;
      }
      case 'lift': {
        claw.tip -= 380 * dt;
        if (claw.tip <= restTip()) {
          claw.tip = restTip();
          if (claw.held) {
            claw.state = 'carry';
          } else {
            if (!cancelled) {
              missText = 1.2;
              sfx.error();
            }
            cancelled = false;
            claw.state = 'idle';
            claw.target = null;
          }
        }
        break;
      }
      case 'carry': {
        const tx = chuteW / 2;
        const d = tx - claw.x;
        const step = Math.sign(d) * Math.min(Math.abs(d), 560 * dt);
        claw.x += step;
        if (Math.abs(d) < 2) {
          claw.state = 'release';
          claw.timer = 0.25;
        }
        break;
      }
      case 'release': {
        claw.timer -= dt;
        if (claw.timer <= 0.12 && claw.rope) {
          release();
          sfx.whoosh();
        }
        claw.open = Math.min(1, claw.open + dt * 6);
        if (claw.timer <= 0) claw.state = 'return';
        break;
      }
      case 'return':
        claw.open = Math.min(1, claw.open + dt * 3);
        // failsafe: launch even if the crate somehow didn't leave the screen
        claw.timer -= dt;
        if (claw.timer < -1.5 && claw.held) launch(claw.held);
        break;
      case 'done':
        claw.open = Math.min(1, claw.open + dt * 3);
        break;
    }
    if (claw.rope) claw.rope.pointA = { x: claw.x, y: claw.tip };
  }

  // ---- keyboard: WASD / arrows steer the claw ----
  // e.code = physical key position, so WASD works on any keyboard layout
  const LEFT = new Set(['KeyA', 'ArrowLeft']);
  const RIGHT = new Set(['KeyD', 'ArrowRight']);
  const DROP = new Set(['KeyS', 'ArrowDown', 'Space', 'Enter', 'NumpadEnter']);
  const LIFT = new Set(['KeyW', 'ArrowUp']);

  const onDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (booting) {
      finishBoot();
      return;
    }
    const c = e.code;
    if (LEFT.has(c) || RIGHT.has(c)) {
      e.preventDefault();
      keysDown.add(LEFT.has(c) ? 'left' : 'right');
    } else if (DROP.has(c)) {
      e.preventDefault();
      if (!e.repeat) manualDrop();
    } else if (LIFT.has(c)) {
      e.preventDefault();
      cancelDrop();
    }
  };
  const onUp = (e: KeyboardEvent) => {
    if (LEFT.has(e.code)) keysDown.delete('left');
    if (RIGHT.has(e.code)) keysDown.delete('right');
  };
  const onBlur = () => keysDown.clear();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  // ---- pointer: click to grab, drag to throw ----
  let drag: { crate: Crate; con: Matter.Constraint; sx: number; sy: number; t: number; moved: boolean } | null = null;
  let hover: Crate | null = null;
  let pointer = { x: -999, y: -999 };

  const onPointerDown = (e: PointerEvent) => {
    if (booting) {
      finishBoot();
      return;
    }
    pointer = { x: e.clientX, y: e.clientY };
    const c = crateAt(e.clientX, e.clientY, crates.filter((x) => x !== claw.held));
    if (!c) return;
    cv.setPointerCapture(e.pointerId);
    const b = c.body;
    const dx = e.clientX - b.position.x;
    const dy = e.clientY - b.position.y;
    const cos = Math.cos(-b.angle);
    const sin = Math.sin(-b.angle);
    const con = Constraint.create({
      pointA: { x: e.clientX, y: e.clientY },
      bodyB: b,
      pointB: { x: dx * cos - dy * sin, y: dx * sin + dy * cos },
      length: 0,
      stiffness: 0.12,
      damping: 0.05,
    });
    drag = { crate: c, con, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
  };

  const onPointerMove = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) {
        drag.moved = true;
        Composite.add(engine.world, drag.con);
      }
      drag.con.pointA = { x: e.clientX, y: Math.min(e.clientY, floorY - 10) };
    }
  };

  const onPointerUp = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) {
      Composite.remove(engine.world, d.con);
    } else if (performance.now() - d.t < 500) {
      if (claw.state === 'idle') {
        sfx.key();
        startSeek(d.crate);
      }
    }
  };

  cv.addEventListener('pointerdown', onPointerDown);
  cv.addEventListener('pointermove', onPointerMove);
  cv.addEventListener('pointerup', onPointerUp);
  cv.addEventListener('pointercancel', onPointerUp);

  // ---- resize ----
  const onResize = () => {
    measure();
    buildWalls();
    for (const c of crates) {
      const x = Math.max(chuteW + c.w / 2 + 10, Math.min(W - c.w / 2 - 10, c.body.position.x));
      const y = Math.min(c.body.position.y, floorY - c.h);
      Body.setPosition(c.body, { x, y });
    }
    claw.x = Math.max(chuteW + 30, Math.min(W - 30, claw.x));
  };
  window.addEventListener('resize', onResize);

  // ---- background: stars + black hole ----
  const stars = Array.from({ length: 160 }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: Math.random() * 0.8 + 0.2,
    tw: Math.random() * Math.PI * 2,
  }));
  const motes = Array.from({ length: 90 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.2 + Math.random() * 0.6 }));

  function drawBg(t: number): void {
    bgx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bgx.clearRect(0, 0, W, H);
    for (const st of stars) {
      const x = ((st.x * W + t * 6 * st.z) % W + W) % W;
      const y = st.y * H;
      const a = 0.35 + 0.65 * Math.abs(Math.sin(st.tw + t * 1.5 * st.z));
      bgx.fillStyle = `rgba(230,220,255,${a * st.z})`;
      bgx.fillRect(x, y, st.z * 2, st.z * 2);
    }
    // black hole behind the giant title
    const cx = W * 0.5;
    const cy = H * 0.44;
    const R = Math.min(W, H) * 0.2;
    bgx.save();
    bgx.translate(cx, cy);
    const glow = bgx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 2.6);
    glow.addColorStop(0, 'rgba(139,43,255,0.35)');
    glow.addColorStop(0.4, 'rgba(255,43,214,0.12)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    bgx.fillStyle = glow;
    bgx.fillRect(-R * 3, -R * 3, R * 6, R * 6);
    // accretion disk
    bgx.save();
    bgx.scale(1, 0.32);
    for (let i = 0; i < 4; i++) {
      bgx.rotate(t * 0.25 + i);
      bgx.beginPath();
      bgx.ellipse(0, 0, R * (1.35 + i * 0.22), R * (1.35 + i * 0.22), 0, 0, Math.PI * 1.6);
      bgx.strokeStyle = i % 2 ? 'rgba(0,240,255,0.45)' : 'rgba(255,43,214,0.55)';
      bgx.lineWidth = 6 - i;
      bgx.shadowColor = i % 2 ? '#00f0ff' : '#ff2bd6';
      bgx.shadowBlur = 18;
      bgx.stroke();
    }
    bgx.restore();
    // motes spiralling in
    for (const m of motes) {
      m.a += 0.01 * m.s * (2 - m.r);
      m.r -= 0.0016 * m.s;
      if (m.r < 0.18) {
        m.r = 1;
        m.a = Math.random() * Math.PI * 2;
      }
      const rr = R * (0.5 + m.r * 1.9);
      bgx.fillStyle = `rgba(255,${150 + m.r * 100},255,${0.2 + (1 - m.r) * 0.6})`;
      bgx.fillRect(Math.cos(m.a) * rr, Math.sin(m.a) * rr * 0.36, 2, 2);
    }
    // event horizon
    bgx.shadowBlur = 0;
    const core = bgx.createRadialGradient(0, 0, 0, 0, 0, R * 0.62);
    core.addColorStop(0, '#000');
    core.addColorStop(0.82, '#000');
    core.addColorStop(1, 'rgba(255,200,255,0.9)');
    bgx.fillStyle = core;
    bgx.beginPath();
    bgx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
    bgx.fill();
    bgx.restore();
  }

  // ---- machine drawing ----
  function drawCrate(c: Crate, t: number): void {
    const b = c.body;
    const { x, y } = b.position;
    const a = b.angle;
    const hw = c.w / 2;
    const hh = c.h / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const local = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    const pts = local.map(([lx, ly]) => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos }));
    const E = { x: c.w * 0.11, y: -c.w * 0.09 }; // depth direction (fixed light)
    const col = c.def.color;

    // side faces of the 3D box
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
      const up = ny < 0;
      ctx.fillStyle = up ? shade(col, 0.25) : shade(col, -0.45);
      ctx.fill();
      ctx.strokeStyle = shade(col, -0.65);
      ctx.lineWidth = 1;
      ctx.stroke();
      // ribs on side faces
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

    // front face, drawn in the crate's local frame
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    const isHover = hover === c || claw.target === c;
    ctx.shadowColor = col;
    ctx.shadowBlur = isHover ? 30 : 10;
    const g = ctx.createLinearGradient(0, -hh, 0, hh);
    g.addColorStop(0, shade(col, 0.1));
    g.addColorStop(1, shade(col, -0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, c.w, c.h, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    // corrugation ribs
    ctx.save();
    ctx.beginPath();
    ctx.rect(-hw + 6, -hh + 6, c.w - 12, c.h - 12);
    ctx.clip();
    for (let rx = -hw + 8; rx < hw; rx += 9) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(rx, -hh, 3, c.h);
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(rx + 3, -hh, 1, c.h);
    }
    ctx.restore();
    // frame
    ctx.strokeStyle = shade(col, -0.55);
    ctx.lineWidth = 3;
    ctx.strokeRect(-hw + 3, -hh + 3, c.w - 6, c.h - 6);
    // door hinges
    ctx.fillStyle = shade(col, -0.6);
    for (const hy of [-hh * 0.55, hh * 0.45]) ctx.fillRect(hw - 14, hy, 6, 8);
    // stencil code
    ctx.font = `700 ${Math.max(8, c.h * 0.12)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`GT-0${CRATES.indexOf(c.def) + 1} · ${c.def.sub}`, -hw + 10, -hh + 9);
    // label
    const words = c.def.label.split(' ');
    const fs = Math.min(c.h * (words.length > 1 ? 0.27 : 0.33), (c.w * 0.82) / (Math.max(...words.map((w) => w.length)) * 0.82));
    ctx.font = `900 ${fs}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    words.forEach((word, wi) => {
      const ly = (wi - (words.length - 1) / 2) * fs * 1.02 + c.h * 0.08;
      const total = ctx.measureText(word).width;
      let lx = -total / 2;
      for (const chr of word) {
        const cwid = ctx.measureText(chr).width;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(chr, lx + cwid / 2 + 2, ly + 2);
        ctx.fillStyle = '#fff';
        ctx.fillText(chr, lx + cwid / 2, ly);
        lx += cwid;
      }
    });
    // ghosted glitch slice when carried
    if (claw.held === c && Math.sin(t * 40) > 0.6) {
      ctx.fillStyle = 'rgba(0,240,255,0.35)';
      ctx.fillRect(-hw, -hh + Math.random() * c.h, c.w, 4);
    }
    ctx.restore();
  }

  function drawFloor(t: number): void {
    // synthwave floor grid
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, floorY, W, H - floorY);
    ctx.clip();
    const fg = ctx.createLinearGradient(0, floorY, 0, H);
    fg.addColorStop(0, 'rgba(40,0,70,0.95)');
    fg.addColorStop(1, 'rgba(10,0,20,0.95)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.strokeStyle = 'rgba(255,43,214,0.35)';
    ctx.lineWidth = 1;
    const vx = W / 2;
    for (let i = -20; i <= 20; i++) {
      ctx.beginPath();
      ctx.moveTo(vx + i * 40, floorY);
      ctx.lineTo(vx + i * 160, H + 40);
      ctx.stroke();
    }
    const off = (t * 30) % 22;
    for (let y = floorY + off; y < H; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
    // floor edge
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(chuteW, floorY);
    ctx.lineTo(W, floorY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // chute
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, floorY - 2, chuteW - 14, H - floorY + 2);
    // hazard stripes on the lip
    ctx.save();
    ctx.beginPath();
    ctx.rect(chuteW - 14, floorY - 56, 14, 56);
    ctx.clip();
    for (let k = -4; k < 12; k++) {
      ctx.fillStyle = k % 2 ? '#111' : '#ffe94a';
      ctx.beginPath();
      ctx.moveTo(chuteW - 14, floorY - 56 + k * 10);
      ctx.lineTo(chuteW, floorY - 56 + k * 10 - 10);
      ctx.lineTo(chuteW, floorY - 56 + k * 10);
      ctx.lineTo(chuteW - 14, floorY - 56 + k * 10 + 10);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#ffe94a';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, floorY - 2, chuteW - 16, H - floorY);
    ctx.font = `800 ${Math.max(11, chuteW * 0.12)}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe94a';
    ctx.fillText('EXIT', (chuteW - 14) / 2, floorY + 18);
    const bounce = (t * 2) % 1;
    ctx.globalAlpha = 1 - bounce;
    ctx.fillText('▼', (chuteW - 14) / 2, floorY + 38 + bounce * 14);
    ctx.globalAlpha = 1;
  }

  function drawClaw(t: number): void {
    // rail
    ctx.strokeStyle = 'rgba(0,240,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, railY);
    ctx.lineTo(W - 10, railY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,240,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(10, railY + 6);
    ctx.lineTo(W - 10, railY + 6);
    ctx.stroke();
    for (let x = 20; x < W; x += 40) {
      ctx.fillStyle = 'rgba(0,240,255,0.35)';
      ctx.fillRect(x, railY - 1, 2, 8);
    }

    const x = claw.x;
    const headY = claw.tip - 44;
    // aim beam
    if (claw.state === 'idle') {
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = -t * 40;
      ctx.strokeStyle = 'rgba(255,43,214,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, claw.tip + 6);
      ctx.lineTo(x, floorY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // carriage
    ctx.fillStyle = '#1a0533';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(x - 26, railY - 10, 52, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ff2bd6' : '#550044';
    ctx.fillRect(x - 3, railY - 4, 6, 6);
    // cable
    ctx.strokeStyle = '#c9b8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, railY + 12);
    ctx.lineTo(x, headY);
    ctx.stroke();
    // head
    ctx.fillStyle = '#1a0533';
    ctx.strokeStyle = '#ff2bd6';
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(x - 18, headY);
    ctx.lineTo(x + 18, headY);
    ctx.lineTo(x + 24, headY + 16);
    ctx.lineTo(x - 24, headY + 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // prongs
    const spread = 0.12 + claw.open * 0.55;
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const px = x + side * 16;
      const py = headY + 16;
      const a1 = side * spread;
      const ex = px + Math.sin(a1) * 26;
      const ey = py + Math.cos(a1) * 26;
      const a2 = a1 - side * 1.1;
      const fx = ex + Math.sin(a2) * 16;
      const fy = ey + Math.cos(a2) * 16;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(ex, ey);
      ctx.lineTo(fx, fy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x, headY + 16);
    ctx.lineTo(x, headY + 30);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';

    if (missText > 0) {
      ctx.globalAlpha = Math.min(1, missText);
      ctx.font = '900 22px Orbitron, sans-serif';
      ctx.fillStyle = '#ff3860';
      ctx.textAlign = 'center';
      ctx.fillText('MISSED!', x, claw.tip + 40 - (1.2 - missText) * 30);
      ctx.globalAlpha = 1;
    }
  }

  function draw(t: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (shakeAmt > 0.2) {
      ctx.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
    }
    drawFloor(t);
    const order = [...crates].sort((p, q) => (p === claw.held ? 1 : q === claw.held ? -1 : 0));
    for (const c of order) {
      if (cratesAdded) drawCrate(c, t);
    }
    drawClaw(t);
  }

  // ---- main loop ----
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const STEP = 1000 / 60;

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dtMs = Math.min(100, now - last);
    last = now;
    const dt = dtMs / 1000;
    const t = now / 1000;
    acc += dtMs;
    while (acc >= STEP) {
      Engine.update(engine, STEP);
      acc -= STEP;
    }
    updateClaw(dt);
    shakeAmt *= 0.86;
    missText = Math.max(0, missText - dt);

    // hover detection
    hover = drag ? drag.crate : crateAt(pointer.x, pointer.y);
    cv.style.cursor = drag?.moved ? 'grabbing' : hover ? 'pointer' : 'default';

    // crates that fell into the chute
    for (const c of crates) {
      if (c.body.position.y > H + c.h * 2) {
        if (claw.held === c && claw.state !== 'done') {
          launch(c);
        } else if (claw.held !== c) {
          placeFromSky(c, 0);
        }
      }
    }

    drawBg(t);
    draw(t);
  }
  raf = requestAnimationFrame(frame);

  // ---- boot sequence ----
  let booting = false;
  let bootEl: HTMLDivElement | null = null;
  let bootTimer = 0;

  function finishBoot(): void {
    if (!booting || !bootEl) return;
    booting = false;
    clearTimeout(bootTimer);
    sfx.boot();
    bootEl.classList.add('out');
    const el = bootEl;
    setTimeout(() => el.remove(), 520);
    setTimeout(dropCrates, 250);
  }

  if (!booted) {
    booted = true;
    booting = true;
    bootEl = document.createElement('div');
    bootEl.className = 'boot';
    const pre = document.createElement('pre');
    bootEl.append(pre);
    home.append(bootEl);
    const lines: [string, string][] = [
      ['', '> GLITCH_TYPE BIOS v1.0'],
      ['', '> loading keyboard drivers ........ '],
      ['ok', 'OK\n'],
      ['', '> calibrating claw servos ........ '],
      ['ok', 'OK\n'],
      ['', '> scanning black hole ........... '],
      ['ok', 'STABLE(ish)\n'],
      ['warn', '> WARNING: reality corruption at 13%\n'],
      ['', '> no account needed. no tracking. just typing.\n'],
    ];
    let li = 0;
    let ci = 0;
    let span: HTMLSpanElement | null = null;
    const tick = () => {
      if (!booting) return;
      if (li >= lines.length) {
        const coin = document.createElement('span');
        coin.className = 'coin';
        coin.textContent = '[ PRESS ANY KEY TO INSERT COIN ]';
        pre.append(coin);
        return;
      }
      const [cls, text] = lines[li];
      if (!span) {
        span = document.createElement('span');
        if (cls) span.className = cls;
        pre.append(span);
        if (li > 0 && lines[li - 1][1].endsWith('\n') === false) {
          /* same line continuation */
        }
      }
      span.textContent = text.slice(0, ++ci);
      if (ci >= text.length) {
        if (!text.endsWith(' ') && !text.endsWith('\n')) span.textContent += '\n';
        li++;
        ci = 0;
        span = null;
        bootTimer = window.setTimeout(tick, cls === 'ok' ? 160 : 90);
      } else {
        bootTimer = window.setTimeout(tick, 14);
      }
    };
    tick();
    bootEl.addEventListener('pointerdown', finishBoot);
  } else {
    setTimeout(dropCrates, 120);
  }

  if (!store.seenIntro) {
    store.seenIntro = true;
    save();
  }

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(bootTimer);
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onResize);
    Events.off(engine, 'collisionStart');
    Composite.clear(engine.world, false);
    Engine.clear(engine);
  };
};
