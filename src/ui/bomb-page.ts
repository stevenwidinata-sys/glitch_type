import '../styles/game.css';
import '../styles/bomb.css';
import type { Screen } from '../router';
import { navigate } from '../router';
import { store, save } from '../core/storage';
import { randomSeed } from '../core/rng';
import { parsePlayParams } from '../core/params';
import { recordRun, submitBest } from '../core/stats';
import { unlock } from '../core/achievements';
import { runBomb, BOMB_LEVELS, type BombResult } from '../games/bomb/bomb';
import { renderCrateMenu, seg, optRow, bindSegs } from './crate-menu';
import { showResults } from './results';
import { guardKeyboard } from './mobile-notice';

const menu = { mode: 'levels' as 'levels' | 'endless' };

export const bombScreen: Screen = (root) => {
  const unlocked = Math.min(12, store.bomb.unlocked);
  const grid = `<span class="label">bomb levels</span><div class="levels">${BOMB_LEVELS.map((l) => {
    const best = store.bomb.best[l.n];
    const locked = l.n > unlocked;
    const sub = best !== undefined ? `${best.toFixed(1)}s` : locked ? '' : `${l.wires} wires`;
    return `<button class="lvl" data-l="${l.n}" type="button" ${locked ? 'disabled' : ''} title="${l.wires} wires">${locked ? '🔒' : l.n}<small>${sub}</small></button>`;
  }).join('')}</div>`;

  const off = renderCrateMenu(root, {
    id: 'bomb',
    tagline: 'every wire has a code word. type it to cut the wire. cut them all before zero.',
    options: optRow('mode', seg('mode', [['levels', '12 Levels'], ['endless', 'Endless']], menu.mode)),
    extra:
      grid +
      `<div style="height:18px"></div><p class="cr-help"><b>Cutting</b>: type the first letter of a wire's code to grab it, then finish the word. <span class="kbd">Backspace</span> lets go.<br>
      <b>Typos</b> make the timer run 2.5x faster for 2 seconds, so stay accurate.<br>
      <b>Endless</b>: bombs keep coming and get harder. One explosion ends the run. English only.</p>`,
    bests: [
      { label: 'levels cleared', value: `${Object.keys(store.bomb.best).length}/12` },
      { label: 'endless best', value: `${store.bests['bomb-endless'] ?? 0} bombs` },
    ],
    startLabel: 'Arm the bomb',
    onStart: () => navigate(menu.mode === 'endless' ? '/bomb/play?m=endless' : `/bomb/play?m=levels&l=${unlocked}`),
  });
  bindSegs(root, (name, v) => {
    if (name === 'mode') menu.mode = v as typeof menu.mode;
  });
  root.querySelectorAll<HTMLButtonElement>('.lvl').forEach((b) =>
    b.addEventListener('click', () => navigate(`/bomb/play?m=levels&l=${b.dataset.l}`)),
  );
  return off;
};

export const bombPlayScreen: Screen = (root, params) => {
  const mode: 'levels' | 'endless' = params.get('m') === 'endless' ? 'endless' : 'levels';
  const level = Math.max(1, Math.min(12, Number(params.get('l')) || 1));
  const { seed: fixedSeed, beat } = parsePlayParams(params);
  if (mode === 'levels' && level > store.bomb.unlocked && fixedSeed === null) {
    navigate('/bomb');
    return;
  }
  let game: { destroy(): void } | null = null;
  let closeResults: (() => void) | null = null;
  let alive = true; // results that arrive after leaving the screen are ignored

  const start = () => {
    game?.destroy();
    const seed = fixedSeed ?? randomSeed();
    game = runBomb(root, { mode, level, seed }, (r) => end(r, seed));
  };

  const end = (r: BombResult, seed: number) => {
    if (!alive) return;
    const endless = mode === 'endless';
    const score = endless ? r.defused : Math.round(r.timeLeft * 10);
    if (r.chars > 0) recordRun({ mode: 'bomb', wpm: r.wpm, acc: r.acc, score, chars: r.chars, lang: 'en' });
    let isBest = false;
    if (!endless && r.win) {
      const prev = store.bomb.best[level];
      isBest = prev === undefined || r.timeLeft > prev;
      if (isBest) store.bomb.best[level] = Math.round(r.timeLeft * 10) / 10;
      store.bomb.unlocked = Math.max(store.bomb.unlocked, Math.min(12, level + 1));
      save();
      if (Object.keys(store.bomb.best).length >= 12) unlock('bomb_squad');
    }
    if (endless) isBest = submitBest('bomb-endless', r.defused).isBest;
    const unit = endless ? 'bombs' : 'pts';
    const name = endless ? 'BOMB DEFUSE · ENDLESS' : `BOMB DEFUSE · LEVEL ${level}`;
    closeResults = showResults({
      win: r.win || (endless && r.defused > 0),
      title: endless ? `${r.defused} BOMB${r.defused === 1 ? '' : 'S'} DEFUSED` : r.win ? 'BOMB DEFUSED' : 'KABOOM',
      subtitle: endless ? 'bomb defuse · endless' : `bomb defuse · level ${level}`,
      stats: [
        endless
          ? { label: 'defused', value: String(r.defused), hl: true }
          : { label: 'time left', value: r.win ? `${r.timeLeft.toFixed(1)}s` : '0.0s', hl: true },
        { label: 'wpm', value: String(r.wpm) },
        { label: 'accuracy', value: `${r.acc}%` },
      ],
      isBest,
      beat,
      score,
      unit,
      challenge: { r: '/bomb/play', q: `m=${mode}&l=${level}&seed=${seed}`, s: score, u: unit, n: name },
      onRetry: start,
      onNext: !endless && r.win && level < 12 && fixedSeed === null ? () => navigate(`/bomb/play?m=levels&l=${level + 1}`) : undefined,
      nextLabel: 'Next bomb',
      backHref: '/bomb',
    });
  };

  if (guardKeyboard(root, start)) start();
  return () => {
    alive = false;
    game?.destroy();
    closeResults?.();
  };
};
