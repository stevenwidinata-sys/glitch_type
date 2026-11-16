// Black Hole: rocks with letters/words fall out of a black hole.
// Type them to shoot them before they hit your shield.
import { mulberry32, pick, type Rng } from '../../core/rng';
import { onKeys } from '../../core/input';
import { sfx } from '../../core/audio';
import { store } from '../../core/storage';
import { recordKey } from '../../core/stats';
import { unlock } from '../../core/achievements';
import type { Lang } from '../../core/storage';
import { wordsFor } from '../../data/lessons';
import { CAMPAIGN, endlessWave, POWERS, type WaveDef, type Power } from './levels';
import { makeRock, burst, debrisBurst, type Rock, type Particle, type Laser, type Ring, type Debris, type FloatNum } from './entities';

export interface BHConfig {
  mode: 'endless' | 'campaign';
  level: number; // campaign level (1-based)
  seed: number;
  lang: Lang;
  beat?: number;
}

export interface BHResult {
  win: boolean;
  score: number;
  wave: number;
  hits: number;
  misses: number;
  chars: number;
  ms: number;
  bestCombo: number;
  lives: number;
}

export interface BHGame {
  destroy(): void;
}

const MAX_LIVES = 5;

export function runBlackHole(root: HTMLElement, cfg: BHConfig, onEnd: (r: BHResult) => void): BHGame {
  root.innerHTML = `
    <div class="game bh">
      <canvas></canvas>
      <div class="hud">
        <div class="grp">
          <div class="stat"><span class="label">score</span><b data-h="score">0</b></div>
          <div class="stat combo"><span class="label">combo</span><b data-h="combo">x1</b></div>
          <div class="stat"><span class="label">${cfg.mode === 'endless' ? 'wave' : 'level'}</span><b data-h="wave">1</b></div>
          <div class="stat"><span class="label">wpm</span><b data-h="wpm">0</b></div>
        </div>
        <div class="grp">
          ${cfg.beat !== undefined ? `<div class="stat"><span class="label">beat this</span><b style="color:var(--pink)">${cfg.beat}</b></div>` : ''}
          <div class="stat"><span class="label">shield</span><b class="lives" data-h="lives"></b></div>
          <button class="hud-btn" data-h="pause" type="button">ESC pause</button>
        </div>
      </div>
    </div>`;

  const wrap = root.querySelector<HTMLDivElement>('.game')!;
  const cv = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = cv.getContext('2d')!;
  const hud = (k: string) => root.querySelector<HTMLElement>(`[data-h="${k}"]`)!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let W = 0;
  let H = 0;
  let holeX = 0;
  let holeY = 0;
  let holeR = 0;
  let groundY = 0;
  function measure(): void {
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    holeX = W / 2;
    holeY = Math.max(110, H * 0.17);
    holeR = Math.max(34, Math.min(W, H) * 0.065);
    groundY = H - 70;
  }
  measure();
  const onResize = () => measure();
  window.addEventListener('resize', onResize);

  // ---- state ----
  const rng: Rng = mulberry32(cfg.seed);
  const words = wordsFor(cfg.lang);
  const byLen = new Map<number, string[]>();
  for (const w of words) {
    if (!byLen.has(w.length)) byLen.set(w.length, []);
    byLen.get(w.length)!.push(w);
  }

  let waveNo = cfg.mode === 'endless' ? 1 : cfg.level;
  let wave: WaveDef = cfg.mode === 'endless' ? endlessWave(1) : CAMPAIGN[cfg.level - 1];
  let spawned = 0;
  let spawnTimer = 1.2;
  let restTimer = 0;
  let bossSpawned = false;

  const rocks: Rock[] = [];
  const particles: Particle[] = [];
  const lasers: Laser[] = [];
  const rings: Ring[] = [];
  let locked: Rock | null = null;

  let score = 0;
  let combo = 0;
  let bestCombo = 0;
  let lives = 3;
  let hits = 0;
  let misses = 0;
  let chars = 0;
  let playMs = 0;
  let freeze = 0;
  let shake = 0;
  let flashWhite = 0;
  let paused = false;
  let over = false;
  let shipAngle = -Math.PI / 2;
  let holePulse = 0;
  let hitStop = 0;
  let magnet = 0;
  let magnetTick = 0;
  const debris: Debris[] = [];
  const floats: FloatNum[] = [];
  const armorChance = () => (cfg.mode === 'endless' ? (waveNo >= 4 ? 0.18 : 0) : waveNo >= 11 ? 0.22 : 0);
  const splitChance = () => (cfg.mode === 'endless' ? (waveNo >= 3 ? 0.16 : 0) : waveNo >= 6 ? 0.16 : 0);

  const mult = () => Math.min(8, 1 + Math.floor(combo / 10));

  function pickWord(min: number, max: number): string {
    for (let tries = 0; tries < 10; tries++) {
      const len = min + Math.floor(rng() * (max - min + 1));
      const list = byLen.get(len);
      if (list?.length) return pick(rng, list);
    }
    return pick(rng, words);
  }

  function spawn(kind: 'auto' | 'boss' = 'auto'): void {
    const margin = 60;
    const tx = margin + rng() * (W - margin * 2);
    const from = { x: holeX, y: holeY };
    let rock: Rock;
    if (kind === 'boss') {
      const text = pickWord(Math.max(6, wave.wordLen[1]), Math.max(8, wave.wordLen[1] + 2));
      rock = makeRock(rng, 'boss', text, from, W / 2 + (rng() - 0.5) * W * 0.3, wave.fall * 1.5);
    } else if (wave.powerChance > 0 && rng() < wave.powerChance) {
      const power: Power = pick(rng, POWERS);
      rock = makeRock(rng, 'power', power, from, tx, wave.fall * 1.1, power);
    } else if (rng() < wave.wordRatio) {
      rock = makeRock(rng, 'word', pickWord(wave.wordLen[0], wave.wordLen[1]), from, tx, wave.fall * (1 + wave.wordLen[1] * 0.04));
      if (rng() < armorChance()) {
        rock.armor = 1;
        rock.hue = '#cfd8ff';
        rock.fall *= 1.25;
      }
    } else {
      // avoid two identical letters on screen at once when possible
      let letter = pick(rng, [...wave.letters]);
      for (let i = 0; i < 4 && rocks.some((r) => !r.dead && r.text[0] === letter); i++) letter = pick(rng, [...wave.letters]);
      rock = makeRock(rng, 'letter', letter, from, tx, wave.fall);
      if (rng() < splitChance()) {
        rock.splitter = true;
        rock.hue = '#ff8a2b';
      }
    }
    // never start two rocks with the same first letter while unlocked words are active
    rocks.push(rock);
    holePulse = 1;
  }

  function banner(text: string, sub = ''): void {
    const b = document.createElement('div');
    b.className = 'banner';
    b.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    wrap.append(b);
    setTimeout(() => b.remove(), 1700);
  }

  function announce(text: string): void {
    const a = document.createElement('div');
    a.className = 'announcer';
    a.textContent = text;
    wrap.append(a);
    setTimeout(() => a.remove(), 1100);
  }

  function glitch(): void {
    if (store.settings.reducedMotion) return;
    wrap.classList.remove('glitch-flash');
    void wrap.offsetWidth;
    wrap.classList.add('glitch-flash');
  }

  function fire(rock: Rock): void {
    const sx = W / 2;
    const sy = groundY + 20;
    lasers.push({ x1: sx, y1: sy, x2: rock.x, y2: rock.y, life: 0.12 });
    shipAngle = Math.atan2(rock.y - sy, rock.x - sx);
    rock.flash = 0.1;
    burst(particles, rock.x, rock.y, 5, ['#fff', rock.hue], 160);
    sfx.laser();
  }

  function destroyRock(rock: Rock, byPlayer = true): void {
    // armored rocks lose a plate first and must be typed again
    if (byPlayer && rock.armor > 0) {
      rock.armor--;
      rock.typed = 0;
      rock.hue = '#b14dff';
      if (locked === rock) locked = null;
      debrisBurst(debris, rock.x, rock.y, 8, '#cfd8ff', rock.r);
      floats.push({ x: rock.x, y: rock.y - rock.r - 10, text: 'ARMOR BROKEN', color: '#cfd8ff', life: 1, size: 14 });
      sfx.block();
      hitStop = 0.04;
      return;
    }
    rock.dead = true;
    if (locked === rock) locked = null;
    const big = rock.kind === 'boss';
    burst(particles, rock.x, rock.y, big ? 70 : 22, [rock.hue, '#ffffff', '#ff2bd6'], big ? 420 : 280);
    debrisBurst(debris, rock.x, rock.y, big ? 18 : 6, rock.hue, rock.r);
    rings.push({ x: rock.x, y: rock.y, r: rock.r, life: 0.5, color: rock.hue });
    sfx.explode(big);
    if (!byPlayer) return;
    const pts = rock.text.length * 10 * mult() + (big ? 500 : 0);
    score += pts;
    hitStop = Math.max(hitStop, big ? 0.14 : 0.03);
    floats.push({ x: rock.x, y: rock.y, text: '+' + pts, color: mult() > 1 ? '#ffe94a' : '#fff', life: 0.9, size: big ? 30 : 18 });
    if (big) {
      unlock('boss');
      shake = Math.max(shake, 14);
      // boss splits into letter shards
      for (let i = 0; i < 3; i++) {
        const shard = makeRock(rng, 'letter', pick(rng, [...wave.letters]), { x: rock.x, y: rock.y }, rock.x + (i - 1) * 160, wave.fall * 0.6);
        shard.sx = rock.x;
        shard.sy = rock.y;
        rocks.push(shard);
      }
    }
    if (rock.splitter) {
      for (const dir of [-1, 1]) {
        const shard = makeRock(rng, 'letter', pick(rng, [...wave.letters]), { x: rock.x, y: rock.y }, Math.max(40, Math.min(W - 40, rock.x + dir * 140)), wave.fall * 0.7);
        shard.sx = rock.x;
        shard.sy = rock.y;
        shard.p = 0.06;
        rocks.push(shard);
      }
      floats.push({ x: rock.x, y: rock.y - 24, text: 'SPLIT!', color: '#ff8a2b', life: 0.8, size: 14 });
    }
    if (rock.kind === 'power' && rock.power) triggerPower(rock.power);
  }

  function triggerPower(p: Power): void {
    sfx.power();
    if (p === 'freeze') {
      freeze = 6;
      banner('FREEZE', 'time slowed');
    } else if (p === 'nuke') {
      unlock('nuke');
      flashWhite = 1;
      shake = 20;
      banner('NUKE', 'screen cleared');
      for (const r of rocks) if (!r.dead) destroyRock(r, true);
    } else if (p === 'shield') {
      lives = Math.min(MAX_LIVES, lives + 1);
      banner('SHIELD +1');
    } else if (p === 'magnet') {
      magnet = 5;
      magnetTick = 0.2;
      banner('MAGNET', 'auto-aim for 5 seconds');
    }
  }

  function miss(expected: string | undefined): void {
    misses++;
    if (expected) recordKey(expected, false);
    if (combo >= 10) banner('COMBO LOST');
    combo = 0;
    shake = Math.max(shake, 7);
    glitch();
    sfx.error();
  }

  function hitChar(rock: Rock): void {
    hits++;
    chars++;
    recordKey(rock.text[rock.typed], true);
    rock.typed++;
    combo++;
    bestCombo = Math.max(bestCombo, combo);
    if (combo >= 50) unlock('combo_50');
    if (combo > 0 && combo % 10 === 0) sfx.combo(combo / 10);
    const shout = ({ 10: 'NICE!', 25: 'GREAT!', 50: 'UNSTOPPABLE!', 75: 'LEGENDARY!', 100: 'GODLIKE!' } as Record<number, string>)[combo];
    if (shout) announce(shout);
    fire(rock);
    if (rock.typed >= rock.text.length) destroyRock(rock);
  }

  function onKey(k: string): void {
    if (over) return;
    if (k === 'Escape') {
      togglePause();
      return;
    }
    if (paused) return;
    if (k === 'Backspace') {
      if (locked) {
        locked.typed = 0;
        locked = null;
      }
      return;
    }
    if (k.length !== 1 || k === ' ') return;
    const ch = k.toLowerCase();
    if (locked && !locked.dead) {
      if (locked.text[locked.typed] === ch) hitChar(locked);
      else miss(locked.text[locked.typed]);
      return;
    }
    // find the most dangerous rock starting with this letter
    let best: Rock | null = null;
    for (const r of rocks) {
      if (r.dead || r.typed > 0 || r.p < 0.04) continue;
      if (r.text[0] === ch && (!best || r.p > best.p)) best = r;
    }
    if (best) {
      if (best.text.length > 1) locked = best;
      hitChar(best);
    } else {
      // guess what they meant: the lowest rock on screen
      let lowest: Rock | null = null;
      for (const r of rocks) if (!r.dead && (!lowest || r.p > lowest.p)) lowest = r;
      miss(lowest?.text[lowest.typed]);
    }
  }

  // ---- pause ----
  let pauseEl: HTMLDivElement | null = null;
  function togglePause(force?: boolean): void {
    if (over) return;
    paused = force ?? !paused;
    pauseEl?.remove();
    pauseEl = null;
    if (paused) {
      pauseEl = document.createElement('div');
      pauseEl.className = 'overlay';
      pauseEl.innerHTML = `<div class="panel"><span class="label">system halted</span><h2 class="result-title" style="color:var(--cyan)">PAUSED</h2>
        <div class="result-actions" style="margin-top:22px"><button class="btn" data-p="resume">Resume <span class="k">ESC</span></button><a class="btn ghost" href="#/blackhole">Quit</a></div></div>`;
      pauseEl.querySelector('[data-p="resume"]')!.addEventListener('click', () => togglePause(false));
      document.body.append(pauseEl);
    }
  }
  hud('pause').addEventListener('click', () => togglePause());
  const onVis = () => {
    if (document.hidden && !paused && !over) togglePause(true);
  };
  document.addEventListener('visibilitychange', onVis);

  const offKeys = onKeys((k) => onKey(k));

  // ---- update ----
  function update(dt: number): void {
    const stopped = hitStop > 0;
    hitStop = Math.max(0, hitStop - dt);
    const ts = freeze > 0 ? 0.35 : 1;
    freeze = Math.max(0, freeze - dt);
    const gdt = stopped ? 0 : dt * ts;

    // magnet: auto-fire at the lowest rock
    if (magnet > 0) {
      magnet -= dt;
      magnetTick -= dt;
      if (magnetTick <= 0) {
        magnetTick = 0.4;
        let low: Rock | null = null;
        for (const r of rocks) if (!r.dead && r.kind !== 'power' && r.p > 0.05 && (!low || r.p > low.p)) low = r;
        if (low) {
          fire(low);
          destroyRock(low);
        }
      }
    }
    playMs += dt * 1000;

    // spawning
    if (restTimer > 0) {
      restTimer -= dt;
      if (restTimer <= 0) {
        waveNo++;
        wave = endlessWave(waveNo);
        spawned = 0;
        bossSpawned = false;
        spawnTimer = 0.6;
        if (waveNo >= 10) unlock('wave_10');
        banner(`WAVE ${waveNo}`, wave.hint);
      }
    } else if (spawned < wave.count) {
      spawnTimer -= gdt;
      if (spawnTimer <= 0) {
        spawn();
        spawned++;
        spawnTimer = wave.interval * (0.75 + rng() * 0.5);
      }
    } else if (wave.boss && !bossSpawned) {
      if (rocks.every((r) => r.dead)) {
        bossSpawned = true;
        banner('BOSS', 'type the whole word');
        spawn('boss');
      }
    } else if (rocks.every((r) => r.dead)) {
      if (cfg.mode === 'campaign') {
        finish(true);
        return;
      }
      restTimer = 2;
    }

    // rocks
    for (const r of rocks) {
      if (r.dead) continue;
      r.p += gdt / r.fall;
      const e = r.p;
      r.x = r.sx + (r.tx - r.sx) * e + Math.sin(e * Math.PI) * r.curve * W * 0.12;
      r.y = r.sy + (groundY - r.r * 0.5 - r.sy) * e;
      r.rot += r.spin * gdt;
      r.flash = Math.max(0, r.flash - dt);
      if (gdt > 0) {
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 7) r.trail.shift();
      }
      if (r.p >= 1) {
        r.dead = true;
        if (locked === r) locked = null;
        burst(particles, r.x, groundY, 30, ['#ff3860', '#ff2bd6', '#fff'], 300);
        rings.push({ x: r.x, y: groundY, r: 20, life: 0.6, color: '#ff3860' });
        if (r.kind !== 'power') {
          lives--;
          combo = 0;
          shake = 16;
          glitch();
          sfx.hit();
          if (lives <= 0) {
            finish(false);
            return;
          }
        }
      }
    }
    if (rocks.length > 80) {
      for (let i = rocks.length - 1; i >= 0; i--) if (rocks[i].dead) rocks.splice(i, 1);
    }

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    for (const d of debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 260 * dt;
      d.rot += d.vr * dt;
      d.life -= dt;
    }
    for (let i = debris.length - 1; i >= 0; i--) if (debris[i].life <= 0) debris.splice(i, 1);
    for (const f of floats) {
      f.y -= 50 * dt;
      f.life -= dt;
    }
    for (let i = floats.length - 1; i >= 0; i--) if (floats[i].life <= 0) floats.splice(i, 1);
    for (const l of lasers) l.life -= dt;
    for (let i = lasers.length - 1; i >= 0; i--) if (lasers[i].life <= 0) lasers.splice(i, 1);
    for (const r of rings) {
      r.r += 260 * dt;
      r.life -= dt;
    }
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].life <= 0) rings.splice(i, 1);
    shake *= 0.88;
    flashWhite = Math.max(0, flashWhite - dt * 2);
    holePulse = Math.max(0, holePulse - dt * 3);
  }

  // ---- render ----
  const stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }));
  const nebula = (() => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 900;
    const n = c.getContext('2d')!;
    const r = mulberry32(cfg.seed ^ 0x5eed);
    for (let i = 0; i < 26; i++) {
      const x = r() * 900;
      const y = r() * 900;
      const rad = 80 + r() * 220;
      const col = ['139,43,255', '255,43,214', '0,240,255', '60,20,140'][i % 4];
      const g = n.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(' + col + ',' + (0.06 + r() * 0.08) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      n.fillStyle = g;
      // draw wrapped copies so the tile repeats without seams
      for (const ox of [-900, 0, 900]) {
        for (const oy of [-900, 0, 900]) {
          n.save();
          n.translate(ox, oy);
          n.fillRect(x - rad, y - rad, rad * 2, rad * 2);
          n.restore();
        }
      }
    }
    return c;
  })();
  let nebulaY = 0;

  function drawHole(t: number): void {
    ctx.save();
    ctx.translate(holeX, holeY);
    const R = holeR * (1 + holePulse * 0.08);
    const glow = ctx.createRadialGradient(0, 0, R * 0.4, 0, 0, R * 3.4);
    glow.addColorStop(0, 'rgba(139,43,255,0.45)');
    glow.addColorStop(0.5, 'rgba(255,43,214,0.12)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-R * 4, -R * 4, R * 8, R * 8);
    ctx.save();
    ctx.scale(1, 0.34);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(t * (0.6 + i * 0.1) + i);
      ctx.beginPath();
      ctx.arc(0, 0, R * (1.4 + i * 0.28), 0, Math.PI * 1.5);
      ctx.strokeStyle = i % 2 ? 'rgba(0,240,255,0.6)' : 'rgba(255,43,214,0.7)';
      ctx.lineWidth = 5 - i;
      ctx.shadowColor = i % 2 ? '#00f0ff' : '#ff2bd6';
      ctx.shadowBlur = 16;
      ctx.stroke();
    }
    ctx.restore();
    ctx.shadowBlur = 0;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    core.addColorStop(0, '#000');
    core.addColorStop(0.8, '#000');
    core.addColorStop(1, 'rgba(255,210,255,0.95)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRock(r: Rock, t: number): void {
    const scale = Math.min(1, 0.25 + r.p * 6);
    // glow trail
    for (let i = 0; i < r.trail.length - 1; i++) {
      const p = r.trail[i];
      const k = i / r.trail.length;
      ctx.globalAlpha = k * 0.25;
      ctx.fillStyle = r.hue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r.r * scale * (0.3 + k * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.save();
    ctx.rotate(r.rot);
    ctx.scale(scale, scale);
    ctx.beginPath();
    r.shape.forEach((m, i) => {
      const a = (i / r.shape.length) * Math.PI * 2;
      const px = Math.cos(a) * r.r * m;
      const py = Math.sin(a) * r.r * m;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    const g = ctx.createRadialGradient(-r.r * 0.3, -r.r * 0.3, 2, 0, 0, r.r);
    g.addColorStop(0, '#3a1f5c');
    g.addColorStop(1, '#120526');
    ctx.fillStyle = r.flash > 0 ? '#fff' : g;
    ctx.fill();
    ctx.lineWidth = r.kind === 'boss' ? 3.5 : 2;
    ctx.strokeStyle = r.hue;
    ctx.shadowColor = r.hue;
    ctx.shadowBlur = r.kind === 'power' ? 18 + Math.sin(t * 8) * 8 : 12;
    ctx.stroke();
    // craters
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(r.r * 0.3, r.r * 0.2, r.r * 0.16, 0, Math.PI * 2);
    ctx.arc(-r.r * 0.25, -r.r * 0.35, r.r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // speckle texture + rim light
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 6; i++) {
      const a = r.shape[i % r.shape.length] * 9 + i;
      ctx.fillRect(Math.cos(a) * r.r * 0.5, Math.sin(a) * r.r * 0.5, 2, 2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r.r * 0.78, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
    if (r.armor > 0) {
      // metal plates
      ctx.strokeStyle = '#cfd8ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      r.shape.forEach((m, i) => {
        const a = (i / r.shape.length) * Math.PI * 2;
        const px = Math.cos(a) * r.r * m * 0.82;
        const py = Math.sin(a) * r.r * m * 0.82;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#cfd8ff';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r.r * 0.55, Math.sin(a) * r.r * 0.55, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (r.splitter) {
      ctx.strokeStyle = '#ffd08a';
      ctx.shadowColor = '#ff8a2b';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r.r * 0.7, -r.r * 0.1);
      ctx.lineTo(-r.r * 0.2, r.r * 0.1);
      ctx.lineTo(r.r * 0.1, -r.r * 0.15);
      ctx.lineTo(r.r * 0.7, r.r * 0.12);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    if (scale < 0.6) {
      ctx.restore();
      return;
    }

    // lock reticle
    if (locked === r) {
      ctx.save();
      ctx.rotate(t * 3);
      ctx.strokeStyle = '#ffe94a';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.arc(0, 0, r.r + 10, -0.4, 0.4);
        ctx.stroke();
      }
      ctx.restore();
    }

    // label
    const label = r.kind === 'power' ? r.text.toUpperCase() : r.text;
    if (r.kind === 'letter') {
      ctx.font = `800 ${r.r * 1.15}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = r.hue;
      ctx.shadowBlur = 10;
      ctx.fillText(label.toUpperCase(), 0, 2);
      ctx.shadowBlur = 0;
    } else {
      const fs = r.kind === 'boss' ? 24 : 18;
      ctx.font = `800 ${fs}px "JetBrains Mono", monospace`;
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width;
      const by = r.r + 18;
      ctx.fillStyle = 'rgba(8,0,18,0.85)';
      ctx.strokeStyle = locked === r ? '#ffe94a' : r.hue;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-w / 2 - 8, by - fs * 0.75, w + 16, fs * 1.5, 4);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      let x = -w / 2;
      for (let i = 0; i < label.length; i++) {
        const c = label[i];
        ctx.fillStyle = i < r.typed ? '#ffe94a' : '#fff';
        ctx.globalAlpha = i < r.typed ? 0.55 : 1;
        ctx.fillText(c, x, by + 1);
        x += ctx.measureText(c).width;
      }
      ctx.globalAlpha = 1;
      if (r.kind === 'power') {
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffe94a';
        ctx.fillText('POWER-UP', 0, -r.r - 10);
      }
    }
    ctx.restore();
  }

  function drawShip(): void {
    const sx = W / 2;
    const sy = groundY + 22;
    // shield dome
    ctx.save();
    const shieldCol = lives > 1 ? '0,240,255' : '255,56,96';
    ctx.strokeStyle = `rgba(${shieldCol},0.75)`;
    ctx.shadowColor = `rgb(${shieldCol})`;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.quadraticCurveTo(W / 2, groundY - 26, W, groundY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const gg = ctx.createLinearGradient(0, groundY - 20, 0, H);
    gg.addColorStop(0, `rgba(${shieldCol},0.12)`);
    gg.addColorStop(1, 'rgba(10,0,20,0.9)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.quadraticCurveTo(W / 2, groundY - 26, W, groundY);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(shipAngle + Math.PI / 2);
    // engine flame
    const fl = 0.7 + Math.random() * 0.5;
    const flame = ctx.createLinearGradient(0, 10, 0, 34 * fl);
    flame.addColorStop(0, 'rgba(255,255,255,0.95)');
    flame.addColorStop(0.3, 'rgba(0,240,255,0.9)');
    flame.addColorStop(1, 'rgba(255,43,214,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-7, 12);
    ctx.quadraticCurveTo(0, 40 * fl, 7, 12);
    ctx.fill();
    // wings
    ctx.fillStyle = '#16032c';
    ctx.strokeStyle = '#ff2bd6';
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(26, 12);
    ctx.lineTo(24, 18);
    ctx.lineTo(8, 12);
    ctx.lineTo(-8, 12);
    ctx.lineTo(-24, 18);
    ctx.lineTo(-26, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // hull
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(9, -6);
    ctx.lineTo(8, 14);
    ctx.lineTo(-8, 14);
    ctx.lineTo(-9, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // cockpit
    const cp = ctx.createLinearGradient(0, -20, 0, -4);
    cp.addColorStop(0, '#ffe94a');
    cp.addColorStop(1, '#ff2bd6');
    ctx.fillStyle = cp;
    ctx.beginPath();
    ctx.ellipse(0, -12, 4, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // wing tip lights
    ctx.fillStyle = Math.sin(performance.now() / 120) > 0 ? '#ff2b4d' : '#39ff88';
    ctx.fillRect(-26, 11, 3, 3);
    ctx.fillRect(23, 11, 3, 3);
    ctx.restore();
    if (magnet > 0) {
      ctx.strokeStyle = 'rgba(255,233,74,' + (0.4 + Math.sin(performance.now() / 80) * 0.2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 40, Math.PI, 0);
      ctx.stroke();
    }
  }

  function render(t: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07000f';
    ctx.fillRect(0, 0, W, H);
    // parallax nebula
    nebulaY = (nebulaY + 0.15 * (freeze > 0 ? 0.3 : 1)) % 900;
    for (let ty = -900 + nebulaY; ty < H; ty += 900) {
      for (let tx = 0; tx < W; tx += 900) ctx.drawImage(nebula, tx, ty);
    }
    if (shake > 0.3 && !store.settings.reducedMotion) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    // warp stars streaming out of the hole
    const speed = freeze > 0 ? 0.2 : 1;
    for (const s of stars) {
      s.y += 0.0009 * s.z * speed * (1 + waveNo * 0.05);
      if (s.y > 1) {
        s.y = 0;
        s.x = Math.random();
      }
      ctx.fillStyle = `rgba(220,210,255,${0.25 + s.z * 0.5})`;
      ctx.fillRect(s.x * W, s.y * H, s.z * 2, s.z * 2 + s.z * 4 * speed);
    }
    drawHole(t);

    for (const r of rocks) if (!r.dead) drawRock(r, t);

    for (const l of lasers) {
      ctx.strokeStyle = `rgba(0,240,255,${l.life / 0.12})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (const r of rings) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, r.life * 2);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const d of debris) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, d.life * 1.5);
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = '#1a0a30';
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-d.size, -d.size * 0.4);
      ctx.lineTo(d.size * 0.6, -d.size * 0.7);
      ctx.lineTo(d.size, d.size * 0.5);
      ctx.lineTo(-d.size * 0.4, d.size * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    drawShip();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floats) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = '900 ' + f.size + 'px Orbitron, sans-serif';
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    if (freeze > 0) {
      ctx.fillStyle = `rgba(0,200,255,${0.08 + Math.sin(t * 6) * 0.03})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (flashWhite > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashWhite * 0.8})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---- hud ----
  let lastHud = '';
  function paintHud(): void {
    const wpm = playMs > 2000 ? Math.round(chars / 5 / (playMs / 60000)) : 0;
    const key = `${score}|${combo}|${waveNo}|${wpm}|${lives}`;
    if (key === lastHud) return;
    lastHud = key;
    hud('score').textContent = String(score);
    hud('combo').textContent = `x${mult()}${combo ? ` · ${combo}` : ''}`;
    hud('wave').textContent = String(waveNo);
    hud('wpm').textContent = String(wpm);
    hud('lives').textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
  }

  // ---- loop ----
  let raf = 0;
  let last = performance.now();
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused && !over) update(dt);
    render(now / 1000);
    paintHud();
  }
  raf = requestAnimationFrame(frame);

  banner(cfg.mode === 'endless' ? 'WAVE 1' : `LEVEL ${cfg.level}`, cfg.mode === 'endless' ? 'type the letters to shoot' : `${wave.name} · ${wave.hint}`);

  function finish(win: boolean): void {
    if (over) return;
    over = true;
    locked = null;
    if (win) sfx.win();
    else sfx.gameOver();
    setTimeout(
      () =>
        onEnd({
          win,
          score,
          wave: waveNo,
          hits,
          misses,
          chars,
          ms: playMs,
          bestCombo,
          lives,
        }),
      win ? 600 : 1100,
    );
  }

  return {
    destroy() {
      cancelAnimationFrame(raf);
      offKeys();
      pauseEl?.remove();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
