import '../styles/game.css';
import '../styles/pages.css';
import type { Screen } from '../router';
import { store, todayKey } from '../core/storage';
import { hashString } from '../core/rng';

export function dailySeed(date: string, kind: 'bh' | 'rp'): number {
  return hashString(`glitch_type:${date}:${kind}`) % 2147483647;
}

export const dailyScreen: Screen = (root) => {
  const today = todayKey();
  const lang = store.settings.lang;
  const bh = store.daily[`${today}-bh`];
  const rp = store.daily[`${today}-rp`];
  const d = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() - (6 - i));
    const key = todayKey(x);
    const done = store.daily[`${key}-bh`] !== undefined || store.daily[`${key}-rp`] !== undefined;
    return { key, done, label: x.toLocaleDateString(undefined, { weekday: 'short' }), day: x.getDate() };
  });

  root.innerHTML = `
    <div class="page">
      <div class="page-head">
        <a class="back" href="#/">← claw machine</a>
        <div>
          <h1 class="page-title glitch" data-text="DAILY CHALLENGE">DAILY CHALLENGE</h1>
          <p class="page-sub">// same seed for everyone on earth today. compare scores with friends.</p>
        </div>
      </div>
      <div class="daily-date">${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }).toUpperCase()}</div>
      <p class="countdown">next challenge in <b data-cd>--:--:--</b></p>
      <div class="setup-grid">
        <a class="mode-card" style="--c:var(--pink)" href="#/blackhole/play?mode=endless&seed=${dailySeed(today, 'bh')}&lang=${lang}&daily=${today}">
          <span class="label">daily · arcade</span>
          <h3>BLACK HOLE RUN</h3>
          <p>Today's seeded endless run. Same rocks, same order, for everyone.</p>
          <div class="best">${bh !== undefined ? `TODAY'S BEST: ${bh} pts` : 'NOT PLAYED YET'}</div>
          <span class="big">☄</span>
        </a>
        <a class="mode-card" style="--c:var(--cyan)" href="#/repair/play?src=common&rule=timed&t=60&seed=${dailySeed(today, 'rp')}&lang=${lang}&daily=${today}">
          <span class="label">daily · typing test</span>
          <h3>60s REPAIR</h3>
          <p>Today's seeded 60 second common-words test. Your score is your WPM.</p>
          <div class="best">${rp !== undefined ? `TODAY'S BEST: ${rp} wpm` : 'NOT PLAYED YET'}</div>
          <span class="big">60</span>
        </a>
      </div>
      <div class="panel" style="margin-top:22px">
        <h2 class="section-title">THIS WEEK</h2>
        <div class="week">${days
          .map((x) => `<div class="${x.done ? 'done' : ''} ${x.key === today ? 'today' : ''}">${x.label}<b>${x.done ? '✓' : x.day}</b></div>`)
          .join('')}</div>
      </div>
    </div>`;

  const cd = root.querySelector<HTMLElement>('[data-cd]')!;
  const tick = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    cd.textContent = `${hh}:${mm}:${ss}`;
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
};
