// Neon Racer: your car drives as fast as you type.
import '../../styles/racer.css';
import { mulberry32 } from '../../core/rng';
import { onKeys } from '../../core/input';
import { sfx, createEngine } from '../../core/audio';
import { store } from '../../core/storage';
import { recordKey, calcAcc } from '../../core/stats';
import { TypingText } from '../../ui/typing-text';
import { buildTrack, createRoad, SEG_LEN, type CarSprite } from './road';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface RacerConfig {
  passageId: string;
  text: string;
  title: string;
  difficulty: Difficulty;
  ghost: boolean;
  seed: number;
}

export interface RacerResult {
  place: number; // 1..4
  ms: number;
  wpm: number;
  acc: number;
  chars: number;
  ghostDelta: number | null; // ms, negative = faster than ghost
  newGhost: boolean;
}

const RIVAL_WPM: Record<Difficulty, number[]> = {
  easy: [25, 35, 45],
  normal: [40, 55, 70],
  hard: [60, 80, 100],
};
const RIVALS = [
  { name: 'VOLT', color: '#00f0ff', lane: -0.62 },
  { name: 'NOVA', color: '#ffe94a', lane: 0.62 },
  { name: 'RAZOR', color: '#39ff88', lane: -0.25 },
];
const ORD = ['1ST', '2ND', '3RD', '4TH'];
/** camera distance behind the player's car (puts the car just above the dashboard) */
const CAM_BEHIND = 7 * SEG_LEN;

