// Bomb Defuse: type a wire's code word to cut it. Cut every wire before the timer hits zero.
// Typos make the timer run 2.5x faster for 2 seconds.
import '../../styles/bomb.css';
import { mulberry32, pick, type Rng } from '../../core/rng';
import { onKeys } from '../../core/input';
import { sfx } from '../../core/audio';
import { store } from '../../core/storage';
import { recordKey, calcAcc } from '../../core/stats';
import { unlock } from '../../core/achievements';
import { WORDS_EN } from '../../data/words-en';

export interface BombLevel {
  n: number;
  wires: number;
  len: [number, number];
  wpm: number; // typing speed the timer is tuned for
}

export const BOMB_LEVELS: BombLevel[] = Array.from({ length: 12 }, (_, i) => ({
  n: i + 1,
  wires: Math.min(8, 3 + Math.floor(i / 2)),
  len: [Math.min(6, 3 + Math.floor(i / 3)), Math.min(10, 4 + Math.floor(i / 2))] as [number, number],
  wpm: 18 + i * 4.5,
}));

export function endlessLevel(k: number): BombLevel {
  return {
    n: k,
    wires: Math.min(8, 3 + Math.floor(k / 2)),
    len: [Math.min(6, 3 + Math.floor(k / 3)), Math.min(10, 4 + Math.floor(k / 2))],
    wpm: 22 + k * 4,
  };
}

export interface BombResult {
  win: boolean;
  timeLeft: number; // seconds left on the last bomb
  defused: number; // bombs defused (endless)
  wpm: number;
  acc: number;
  chars: number;
  ms: number;
}

const WIRE_COLORS = ['#ff3b3b', '#2b8cff', '#ffe94a', '#39ff88', '#f4ecff', '#b14dff', '#ff8a2b', '#00f0ff'];

interface Wire {
  word: string;
  typed: number;
  cut: boolean;
  cutT: number;
  color: string;
  sag: number;
}

