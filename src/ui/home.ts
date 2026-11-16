// Home: a neon arcade-cabinet claw machine holding the 5 game crates.
// A/D move, S drop, W pull up, T tornado. Grab a crate -> it opens -> game.
import '../styles/cabinet.css';
import type { Screen } from '../router';
import { navigate } from '../router';
import { store } from '../core/storage';
import { sfx } from '../core/audio';
import { createMachine } from './claw/machine';
import { createBackground } from './claw/background';
import { createDrawer } from './claw/drawer';
import { clawState } from './claw/state';
import { CRATES, crateById, type CrateDef } from './claw/crates';
import { playOpening, playClosing, revealPage } from './claw/openings';

export const homeScreen: Screen = (root) => {
  root.innerHTML = `
    <div class="arcade">
      <canvas class="arcade-bg" aria-hidden="true"></canvas>
      <div class="cabinet">
        <div class="cab-marquee">
          <div class="bulbs" aria-hidden="true"></div>
          <h1 class="marquee-text" data-text="GLITCH_TYPE">GLITCH_TYPE</h1>
          <p class="marquee-sub">typing arcade · grab a crate to play</p>
          <div class="bulbs" aria-hidden="true"></div>
        </div>
        <div class="cab-screen">
          <div class="glass">
            <canvas class="machine" aria-label="Claw machine with 5 game crates"></canvas>
            <div class="glass-shine" aria-hidden="true"></div>
          </div>
        </div>
        <div class="cab-panel">
          <div class="ctl ctl-joy">
            <div class="joy-row">
              <button class="joy-btn" data-dir="-1" type="button" aria-label="Move claw left">◀</button>
              <div class="joystick" aria-hidden="true"><div class="stick"><div class="knob"></div></div></div>
              <button class="joy-btn" data-dir="1" type="button" aria-label="Move claw right">▶</button>
            </div>
            <span class="cap"><b>A</b> <b>D</b> move</span>
          </div>
          <div class="ctl">
            <button class="big-btn drop" type="button" aria-label="Drop the claw"><span>DROP</span></button>
            <span class="cap"><b>S</b> drop · <b>W</b> up</span>
          </div>
          <div class="ctl">
            <button class="big-btn tornado" type="button" aria-label="Tornado: shuffle the crates"><span>🌪</span></button>
            <span class="cap"><b>T</b> tornado</span>
          </div>
        </div>
        <div class="cab-base"><span class="coin">INSERT KEYS ▸ <i></i></span><span class="grill" aria-hidden="true"></span></div>
      </div>
      <nav class="sr-only" aria-label="Games">
        ${CRATES.map((c) => `<a href="#${c.route}">${c.label}</a>`).join('')}
      </nav>
    </div>`;

  const arcade = root.querySelector<HTMLDivElement>('.arcade')!;
  const bgCanvas = root.querySelector<HTMLCanvasElement>('.arcade-bg')!;
  const machineCanvas = root.querySelector<HTMLCanvasElement>('.machine')!;
  const stick = root.querySelector<HTMLDivElement>('.stick')!;
  const dropBtn = root.querySelector<HTMLButtonElement>('.drop')!;
  const tornadoBtn = root.querySelector<HTMLButtonElement>('.tornado')!;
  const cabinet = root.querySelector<HTMLDivElement>('.cabinet')!;

  const bg = createBackground(bgCanvas);
  const drawer = createDrawer(arcade);
  let busy = false; // during opening / closing animations

  const machine = createMachine(machineCanvas, {
    onLifted: (def) => void openCrate(def),
    onMiss: () => shake(),
    onThud: (v) => {
      sfx.thud();
      if (v > 14) shake();
    },
  });

  // ---- returning from a game? the crate comes back in the claw ----
  const returning = crateById(clawState.opened);
  machine.initialLayout(returning?.id ?? null);
  if (returning) {
    busy = true;
    machine.hold(returning.id);
  }

  function shake(): void {
    if (store.settings.reducedMotion) return;
    cabinet.classList.remove('shake');
    void cabinet.offsetWidth;
    cabinet.classList.add('shake');
  }

  async function openCrate(def: CrateDef): Promise<void> {
    busy = true;
    const rect = machine.heldRect();
    if (!rect) return;
    clawState.opened = def.id;
    machine.savePile();
    await playOpening(def, rect, store.settings.reducedMotion);
    const onRouted = () => {
      window.removeEventListener('glitch:routed', onRouted);
      void revealPage();
    };
    window.addEventListener('glitch:routed', onRouted);
    navigate(def.route);
  }

  // ---- controls ----
  const held = new Set<string>();
  const LEFT = new Set(['KeyA', 'ArrowLeft']);
  const RIGHT = new Set(['KeyD', 'ArrowRight']);
  const DROP = new Set(['KeyS', 'ArrowDown', 'Space', 'Enter', 'NumpadEnter']);
  const LIFT = new Set(['KeyW', 'ArrowUp']);

  let pointerDir = 0;
  function syncDir(): void {
    const keyDir = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    const dir = busy || drawer.isOpen() ? 0 : keyDir || pointerDir;
    machine.setDir(dir);
    stick.style.setProperty('--tilt', `${dir * 22}deg`);
  }

  function pressVisual(btn: HTMLButtonElement): void {
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 160);
  }

  function doDrop(): void {
    if (busy || drawer.isOpen()) return;
    pressVisual(dropBtn);
    machine.drop();
  }

  function doTornado(): void {
    if (busy || drawer.isOpen()) return;
    pressVisual(tornadoBtn);
    if (machine.startTornado()) shake();
  }

  const onDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code;
    if (c === 'Escape' && drawer.isOpen()) {
      drawer.toggle(false);
      return;
    }
    const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON' || (e.target as HTMLElement | null)?.tagName === 'A';
    if (LEFT.has(c) || RIGHT.has(c)) {
      e.preventDefault();
      held.add(LEFT.has(c) ? 'left' : 'right');
      syncDir();
    } else if (DROP.has(c)) {
      if (onButton && c !== 'KeyS' && c !== 'ArrowDown') return; // Space/Enter activate focused buttons
      e.preventDefault();
      if (!e.repeat) doDrop();
    } else if (LIFT.has(c)) {
      e.preventDefault();
      if (!busy) machine.cancel();
    } else if (c === 'KeyT') {
      if (!e.repeat) doTornado();
    }
  };
  const onUp = (e: KeyboardEvent) => {
    if (LEFT.has(e.code)) held.delete('left');
    if (RIGHT.has(e.code)) held.delete('right');
    syncDir();
  };
  const onBlur = () => {
    held.clear();
    pointerDir = 0;
    syncDir();
  };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  dropBtn.addEventListener('click', doDrop);
  tornadoBtn.addEventListener('click', doTornado);
  root.querySelectorAll<HTMLButtonElement>('.joy-btn').forEach((b) => {
    const dir = Number(b.dataset.dir);
    const start = (e: PointerEvent) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      pointerDir = dir;
      syncDir();
    };
    const end = () => {
      pointerDir = 0;
      syncDir();
    };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    b.addEventListener('lostpointercapture', end);
  });

  const onResize = () => {
    bg.resize();
    machine.resize();
  };
  window.addEventListener('resize', onResize);

  // ---- loop ----
  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = now - last;
    last = now;
    syncDir();
    bg.draw(now / 1000);
    machine.frame(dt, now / 1000);
  };
  raf = requestAnimationFrame(frame);

  // closing animation for the returning crate (after the first frame placed it)
  if (returning) {
    requestAnimationFrame(async () => {
      const rect = machine.heldRect();
      if (rect) await playClosing(returning, rect, store.settings.reducedMotion);
      clawState.opened = null;
      machine.releaseHeld();
      busy = false;
    });
  }

  return () => {
    cancelAnimationFrame(raf);
    if (!busy) machine.savePile();
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onResize);
    drawer.destroy();
    machine.destroy();
  };
};
