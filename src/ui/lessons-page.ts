import '../styles/game.css';
import '../styles/pages.css';
import type { Screen } from '../router';
import { store, save, type Lang } from '../core/storage';
import { randomSeed } from '../core/rng';
import { onKeys } from '../core/input';
import { sfx } from '../core/audio';
import { calcAcc, calcWpm, recordKey, recordRun, submitBest } from '../core/stats';
import { unlock } from '../core/achievements';
import { LESSONS, customLesson, lessonWords, type Lesson } from '../data/lessons';
import { TypingText } from './typing-text';
import { createKeyboard, fingerFor, fingerLegend, FINGERS } from './keyboard';
import { showResults } from './results';
import { guardKeyboard } from './mobile-notice';

/** keys with the highest miss rate (needs some data) */
export function weakestKeys(n = 5): { key: string; rate: number }[] {
  return Object.entries(store.keyStats)
    .filter(([k, s]) => /^[a-z]$/.test(k) && s.hit + s.miss >= 8)
    .map(([key, s]) => ({ key, rate: s.miss / (s.hit + s.miss) }))
    .filter((x) => x.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, n);
}

export const lessonsScreen: Screen = (root) => {
  const weak = weakestKeys();
  root.innerHTML = `
    <div class="page">
      <div class="page-head">
        <a class="back" href="#/">← claw machine</a>
        <div>
          <h1 class="page-title glitch" data-text="LESSONS">LESSONS</h1>
          <p class="page-sub">// build speed the right way: correct fingers first, then go fast.</p>
        </div>
      </div>
      <div class="lesson-grid">
        ${
          weak.length >= 2
            ? `<a class="lesson-card weak" href="#/lessons/play?keys=${weak.map((w) => w.key).join('')}">
                <span class="n">PERSONAL</span><h3>Weak Keys</h3><p>A drill built from the keys you miss the most.</p>
                <div class="keys">${weak.map((w) => w.key.toUpperCase()).join(' ')}</div></a>`
            : ''
        }
        ${LESSONS.map(
          (l, i) => `<a class="lesson-card" href="#/lessons/play?id=${l.id}">
            <span class="n">LESSON ${String(i + 1).padStart(2, '0')}</span>
            <h3>${l.title}</h3><p>${l.desc}</p>
            <div class="keys">${l.keys.length > 14 ? l.keys.slice(0, 14) + '…' : l.keys.toUpperCase()}</div>
            ${store.lessons[l.id] ? `<div class="best">BEST ${store.lessons[l.id]} WPM</div>` : ''}
          </a>`,
        ).join('')}
      </div>
      <div class="panel" style="margin-top:28px">
        <h2 class="section-title">FINGER MAP</h2>
        <p class="muted" style="margin-top:0;font-size:14px">Rest your fingers on <span class="kbd">A S D F</span> and <span class="kbd">J K L ;</span>. The bumps on F and J help you find home without looking. Each color shows which finger presses that key.</p>
        <div data-kb></div>
      </div>
    </div>`;
  const kb = createKeyboard();
  const holder = root.querySelector('[data-kb]')!;
  holder.append(kb.el, fingerLegend());
};