export function runBomb(
  root: HTMLElement,
  opts: { mode: 'levels' | 'endless'; level: number; seed: number },
  onEnd: (r: BombResult) => void,
): { destroy(): void } {
  root.innerHTML = `
    <div class="bomb">
      <canvas class="bm-canvas"></canvas>
      <div class="bm-top">
        <div><span class="label">${opts.mode === 'endless' ? 'endless' : 'level'}</span><b data-h="lvl">${opts.level}</b></div>
        ${opts.mode === 'endless' ? '<div><span class="label">defused</span><b data-h="score">0</b></div>' : ''}
        <div><span class="label">accuracy</span><b data-h="acc">100%</b></div>
        <button class="hud-btn" data-h="quit" type="button">ESC quit</button>
      </div>
      <p class="bm-help">type a wire's code to cut it · <span>typos speed up the timer</span></p>
    </div>`;
  const wrap = root.querySelector<HTMLDivElement>('.bomb')!;
  const cv = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = cv.getContext('2d')!;
  const h = (k: string) => root.querySelector<HTMLElement>(`[data-h="${k}"]`);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  const resize = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  const rng: Rng = mulberry32(opts.seed);
  const byLen = new Map<number, string[]>();
  for (const w of WORDS_EN) {
    if (!byLen.has(w.length)) byLen.set(w.length, []);
    byLen.get(w.length)!.push(w);
  }

  // ---- state ----
  let level: BombLevel = opts.mode === 'endless' ? endlessLevel(1) : BOMB_LEVELS[opts.level - 1];
  let bombNo = 1;
  let wires: Wire[] = [];
  let locked: Wire | null = null;
  let timeLeft = 0;
  let timeTotal = 0;
  let rush = 0; // seconds of fast timer left
  let phase: 'arming' | 'live' | 'defused' | 'boom' | 'over' = 'arming';
  let phaseT = 1.2;
  let defused = 0;
  let correct = 0;
  let total = 0;
  let chars = 0;
  let playMs = 0;
  let shake = 0;
  let flash = 0;
  let lastSec = -1;
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];

  function newBomb(): void {
    const firsts = new Set<string>();
    wires = [];
    const colors = [...WIRE_COLORS].sort(() => rng() - 0.5);
    for (let i = 0; i < level.wires; i++) {
      let w = '';
      for (let tries = 0; tries < 40; tries++) {
        const len = level.len[0] + Math.floor(rng() * (level.len[1] - level.len[0] + 1));
        const list = byLen.get(len);
        if (!list?.length) continue;
        const cand = pick(rng, list);
        if (!firsts.has(cand[0])) {
          w = cand;
          break;
        }
      }
      if (!w) w = pick(rng, WORDS_EN.filter((x) => !firsts.has(x[0])));
      firsts.add(w[0]);
      wires.push({ word: w, typed: 0, cut: false, cutT: 0, color: colors[i % colors.length], sag: 0.3 + rng() * 0.5 });
    }
    const codeChars = wires.reduce((a, w) => a + w.word.length, 0);
    timeTotal = codeChars / ((level.wpm * 5) / 60) + 2.5 + level.wires * 0.4;
    timeLeft = timeTotal;
    rush = 0;
    locked = null;
    phase = 'arming';
    phaseT = 1.1;
    lastSec = -1;
    sfx.alarm();
  }
  newBomb();

  // ---- input ----
  function miss(exp?: string): void {
    total++;
    if (exp) recordKey(exp, false);
    rush = Math.min(6, rush + 2);
    flash = 1;
    shake = Math.max(shake, 8);
    sfx.alarm();
    wrap.classList.remove('miss');
    void wrap.offsetWidth;
    wrap.classList.add('miss');
  }

  function cutWire(w: Wire): void {
    w.cut = true;
    locked = null;
    sfx.snip();
    const g = wireGeom(wires.indexOf(w));
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      sparks.push({ x: g.mx, y: g.my, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220 - 60, life: 0.6, color: Math.random() < 0.5 ? '#ffe94a' : w.color });
    }
    if (wires.every((x) => x.cut)) {
      phase = 'defused';
      phaseT = 1.4;
      defused++;
      sfx.win();
      if (timeLeft < 1) {
        floatText = { text: 'CLOSE CALL!', life: 1.4 };
        unlock('bomb_close');
      }
    }
  }

  function onChar(ch: string): void {
    if (phase !== 'live') return;
    if (locked) {
      const exp = locked.word[locked.typed];
      if (ch === exp) {
        total++;
        correct++;
        chars++;
        recordKey(exp, true);
        sfx.key();
        locked.typed++;
        if (locked.typed >= locked.word.length) cutWire(locked);
      } else miss(exp);
      return;
    }
    const w = wires.find((x) => !x.cut && x.word[0] === ch);
    if (w) {
      total++;
      correct++;
      chars++;
      recordKey(ch, true);
      sfx.key();
      w.typed = 1;
      locked = w;
      if (w.typed >= w.word.length) cutWire(w);
    } else miss();
  }

  const offKeys = onKeys((k) => {
    if (k === 'Escape') {
      quit();
      return;
    }
    if (k === 'Backspace') {
      if (locked) {
        locked.typed = 0;
        locked = null;
      }
      return;
    }
    if (k.length !== 1 || k === ' ') return;
    onChar(k.toLowerCase());
  });
  let quitting = false;
  function quit(): void {
    if (quitting) return;
    quitting = true;
    location.hash = '#/bomb';
  }
  h('quit')!.addEventListener('click', quit);

  let floatText: { text: string; life: number } | null = null;

  function finish(win: boolean): void {
    phase = 'over';
    setTimeout(
      () =>
        onEnd({
          win,
          timeLeft: Math.max(0, timeLeft),
          defused,
          wpm: playMs > 0 ? Math.round(chars / 5 / (playMs / 60000)) : 0,
          acc: calcAcc(correct, total),
          chars,
          ms: playMs,
        }),
      win ? 300 : 900,
    );
  }

  // ---- geometry ----
  function box() {
    const bw = Math.min(W * 0.86, 820);
    const rowH = Math.min(58, (H * 0.5) / Math.max(4, level.wires));
    const bh = 176 + rowH * level.wires;
    return { x: W / 2 - bw / 2, y: Math.max(80, H * 0.5 - bh / 2), w: bw, h: bh, rowH };
  }
  function wireGeom(i: number) {
    const b = box();
    const y = b.y + 130 + i * b.rowH + b.rowH / 2;
    const x1 = b.x + 56;
    const x2 = b.x + b.w - 56;
    return { x1, x2, y, mx: (x1 + x2) / 2, my: y };
  }

  // ---- render ----
  function render(t: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shake > 0.3 && !store.settings.reducedMotion) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const danger = timeTotal ? 1 - timeLeft / timeTotal : 0;
    const bg = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, `rgba(${60 + danger * 80},10,20,1)`);
    bg.addColorStop(1, '#050002');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // rotating warning light sweep
    if (phase === 'live' && timeLeft < 6) {
      const a = t * 6;
      ctx.save();
      ctx.translate(W / 2, 0);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,40,40,0.25)');
      g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, H * 1.2, a % (Math.PI * 2), (a % (Math.PI * 2)) + 0.5);
      ctx.fill();
      ctx.restore();
    }

    const b = box();
    // casing
    ctx.fillStyle = '#16111c';
    ctx.strokeStyle = '#ff4d2e';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff4d2e';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 18);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // hazard stripes along the bottom
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(b.x, b.y + b.h - 18, b.w, 18, [0, 0, 18, 18]);
    ctx.clip();
    for (let x = b.x - 20; x < b.x + b.w + 20; x += 24) {
      ctx.fillStyle = '#ffe94a';
      ctx.beginPath();
      ctx.moveTo(x, b.y + b.h);
      ctx.lineTo(x + 12, b.y + b.h - 18);
      ctx.lineTo(x + 24, b.y + b.h - 18);
      ctx.lineTo(x + 12, b.y + b.h);
      ctx.fill();
    }
    ctx.restore();
    // rivets
    ctx.fillStyle = '#4a3f55';
    for (const [rx, ry] of [
      [b.x + 16, b.y + 16],
      [b.x + b.w - 16, b.y + 16],
      [b.x + 16, b.y + b.h - 30],
      [b.x + b.w - 16, b.y + b.h - 30],
    ]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // timer display
    const tw = Math.min(360, b.w * 0.55);
    const tx = W / 2 - tw / 2;
    const ty = b.y + 22;
    ctx.fillStyle = '#050003';
    ctx.strokeStyle = '#3a0010';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, 82, 8);
    ctx.fill();
    ctx.stroke();
    const shown = Math.max(0, timeLeft);
    const txt = `${String(Math.floor(shown / 60)).padStart(2, '0')}:${String(Math.floor(shown % 60)).padStart(2, '0')}.${Math.floor((shown % 1) * 10)}`;
    ctx.font = `900 ${Math.min(58, tw * 0.17)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,40,40,0.12)';
    ctx.fillText('88:88.8', W / 2, ty + 43);
    const blink = rush > 0 && Math.sin(t * 30) > 0;
    ctx.fillStyle = phase === 'defused' || (phase === 'over' && timeLeft > 0) ? '#39ff88' : blink ? '#ffe94a' : '#ff2b2b';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 18;
    ctx.fillText(txt, W / 2, ty + 43);
    ctx.shadowBlur = 0;
    if (rush > 0) {
      ctx.font = '800 12px "JetBrains Mono", monospace';
      ctx.fillStyle = '#ffe94a';
      ctx.fillText('▶▶ TIMER x2.5', W / 2, ty + 96);
    }
    // LEDs
    for (let i = 0; i < 2; i++) {
      const on = Math.sin(t * (timeLeft < 5 ? 14 : 5) + i * Math.PI) > 0;
      ctx.fillStyle = on ? '#ff2b2b' : '#3a0008';
      ctx.shadowColor = '#ff2b2b';
      ctx.shadowBlur = on ? 14 : 0;
      ctx.beginPath();
      ctx.arc(i ? tx + tw + 26 : tx - 26, ty + 41, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // terminal blocks
    for (const side of [0, 1]) {
      const x = side ? b.x + b.w - 50 : b.x + 22;
      ctx.fillStyle = '#2a2233';
      ctx.fillRect(x, b.y + 120, 28, b.rowH * level.wires + 20);
    }
    // wires
    wires.forEach((w, i) => {
      const g = wireGeom(i);
      const sagY = g.y + w.sag * 10;
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = w.color;
      ctx.shadowColor = w.color;
      ctx.shadowBlur = locked === w ? 18 : 6;
      if (!w.cut) {
        ctx.beginPath();
        ctx.moveTo(g.x1, g.y);
        ctx.quadraticCurveTo(g.mx, sagY + 14, g.x2, g.y);
        ctx.stroke();
      } else {
        const drop = Math.min(1, w.cutT * 3) * 26;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(g.x1, g.y);
        ctx.quadraticCurveTo(g.x1 + (g.mx - g.x1) * 0.6, g.y + drop, g.mx - 10, g.y + drop * 1.4);
        ctx.moveTo(g.x2, g.y);
        ctx.quadraticCurveTo(g.x2 - (g.x2 - g.mx) * 0.6, g.y + drop, g.mx + 10, g.y + drop * 1.4);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0;
      // code tag
      if (!w.cut) {
        ctx.font = `800 ${Math.min(26, b.rowH * 0.5)}px "JetBrains Mono", monospace`;
        const tw2 = ctx.measureText(w.word).width + 24;
        const tagH = Math.min(38, b.rowH * 0.78);
        ctx.fillStyle = locked === w ? '#2a2400' : '#0c0810';
        ctx.strokeStyle = locked === w ? '#ffe94a' : w.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(g.mx - tw2 / 2, sagY + 6 - tagH / 2, tw2, tagH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'left';
        let x = g.mx - tw2 / 2 + 12;
        for (let k = 0; k < w.word.length; k++) {
          const c = w.word[k];
          ctx.fillStyle = k < w.typed ? '#ffe94a' : '#fff';
          ctx.globalAlpha = k < w.typed ? 0.6 : 1;
          ctx.fillText(c, x, sagY + 7);
          x += ctx.measureText(c).width;
        }
        ctx.globalAlpha = 1;
      }
    });
    // sparks
    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life / 0.6);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    // state text
    ctx.textAlign = 'center';
    if (phase === 'arming') {
      ctx.font = `900 ${Math.min(54, W * 0.07)}px Orbitron, sans-serif`;
      ctx.fillStyle = '#ff2b2b';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 24;
      ctx.fillText(Math.sin(t * 16) > 0 ? '⚠ ARMED' : '', W / 2, b.y + b.h + 60);
      ctx.shadowBlur = 0;
    }
    if (phase === 'defused' || (phase === 'over' && timeLeft > 0)) {
      ctx.font = `900 ${Math.min(60, W * 0.08)}px Orbitron, sans-serif`;
      ctx.fillStyle = '#39ff88';
      ctx.shadowColor = '#39ff88';
      ctx.shadowBlur = 24;
      ctx.fillText('DEFUSED', W / 2, b.y + b.h + 60);
      ctx.shadowBlur = 0;
    }
    if (floatText) {
      ctx.font = '900 28px Orbitron, sans-serif';
      ctx.fillStyle = '#ffe94a';
      ctx.globalAlpha = Math.min(1, floatText.life);
      ctx.fillText(floatText.text, W / 2, b.y - 20);
      ctx.globalAlpha = 1;
    }
    if (flash > 0) {
      ctx.fillStyle = phase === 'boom' || (phase === 'over' && timeLeft <= 0) ? `rgba(255,240,220,${flash})` : `rgba(255,30,30,${flash * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---- loop ----
  let raf = 0;
  let last = performance.now();
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (phase === 'arming') {
      phaseT -= dt;
      if (phaseT <= 0) phase = 'live';
    } else if (phase === 'live') {
      playMs += dt * 1000;
      const speed = rush > 0 ? 2.5 : 1;
      timeLeft -= dt * speed;
      rush = Math.max(0, rush - dt);
      const sec = Math.ceil(timeLeft);
      if (sec !== lastSec) {
        lastSec = sec;
        sfx.tick(timeLeft < 5);
      }
      if (timeLeft <= 0) {
        timeLeft = 0;
        phase = 'boom';
        phaseT = 0.9;
        flash = 1.6;
        shake = 40;
        sfx.explode(true);
        sfx.hit();
        const b = box();
        for (let i = 0; i < 160; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 200 + Math.random() * 700;
          sparks.push({ x: W / 2, y: b.y + b.h / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, color: ['#ffe94a', '#ff8a2b', '#ff2b2b', '#fff'][i % 4] });
        }
      }
    } else if (phase === 'defused') {
      phaseT -= dt;
      if (phaseT <= 0) {
        if (opts.mode === 'endless') {
          bombNo++;
          level = endlessLevel(bombNo);
          const s = h('score');
          if (s) s.textContent = String(defused);
          h('lvl')!.textContent = String(bombNo);
          newBomb();
        } else {
          finish(true);
        }
      }
    } else if (phase === 'boom') {
      phaseT -= dt;
      if (phaseT <= 0) finish(false);
    }
    for (const w of wires) if (w.cut) w.cutT += dt;
    for (const s of sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 300 * dt;
      s.vx *= 0.97;
      s.life -= dt;
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
    shake *= 0.88;
    flash = Math.max(0, flash - dt * 2);
    if (floatText) {
      floatText.life -= dt;
      if (floatText.life <= 0) floatText = null;
    }
    h('acc')!.textContent = `${calcAcc(correct, total)}%`;
    render(t);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      offKeys();
      window.removeEventListener('resize', resize);
    },
  };
}
