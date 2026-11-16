import '../styles/game.css';
import '../styles/boss.css';
import type { Screen } from '../router';
import { navigate } from '../router';
import { store, save } from '../core/storage';
import { randomSeed } from '../core/rng';
import { parsePlayParams } from '../core/params';
import { recordRun } from '../core/stats';
import { unlock } from '../core/achievements';
import { BOSSES } from '../games/boss/bosses';
import { runDuel, type DuelResult } from '../games/boss/duel';
import { renderCrateMenu } from './crate-menu';
import { showResults } from './results';
import { guardKeyboard } from './mobile-notice';

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export const bossScreen: Screen = (root) => {
  const unlocked = Math.min(5, store.boss.unlocked);
  const cards = BOSSES.map((b) => {
    const best = store.boss.best[b.n];
    const locked = b.n > unlocked;
    return `<button class="boss-card" style="--bc:${b.color}" data-b="${b.n}" type="button" ${locked ? 'disabled' : ''}>
      <canvas width="300" height="180" data-c="${b.n}"></canvas>
      <b>${locked ? '???' : b.name}</b>
      <small>${locked ? 'locked' : b.title}</small>
      <small class="${best ? 'done' : ''}">${best ? `★ beaten in ${fmt(best)}` : locked ? '' : 'not beaten yet'}</small>
    </button>`;
  }).join('');

  const off = renderCrateMenu(root, {
    id: 'boss',
    tagline: 'type attack words to hit the boss. type the red BLOCK word before its attack lands.',
    options: `<div style="grid-column:1/-1"><span class="label">choose your opponent</span><div class="boss-grid">${cards}</div></div>`,
    extra: `<p class="cr-help"><b>Attack</b>: type the word under ATTACK. Clean words (no mistakes) and combos hit harder.<br>
      <b>Block</b>: when the boss charges, a red BLOCK word appears with a timer. Typing switches to it automatically.<br>
      Golem and Kernel raise shields you must <b>break</b>. The Hydra has 3 heads: type the first letter of a head's word to target it.
      <span class="kbd">Backspace</span> drops your current target. English only.</p>`,
    bests: [{ label: 'bosses beaten', value: `${Object.keys(store.boss.best).length}/5` }],
    startLabel: `Fight ${BOSSES[unlocked - 1].name}`,
    onStart: () => navigate(`/boss/play?b=${unlocked}`),
  });

  // little live portraits
  const canvases = root.querySelectorAll<HTMLCanvasElement>('canvas[data-c]');
  let raf = 0;
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw);
    canvases.forEach((c) => {
      const b = BOSSES[Number(c.dataset.c) - 1];
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      if (b.n > unlocked) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '900 70px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', 150, 115);
        return;
      }
      b.draw(ctx, 150, 100, 170, { t: now / 1000, hurt: 0, windup: 0, shield: false, heads: [true, true, true], dying: 0, offsetX: 0 });
    });
  };
  raf = requestAnimationFrame(draw);
  root.querySelectorAll<HTMLButtonElement>('.boss-card').forEach((btn) =>
    btn.addEventListener('click', () => navigate(`/boss/play?b=${btn.dataset.b}`)),
  );
  return () => {
    cancelAnimationFrame(raf);
    off();
  };
};

export const bossPlayScreen: Screen = (root, params) => {
  const n = Math.max(1, Math.min(5, Number(params.get('b')) || 1));
  const { seed: fixedSeed, beat } = parsePlayParams(params);
  if (n > store.boss.unlocked && fixedSeed === null) {
    navigate('/boss');
    return;
  }
  const def = BOSSES[n - 1];
  let game: { destroy(): void } | null = null;
  let closeResults: (() => void) | null = null;
  let alive = true; // results that arrive after leaving the screen are ignored

  const start = () => {
    game?.destroy();
    const seed = fixedSeed ?? randomSeed();
    game = runDuel(root, n, seed, (r) => end(r, seed));
  };

  const end = (r: DuelResult, seed: number) => {
    if (!alive) return;
    if (r.chars > 0) recordRun({ mode: 'boss', wpm: r.wpm, acc: r.acc, score: r.win ? Math.round(r.ms) : 0, chars: r.chars, lang: 'en' });
    let isBest = false;
    if (r.win) {
      const prev = store.boss.best[n];
      isBest = !prev || r.ms < prev;
      if (isBest) store.boss.best[n] = Math.round(r.ms);
      store.boss.unlocked = Math.max(store.boss.unlocked, Math.min(5, n + 1));
      save();
      unlock('boss_first');
      if (n === 5) unlock('boss_kernel');
    }
    const secs = Math.round(r.ms / 100) / 10;
    closeResults = showResults({
      win: r.win,
      title: r.win ? `${def.name} DEFEATED` : 'YOU WERE DELETED',
      subtitle: `boss ${n} · ${def.title}`,
      stats: [
        { label: 'time', value: r.win ? `${secs}s` : '-', hl: true },
        { label: 'wpm', value: String(r.wpm) },
        { label: 'accuracy', value: `${r.acc}%` },
        { label: 'blocks', value: `${r.blocks}/${r.blocks + r.blocksFailed}` },
        { label: 'max combo', value: String(r.maxCombo) },
        { label: 'hp left', value: String(r.hpLeft) },
      ],
      isBest: isBest && r.win,
      beat,
      score: r.win ? Math.max(1, Math.round(1000000 / Math.max(1, r.ms))) : 0,
      unit: 'pts',
      challenge: r.win
        ? { r: '/boss/play', q: `b=${n}&seed=${seed}`, s: Math.max(1, Math.round(1000000 / Math.max(1, r.ms))), u: 'pts', n: `BOSS DUEL · ${def.name}` }
        : undefined,
      onRetry: start,
      onNext: r.win && n < 5 && fixedSeed === null ? () => navigate(`/boss/play?b=${n + 1}`) : undefined,
      nextLabel: 'Next boss',
      backHref: '/boss',
    });
  };

  if (guardKeyboard(root, start)) start();
  return () => {
    alive = false;
    game?.destroy();
    closeResults?.();
  };
};