export function runRacer(root: HTMLElement, cfg: RacerConfig, onEnd: (r: RacerResult) => void): { destroy(): void } {
  root.innerHTML = `
    <div class="racer">
      <canvas class="rc-road"></canvas>
      <div class="rc-hud">
        <div class="rc-place"><b data-h="place">-</b><span>/4</span></div>
        <div class="rc-map" data-h="map"></div>
        <button class="hud-btn" data-h="quit" type="button">ESC quit</button>
      </div>
      <div class="rc-lights" data-h="lights"><i></i><i></i><i></i><span></span></div>
      <div class="rc-dash">
        <div class="rc-gauge">
          <svg viewBox="0 0 120 70" aria-hidden="true">
            <path d="M10 64 A50 50 0 0 1 110 64" class="rc-arc-bg" />
            <path d="M10 64 A50 50 0 0 1 110 64" class="rc-arc" data-h="arc" pathLength="100" />
          </svg>
          <b data-h="kmh">0</b><span>km/h</span>
        </div>
        <div class="rc-text">
          <div class="rc-title">${cfg.title} <span>· ${cfg.difficulty.toUpperCase()}</span></div>
          <div data-h="tt"></div>
        </div>
        <div class="rc-stats">
          <div><span class="label">wpm</span><b data-h="wpm">0</b></div>
          <div><span class="label">acc</span><b data-h="acc">100%</b></div>
          <div><span class="label">time</span><b data-h="time">0.0</b></div>
        </div>
      </div>
    </div>`;

  const h = (k: string) => root.querySelector<HTMLElement>(`[data-h="${k}"]`)!;
  const wrap = root.querySelector<HTMLDivElement>('.racer')!;
  const canvas = root.querySelector<HTMLCanvasElement>('.rc-road')!;
  const rng = mulberry32(cfg.seed);
  const total = cfg.text.length;

  // track: start line, race distance, then extra road past the finish
  const raceSegs = Math.max(160, Math.round(total * 1.2));
  const startZ = 20 * SEG_LEN;
  const finishZ = startZ + raceSegs * SEG_LEN;
  const track = buildTrack(rng, 20 + raceSegs + 200);
  const road = createRoad(canvas, track);
  const onResize = () => {
    road.resize();
    tt.relayout();
  };
  window.addEventListener('resize', onResize);

  // ---- state ----
  type Phase = 'countdown' | 'race' | 'done';
  let phase: Phase = 'countdown';
  let countdown = 3.2;
  let raceMs = 0;
  let passed = 0; // chars passed by the player
  let bestPassed = 0;
  const rec: number[] = []; // ms when each char was first reached (ghost recording)
  let camZ = startZ - CAM_BEHIND;
  let speed = 0;
  let skid = 0;
  let playerDoneMs = 0;

  const rivals = RIVALS.map((r, i) => ({
    ...r,
    cps: (RIVAL_WPM[cfg.difficulty][i] * 5) / 60,
    chars: 0,
    phase: rng() * 6,
    phase2: rng() * 6,
    stall: 0,
    doneMs: 0,
  }));

  const savedGhost = cfg.ghost ? store.ghosts[cfg.passageId] : undefined;
  const ghost = savedGhost && savedGhost.length === total ? savedGhost : null;
  const ghostChars = (ms: number) => {
    if (!ghost) return 0;
    let lo = 0;
    let hi = ghost.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ghost[mid] <= ms) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  // ---- typing ----
  const tt = new TypingText(cfg.text.split(' '), {
    onKey(expected, _typed, ok) {
      if (expected && expected !== ' ') recordKey(expected, ok);
      if (ok) sfx.key();
      else sfx.error();
      updatePassed();
    },
    onWord(_i, ok) {
      if (!ok) {
        skid = 1;
        sfx.skid();
      }
      updatePassed();
    },
    onDone() {
      updatePassed();
    },
  });
  h('tt').append(tt.el);
  document.fonts?.ready.then(() => tt.relayout());

  function updatePassed(): void {
    let p = 0;
    for (let i = 0; i < tt.index; i++) p += tt.words[i].length + 1;
    const cur = tt.words[tt.index] ?? '';
    let k = 0;
    while (k < tt.typed.length && k < cur.length && tt.typed[k] === cur[k]) k++;
    p += k;
    if (tt.finished) p = total;
    passed = Math.min(total, p);
    if (phase === 'race') {
      while (bestPassed < passed) rec[bestPassed++] = Math.round(raceMs);
      if (passed >= total && !playerDoneMs) finishPlayer();
    }
  }

  const engine = createEngine();

  const offKeys = onKeys((k) => {
    if (k === 'Escape') {
      quit();
      return;
    }
    if (phase !== 'race') return;
    if (k === 'Enter') return;
    tt.handleKey(k);
  });
  h('quit').addEventListener('click', () => quit());
  let quitting = false;
  function quit(): void {
    if (quitting) return;
    quitting = true;
    location.hash = '#/racer';
  }

  // ---- mini map ----
  const dots = [
    { el: document.createElement('i'), color: '#ff2bd6', label: 'YOU' },
    ...rivals.map((r) => ({ el: document.createElement('i'), color: r.color, label: r.name })),
    ...(ghost ? [{ el: document.createElement('i'), color: 'rgba(220,240,255,0.6)', label: 'GHOST' }] : []),
  ];
  for (const d of dots) {
    d.el.style.background = d.color;
    d.el.title = d.label;
    h('map').append(d.el);
  }

  function finishPlayer(): void {
    playerDoneMs = raceMs;
    phase = 'done';
    const place = 1 + rivals.filter((r) => r.doneMs && r.doneMs < playerDoneMs).length;
    banner(place === 1 ? 'YOU WIN!' : `${ORD[place - 1]} PLACE`);
    if (place === 1) sfx.win();
    else sfx.power();
    setTimeout(() => end(place), 1800);
  }

  function banner(text: string): void {
    const b = document.createElement('div');
    b.className = 'banner';
    b.textContent = text;
    wrap.append(b);
    setTimeout(() => b.remove(), 1700);
  }

  let ended = false;
  function end(place: number): void {
    if (ended) return;
    ended = true;
    const ms = playerDoneMs;
    const wpm = Math.round(tt.correctChars / 5 / (ms / 60000));
    const acc = calcAcc(tt.correctKeystrokes, tt.keystrokes);
    const prevBest = store.ghosts[cfg.passageId];
    const prevMs = prevBest && prevBest.length === total ? prevBest[prevBest.length - 1] : Infinity;
    const newGhost = ms < prevMs;
    if (newGhost) store.ghosts[cfg.passageId] = rec.slice(0, total);
    onEnd({
      place,
      ms,
      wpm,
      acc,
      chars: tt.correctChars,
      ghostDelta: ghost ? ms - ghost[ghost.length - 1] : null,
      newGhost,
    });
  }

  // ---- loop ----
  let raf = 0;
  let last = performance.now();
  let lastLight = 4;
  const lights = h('lights');

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    if (phase === 'countdown') {
      countdown -= dt;
      const n = Math.ceil(countdown);
      if (n !== lastLight && n >= 0) {
        lastLight = n;
        lights.className = `rc-lights on-${Math.max(0, 3 - n)}`;
        if (n > 0 && n <= 3) sfx.beep(false);
      }
      if (countdown <= 0) {
        phase = 'race';
        lights.className = 'rc-lights go';
        lights.querySelector('span')!.textContent = 'GO!';
        sfx.beep(true);
        setTimeout(() => lights.classList.add('hide'), 700);
      }
    } else {
      raceMs += dt * 1000;
    }

    // rivals keep racing even after you finish
    if (phase !== 'countdown') {
      for (const r of rivals) {
        if (r.doneMs) continue;
        if (r.stall > 0) {
          r.stall -= dt;
        } else {
          const m = 1 + 0.12 * Math.sin(t * 0.7 + r.phase) + 0.06 * Math.sin(t * 2.3 + r.phase2);
          r.chars += r.cps * m * dt;
          if (Math.random() < dt * 0.15) r.stall = 0.25 + Math.random() * 0.4; // a typo
        }
        if (r.chars >= total) {
          r.chars = total;
          r.doneMs = raceMs;
        }
      }
    }

    // camera follows the player smoothly
    const targetZ = startZ + (passed / total) * (finishZ - startZ) - CAM_BEHIND;
    const prevZ = camZ;
    camZ += (targetZ - camZ) * Math.min(1, dt * 5);
    const v = (camZ - prevZ) / Math.max(dt, 0.001); // world units / s
    speed += (Math.min(1, v / 2600) - speed) * Math.min(1, dt * 4);
    skid = Math.max(0, skid - dt * 1.6);
    engine.set(phase === 'countdown' ? 0.05 : speed);

    const zOf = (chars: number) => startZ + (chars / total) * (finishZ - startZ);
    const cars: CarSprite[] = rivals.map((r) => ({ z: zOf(r.chars), lane: r.lane, color: r.color, name: r.name, brake: r.stall > 0 }));
    if (ghost) cars.push({ z: zOf(ghostChars(raceMs)), lane: 0.28, color: '#c8f4ff', name: 'GHOST', ghost: true });
    cars.push({ z: camZ + CAM_BEHIND, lane: 0, color: '#ff2bd6', player: true, skid });
    road.draw({ camZ, speed, cars, startZ, finishZ, t });

    // hud
    const place = 1 + rivals.filter((r) => (r.doneMs && (!playerDoneMs || r.doneMs < playerDoneMs)) || (!playerDoneMs && r.chars > passed)).length;
    h('place').textContent = phase === 'countdown' ? '-' : ORD[place - 1].replace(/[A-Z]+/, '');
    h('place').dataset.p = String(place);
    const liveWpm = raceMs > 1500 ? Math.round(tt.correctChars / 5 / (raceMs / 60000)) : 0;
    h('wpm').textContent = String(liveWpm);
    h('acc').textContent = `${calcAcc(tt.correctKeystrokes, tt.keystrokes)}%`;
    h('time').textContent = ((playerDoneMs || raceMs) / 1000).toFixed(1);
    const kmh = Math.round(speed * 320);
    h('kmh').textContent = String(kmh);
    h('arc').style.strokeDashoffset = String(100 - speed * 100);
    const prog = [passed, ...rivals.map((r) => r.chars), ...(ghost ? [ghostChars(raceMs)] : [])];
    dots.forEach((d, i) => (d.el.style.left = `${(prog[i] / total) * 100}%`));
    wrap.classList.toggle('skidding', skid > 0.2);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      offKeys();
      engine.stop();
      window.removeEventListener('resize', onResize);
    },
  };
}
