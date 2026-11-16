import '../styles/game.css';
import type { Screen } from '../router';
import { navigate } from '../router';
import { store, save } from '../core/storage';
import { mulberry32, pick, randomSeed } from '../core/rng';
import { parsePlayParams } from '../core/params';
import { recordRun, submitBest } from '../core/stats';
import { unlock } from '../core/achievements';
import { RACE_PASSAGES } from '../data/race-en';
import { runRacer, type Difficulty, type RacerResult } from '../games/racer/racer';
import { renderCrateMenu, seg, optRow, bindSegs } from './crate-menu';
import { showResults } from './results';
import { guardKeyboard } from './mobile-notice';

const menu = { diff: 'normal' as Difficulty, ghost: '1' };
const ORD = ['1ST', '2ND', '3RD', '4TH'];

export const racerScreen: Screen = (root) => {
  const off = renderCrateMenu(root, {
    id: 'racer',
    tagline: 'your car only moves when you type. beat 3 rivals and your own ghost.',
    options:
      optRow('difficulty', seg('diff', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], menu.diff)) +
      optRow('ghost of your best', seg('ghost', [['1', 'On'], ['0', 'Off']], menu.ghost)),
    extra: `<p class="cr-help"><b>Rivals</b>: VOLT, NOVA and RAZOR type at
      <b>${'25/35/45'}</b> WPM on Easy, <b>40/55/70</b> on Normal and <b>60/80/100</b> on Hard.<br>
      <b>Ghost</b>: a see-through replay of your fastest run on the same track.<br>
      Wrong words make you skid. Every race is one short passage; first across the line wins. English only.</p>`,
    bests: [
      { label: 'best race wpm', value: store.bests['racer-wpm'] ?? 0 },
      { label: 'wins', value: store.bests['racer-wins'] ?? 0 },
    ],
    startLabel: 'Start race',
    onStart: () => navigate(`/racer/play?d=${menu.diff}&g=${menu.ghost}`),
  });
  bindSegs(root, (name, v) => {
    if (name === 'diff') menu.diff = v as Difficulty;
    if (name === 'ghost') menu.ghost = v;
  });
  return off;
};

export const racerPlayScreen: Screen = (root, params) => {
  const diffParam = params.get('d');
  const difficulty: Difficulty = diffParam === 'easy' || diffParam === 'hard' ? diffParam : 'normal';
  const ghostOn = params.get('g') !== '0';
  const { seed: fixedSeed, beat } = parsePlayParams(params);
  const fixedPassage = RACE_PASSAGES.find((p) => p.id === params.get('p'));

  let game: { destroy(): void } | null = null;
  let closeResults: (() => void) | null = null;

  const start = (same?: { passage: (typeof RACE_PASSAGES)[number]; seed: number }) => {
    game?.destroy();
    const seed = same?.seed ?? fixedSeed ?? randomSeed();
    const passage = same?.passage ?? fixedPassage ?? pick(mulberry32(seed), RACE_PASSAGES);
    game = runRacer(
      root,
      { passageId: passage.id, text: passage.text, title: passage.title, difficulty, ghost: ghostOn, seed },
      (r) => end(r, passage, seed),
    );
  };

  const end = (r: RacerResult, passage: (typeof RACE_PASSAGES)[number], seed: number) => {
    const passageId = passage.id;
    recordRun({ mode: 'racer', wpm: r.wpm, acc: r.acc, score: r.wpm, chars: r.chars, lang: 'en' });
    const isBest = submitBest('racer-wpm', r.wpm).isBest;
    if (r.place === 1) {
      store.bests['racer-wins'] = (store.bests['racer-wins'] ?? 0) + 1;
      save();
      unlock('race_win');
      if (difficulty === 'hard') unlock('race_hard');
    }
    save();
    const ghostLine =
      r.ghostDelta === null
        ? r.newGhost
          ? 'ghost saved'
          : '-'
        : `${r.ghostDelta <= 0 ? '−' : '+'}${Math.abs(r.ghostDelta / 1000).toFixed(2)}s`;
    closeResults = showResults({
      win: r.place === 1,
      title: r.place === 1 ? 'VICTORY' : `${ORD[r.place - 1]} PLACE`,
      subtitle: `neon racer · ${difficulty}`,
      stats: [
        { label: 'place', value: ORD[r.place - 1], hl: true },
        { label: 'time', value: `${(r.ms / 1000).toFixed(2)}s` },
        { label: 'wpm', value: String(r.wpm) },
        { label: 'accuracy', value: `${r.acc}%` },
        { label: 'vs ghost', value: ghostLine },
      ],
      isBest,
      beat,
      score: r.wpm,
      unit: 'wpm',
      challenge: {
        r: '/racer/play',
        q: `d=${difficulty}&g=0&p=${passageId}&seed=${seed}`,
        s: r.wpm,
        u: 'wpm',
        n: `NEON RACER · ${difficulty.toUpperCase()}`,
      },
      onRetry: () => start({ passage, seed }),
      backHref: '/racer',
    });
  };

  if (guardKeyboard(root, () => start())) start();

  return () => {
    game?.destroy();
    closeResults?.();
  };
};
