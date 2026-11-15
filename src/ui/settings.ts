import '../styles/game.css';
import '../styles/pages.css';
import type { Screen } from '../router';
import { store, save, resetAll, type Lang } from '../core/storage';
import { sfx } from '../core/audio';
import { toast } from './toast';

export const settingsScreen: Screen = (root) => {
  const s = store.settings;
  root.innerHTML = `
    <div class="page" style="max-width:760px">
      <div class="page-head">
        <a class="back" href="#/">← claw machine</a>
        <div>
          <h1 class="page-title glitch" data-text="SETTINGS">SETTINGS</h1>
          <p class="page-sub">// saved in this browser only</p>
        </div>
      </div>
      <div class="panel">
        <div class="set-row">
          <div><h4>SOUND</h4><p>Lasers, explosions, key clicks. All synthesized live.</p></div>
          <div class="seg" data-k="sound"><button data-v="1" aria-pressed="${s.sound}">On</button><button data-v="0" aria-pressed="${!s.sound}">Off</button></div>
        </div>
        <div class="set-row">
          <div><h4>VOLUME</h4><p>Master volume for all effects.</p></div>
          <input type="range" min="0" max="1" step="0.05" value="${s.volume}" aria-label="Volume" />
        </div>
        <div class="set-row">
          <div><h4>REDUCED MOTION</h4><p>Turns off screen shake and glitch flashes.</p></div>
          <div class="seg" data-k="motion"><button data-v="1" aria-pressed="${s.reducedMotion}">On</button><button data-v="0" aria-pressed="${!s.reducedMotion}">Off</button></div>
        </div>
        <div class="set-row">
          <div><h4>LANGUAGE</h4><p>Default word pack for games and lessons.</p></div>
          <div class="seg" data-k="lang"><button data-v="en" aria-pressed="${s.lang === 'en'}">English</button><button data-v="id" aria-pressed="${s.lang === 'id'}">Bahasa Indonesia</button></div>
        </div>
        <div class="set-row">
          <div><h4>RESET PROGRESS</h4><p>Deletes your stats, bests, achievements and campaign progress on this device.</p></div>
          <button class="btn danger ghost" data-reset type="button">Reset data</button>
        </div>
      </div>
      <p class="page-sub" style="margin-top:22px;text-align:center">glitch_type v1.0 · no login · no tracking · made for fast fingers</p>
    </div>`;

  root.querySelectorAll<HTMLDivElement>('.seg').forEach((seg) =>
    seg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const v = b.dataset.v!;
      if (seg.dataset.k === 'sound') s.sound = v === '1';
      if (seg.dataset.k === 'motion') s.reducedMotion = v === '1';
      if (seg.dataset.k === 'lang') s.lang = v as Lang;
      save();
      window.dispatchEvent(new Event('glitch:settings'));
      sfx.key();
    }),
  );

  const range = root.querySelector<HTMLInputElement>('input[type="range"]')!;
  range.addEventListener('input', () => {
    s.volume = Number(range.value);
    save();
  });
  range.addEventListener('change', () => sfx.laser());

  const reset = root.querySelector<HTMLButtonElement>('[data-reset]')!;
  let armed = false;
  let timer = 0;
  reset.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      reset.textContent = 'Click again to confirm';
      reset.classList.remove('ghost');
      timer = window.setTimeout(() => {
        armed = false;
        reset.textContent = 'Reset data';
        reset.classList.add('ghost');
      }, 3000);
      return;
    }
    clearTimeout(timer);
    resetAll();
    sfx.explode(true);
    toast('DATA WIPED', 'Fresh start. Go break some records.', '☢');
    armed = false;
    reset.textContent = 'Reset data';
    reset.classList.add('ghost');
  });
  return () => clearTimeout(timer);
};
