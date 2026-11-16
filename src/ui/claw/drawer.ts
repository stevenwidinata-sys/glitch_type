// ☰ slide-in menu with the non-game pages.
import { store, save } from '../../core/storage';
import { streak } from '../../core/stats';
import { sfx } from '../../core/audio';

const LINKS = [
  { href: '#/lessons', icon: '✎', label: 'Lessons', sub: 'finger guide drills' },
  { href: '#/daily', icon: '☀', label: 'Daily Challenge', sub: 'same seed for everyone' },
  { href: '#/stats', icon: '▤', label: 'Stats', sub: 'wpm, heatmap, achievements' },
  { href: '#/settings', icon: '⚙', label: 'Settings', sub: 'sound, motion, language' },
];

export function createDrawer(host: HTMLElement): { toggle(open?: boolean): void; isOpen(): boolean; destroy(): void } {
  const btn = document.createElement('button');
  btn.className = 'menu-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Open menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span></span><span></span><span></span>';

  const scrim = document.createElement('div');
  scrim.className = 'drawer-scrim';

  const panel = document.createElement('nav');
  panel.className = 'drawer';
  panel.setAttribute('aria-label', 'Menu');
  panel.innerHTML = `
    <div class="drawer-head">
      <span class="tag">GT</span><b>glitch_type</b>
      <button class="drawer-x" type="button" aria-label="Close menu">✕</button>
    </div>
    <div class="drawer-streak">🔥 <b>${streak()}</b> day streak</div>
    <div class="drawer-links">
      ${LINKS.map((l) => `<a href="${l.href}"><i>${l.icon}</i><span>${l.label}<small>${l.sub}</small></span></a>`).join('')}
    </div>
    <button class="drawer-sound" type="button"></button>
    <p class="drawer-foot">no login · no tracking · progress saved in this browser</p>`;

  host.append(btn, scrim, panel);
  const soundBtn = panel.querySelector<HTMLButtonElement>('.drawer-sound')!;
  const paintSound = () => (soundBtn.innerHTML = `♪ Sound <b>${store.settings.sound ? 'ON' : 'OFF'}</b>`);
  paintSound();

  let open = false;
  const toggle = (v = !open) => {
    open = v;
    panel.classList.toggle('open', open);
    scrim.classList.toggle('open', open);
    btn.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) sfx.key();
  };

  btn.addEventListener('click', () => toggle());
  scrim.addEventListener('click', () => toggle(false));
  panel.querySelector('.drawer-x')!.addEventListener('click', () => toggle(false));
  soundBtn.addEventListener('click', () => {
    store.settings.sound = !store.settings.sound;
    save();
    paintSound();
    sfx.key();
  });

  return {
    toggle,
    isOpen: () => open,
    destroy() {
      btn.remove();
      scrim.remove();
      panel.remove();
    },
  };
}