export const lessonPlayScreen: Screen = (root, params) => {
  const id = params.get('id');
  const keys = params.get('keys');
  const lesson: Lesson | undefined = keys ? customLesson(keys) : LESSONS.find((l) => l.id === id);
  if (!lesson) {
    location.hash = '#/lessons';
    return;
  }
  const lang: Lang = store.settings.lang;
  let cleanup: (() => void) | null = null;
  let closeResults: (() => void) | null = null;

  const start = () => {
    cleanup?.();
    root.innerHTML = `
      <div class="lesson-play">
        <div class="lesson-top">
          <a class="back" href="#/lessons">← lessons</a>
          <div class="hud"><div class="grp">
            <div class="stat"><span class="label">wpm</span><b data-h="wpm">0</b></div>
            <div class="stat"><span class="label">accuracy</span><b data-h="acc">100%</b></div>
            <div class="stat"><span class="label">progress</span><b data-h="prog">0%</b></div>
          </div></div>
        </div>
        <h1 class="page-title" style="font-size:clamp(24px,4vw,40px);margin-top:20px">${lesson.title}</h1>
        <p class="page-sub">${lesson.desc}</p>
        <div class="panel" data-tt></div>
        <div class="finger-hint" data-h="hint"></div>
        <div data-kb></div>
      </div>`;
    const words = lessonWords(lesson, lang, randomSeed(), 28);
    const kb = createKeyboard();
    root.querySelector('[data-kb]')!.append(kb.el);
    const hint = root.querySelector<HTMLElement>('[data-h="hint"]')!;
    let startT = 0;

    const tt = new TypingText(words, {
      onStart: () => (startT = performance.now()),
      onKey(expected, typed, ok) {
        if (expected && expected !== ' ') recordKey(expected, ok);
        kb.press(typed, ok);
        if (ok) sfx.key();
        else sfx.error();
      },
      onDone: () => finish(),
      onChange: () => paint(),
    });
    root.querySelector('[data-tt]')!.append(tt.el);
    document.fonts?.ready.then(() => tt.relayout());

    function paint(): void {
      const next = tt.expected;
      kb.highlight(next);
      const f = fingerFor(next);
      hint.innerHTML = f
        ? `next: <b>${next === ' ' ? 'SPACE' : next}</b> · use your <b style="color:${FINGERS[f].color}">${FINGERS[f].name}</b>`
        : '';
      const ms = startT ? performance.now() - startT : 0;
      root.querySelector('[data-h="wpm"]')!.textContent = String(calcWpm(tt.correctChars, ms));
      root.querySelector('[data-h="acc"]')!.textContent = `${calcAcc(tt.correctKeystrokes, tt.keystrokes)}%`;
      root.querySelector('[data-h="prog"]')!.textContent = `${Math.round((tt.index / tt.words.length) * 100)}%`;
    }
    paint();

    const off = onKeys((k) => {
      if (k === 'Escape') {
        start();
        return;
      }
      if (k === 'Enter') return;
      tt.handleKey(k);
    });
    const onResize = () => tt.relayout();
    window.addEventListener('resize', onResize);
    cleanup = () => {
      off();
      window.removeEventListener('resize', onResize);
    };

    function finish(): void {
      cleanup?.();
      cleanup = null;
      const ms = performance.now() - startT;
      const wpm = calcWpm(tt.correctChars, ms);
      const acc = calcAcc(tt.correctKeystrokes, tt.keystrokes);
      recordRun({ mode: 'lesson', wpm, acc, score: wpm, chars: tt.correctChars, lang });
      const prev = store.lessons[lesson!.id] ?? 0;
      const isBest = wpm > prev;
      if (isBest) store.lessons[lesson!.id] = wpm;
      save();
      submitBest('lesson', wpm);
      if (Object.keys(store.lessons).length >= 5) unlock('student');
      sfx.win();
      const idx = LESSONS.findIndex((l) => l.id === lesson!.id);
      const nextLesson = idx >= 0 ? LESSONS[idx + 1] : undefined;
      closeResults = showResults({
        win: true,
        title: acc >= 95 ? 'CLEAN RUN' : 'LESSON DONE',
        subtitle: lesson!.title,
        stats: [
          { label: 'wpm', value: String(wpm), hl: true },
          { label: 'accuracy', value: `${acc}%` },
          { label: 'words', value: `${tt.results.filter(Boolean).length}/${tt.words.length}` },
        ],
        isBest: isBest && prev > 0,
        onRetry: start,
        onNext: nextLesson ? () => (location.hash = `#/lessons/play?id=${nextLesson.id}`) : undefined,
        nextLabel: 'Next lesson',
        backHref: '/lessons',
      });
    }
  };

  if (guardKeyboard(root, start)) start();

  return () => {
    cleanup?.();
    closeResults?.();
  };
};
