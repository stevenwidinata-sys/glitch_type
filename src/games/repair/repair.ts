// Repair Protocol: type the corrupted transmission back to health.
import '../../styles/repair.css';
import { mulberry32, pick, shuffle } from '../../core/rng';
import { onKeys } from '../../core/input';
import { sfx } from '../../core/audio';
import { recordKey, calcWpm, calcAcc } from '../../core/stats';
import { store, type Lang } from '../../core/storage';
import { wordsFor, storiesFor } from '../../data/lessons';
import { TypingText } from '../../ui/typing-text';
import { Corruption } from './corruption';

export interface RepairConfig {
  src: 'story' | 'common';
  rule: 'survival' | 'timed';
  time: number; // seconds for timed
  lang: Lang;
  seed: number;
  beat?: number;
}

export interface RepairResult {
  win: boolean;
  wpm: number;
  acc: number;
  words: number;
  wordsOk: number;
  chars: number;
  ms: number;
  corruption: number;
  title: string;
  aborted: boolean;
}

export interface RepairGame {
  destroy(): void;
}

function buildText(cfg: RepairConfig): { title: string; words: string[]; more: () => string[] } {
  const rng = mulberry32(cfg.seed);
  if (cfg.src === 'story') {
    const stories = shuffle(rng, [...storiesFor(cfg.lang)]);
    let i = 0;
    const next = () => stories[i++ % stories.length].text.split(/\s+/);
    const first = stories[0];
    const words = next();
    return { title: first.title, words, more: next };
  }
  const list = wordsFor(cfg.lang);
  const gen = (n: number) => Array.from({ length: n }, () => pick(rng, list));
  return {
    title: cfg.lang === 'id' ? 'NOISE // KATA UMUM' : 'NOISE // COMMON WORDS',
    words: gen(cfg.rule === 'survival' ? 60 : 120),
    more: () => gen(60),
  };
}

export function runRepair(root: HTMLElement, cfg: RepairConfig, onEnd: (r: RepairResult) => void): RepairGame {
  const text = buildText(cfg);
  const survival = cfg.rule === 'survival';
  root.innerHTML = `
    <div class="repair">
      <div class="rp-top">
        <a class="back" href="#/repair">← abort</a>
        <div class="hud" style="position:static;padding:0">
          <div class="grp">
            <div class="stat"><span class="label">wpm</span><b data-h="wpm">0</b></div>
            <div class="stat"><span class="label">accuracy</span><b data-h="acc">100%</b></div>
            <div class="stat"><span class="label">repaired</span><b data-h="ok">0</b></div>
            <div class="stat"><span class="label">streak</span><b data-h="streak">0</b></div>
            ${cfg.beat !== undefined ? `<div class="stat"><span class="label">beat this</span><b style="color:var(--pink)">${cfg.beat}</b></div>` : ''}
          </div>
        </div>
      </div>
      ${survival ? '' : `<div class="rp-timer" data-h="timer">${cfg.time}</div>`}
      <div class="rp-start-hint" data-h="hint">start typing to begin the repair</div>
      <div class="rp-title">${text.title} <span class="src">· ${survival ? 'SURVIVAL' : `TIMED ${cfg.time}s`} · ${cfg.lang.toUpperCase()}</span></div>
      <div class="rp-stage">
        <aside class="rp-log" aria-hidden="true"><div class="rp-log-head">SYS.LOG</div><div data-h="log"></div></aside>
        <div class="crt"><div class="panel rp-terminal"></div><div class="crt-glass" aria-hidden="true"></div></div>
        <aside class="rp-legend" aria-hidden="true">
          <div><i class="v"></i><b>virus</b> fail it and it spreads</div>
          <div><i class="c"></i><b>clean</b> ${survival ? 'cuts corruption' : '+1 second'}</div>
        </aside>
      </div>
      ${
        survival
          ? `<div class="rp-meter"><div class="row"><span>CORRUPTION</span><b data-h="corr">0%</b></div><div class="bar"><div class="fill" data-h="fill"></div></div></div>`
          : ''
      }
      <p class="rp-help"><span class="kbd">space</span> next word · <span class="kbd">backspace</span> fix · <span class="kbd">esc</span> restart</p>
    </div>`;

  const wrap = root.querySelector<HTMLDivElement>('.repair')!;
  const term = root.querySelector<HTMLDivElement>('.rp-terminal')!;
  const h = (k: string) => root.querySelector<HTMLElement>(`[data-h="${k}"]`);

  let corruption = survival ? 12 : 0;
  let streak = 0;
  let bonus = 0; // timed mode: seconds gained or lost from clean / virus words
  type Kind = 'normal' | 'virus' | 'clean';
  const kinds: Kind[] = [];
  const kindRng = mulberry32(cfg.seed ^ 0x1234);
  let startT = 0;
  let elapsed = 0;
  let over = false;

  const tt = new TypingText(text.words, {
    onStart() {
      startT = performance.now();
      h('hint')?.remove();
    },
    onKey(expected, _typed, ok) {
      if (expected && expected !== ' ') recordKey(expected, ok);
      if (ok) sfx.key();
      else {
        sfx.error();
        if (survival) corruption = Math.min(100, corruption + 0.6);
      }
    },
    onWord(i, ok) {
      fx.clear();
      const kind = kinds[i] ?? 'normal';
      const el = tt.wordEl(i);
      if (ok) {
        streak++;
        sfx.repair(streak);
        if (el) sparks(el, kind === 'clean' ? '#39ff88' : kind === 'virus' ? '#c77dff' : '#00f0ff', kind === 'normal' ? 8 : 16);
        if (survival) corruption = Math.max(0, corruption - (2 + tt.words[i].length * 0.6));
        if (kind === 'clean') {
          if (survival) corruption = Math.max(0, corruption - 8);
          else bonus += 1;
          if (el) floatText(el, survival ? '-8% CORRUPTION' : '+1s', '#39ff88');
        }
        log(tt.words[i], kind === 'virus' ? 'PURGED' : 'OK', kind === 'virus' ? 'v' : 'ok');
      } else {
        streak = 0;
        log(tt.words[i], kind === 'virus' ? 'SPREAD' : 'ERR', 'err');
        if (kind === 'virus') {
          if (survival) corruption = Math.min(100, corruption + 10);
          else bonus -= 2;
          infect(i + 1);
          infect(i + 2);
          if (el) floatText(el, 'VIRUS SPREAD', '#c77dff');
        }
        sfx.error();
        if (survival) corruption = Math.min(100, corruption + 6);
        wrap.classList.remove('glitch-flash');
        void wrap.offsetWidth;
        wrap.classList.add('glitch-flash');
      }
      if (!survival && tt.remaining() < 40) {
        const from = tt.words.length;
        tt.append(text.more());
        markKinds(from);
      }
    },
    onDone() {
      if (survival) finish(true);
    },
  });
  term.append(tt.el);
  const fx = new Corruption(tt);

  function markKinds(from: number): void {
    for (let i = from; i < tt.words.length; i++) {
      const r = kindRng();
      const k: Kind = i < 3 ? 'normal' : r < 0.09 ? 'virus' : r < 0.17 ? 'clean' : 'normal';
      kinds[i] = k;
      if (k !== 'normal') tt.wordEl(i)?.classList.add(k);
    }
  }
  markKinds(0);

  function infect(j: number): void {
    if (j >= tt.words.length || kinds[j] === 'virus') return;
    kinds[j] = 'virus';
    const el = tt.wordEl(j);
    el?.classList.remove('clean');
    el?.classList.add('virus', 'infected');
  }

  function sparks(el: HTMLElement, color: string, n: number): void {
    if (store.settings.reducedMotion) return;
    const r = el.getBoundingClientRect();
    for (let k = 0; k < n; k++) {
      const sp = document.createElement('i');
      sp.className = 'rp-spark';
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 60;
      sp.style.left = r.left + r.width / 2 + 'px';
      sp.style.top = r.top + r.height / 2 + 'px';
      sp.style.background = color;
      sp.style.setProperty('--dx', Math.cos(a) * d + 'px');
      sp.style.setProperty('--dy', Math.sin(a) * d - 20 + 'px');
      wrap.append(sp);
      setTimeout(() => sp.remove(), 650);
    }
  }

  function floatText(el: HTMLElement, text: string, color: string): void {
    const r = el.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'rp-float';
    f.textContent = text;
    f.style.left = r.left + r.width / 2 + 'px';
    f.style.top = r.top - 6 + 'px';
    f.style.color = color;
    wrap.append(f);
    setTimeout(() => f.remove(), 1000);
  }

  let logN = 0;
  function log(word: string, status: string, cls: string): void {
    const box = h('log');
    if (!box) return;
    const line = document.createElement('div');
    line.className = 'rp-log-line ' + cls;
    const addr = (0x3f00 + logN++ * 7).toString(16).toUpperCase();
    line.textContent = '0x' + addr + ' ' + word.slice(0, 12) + ' .. ' + status;
    box.prepend(line);
    while (box.children.length > 16) box.lastElementChild?.remove();
  }

  // boot log in the margin
  const bootTimers: number[] = [];
  const BOOT: [string, string][] = [
    ['BIOS', 'REPAIR_PROTOCOL v2.6'],
    ['MEM', 'CHECK 640K .. OK'],
    ['LINK', 'UPLINK ESTABLISHED'],
    ['SCAN', `${text.words.length} PACKETS FOUND`],
    ['WARN', 'VIRUS SIGNATURES DETECTED'],
    ['SYS', 'AWAITING OPERATOR'],
  ];
  BOOT.forEach(([tag, msg], n) => {
    bootTimers.push(
      window.setTimeout(() => {
        const box = h('log');
        if (!box) return;
        const line = document.createElement('div');
        line.className = 'rp-log-line boot' + (tag === 'WARN' ? ' v' : '');
        line.textContent = `[${tag}] ${msg}`;
        box.prepend(line);
      }, 120 + n * 160),
    );
  });
  document.fonts?.ready.then(() => tt.relayout());
  const onResize = () => tt.relayout();
  window.addEventListener('resize', onResize);

  const offKeys = onKeys((k) => {
    if (over) return;
    if (k === 'Escape') {
      finish(false, true);
      return;
    }
    if (k === 'Enter') return;
    fx.clear();
    tt.handleKey(k);
  });

  function stats(): Omit<RepairResult, 'win' | 'title' | 'corruption' | 'aborted'> {
    const ms = startT ? (over ? elapsed : performance.now() - startT) : 0;
    const wordsOk = tt.results.filter(Boolean).length;
    return {
      wpm: calcWpm(tt.correctChars, ms),
      acc: calcAcc(tt.correctKeystrokes, tt.keystrokes),
      words: tt.results.length,
      wordsOk,
      chars: tt.correctChars,
      ms,
    };
  }

  function finish(win: boolean, aborted = false): void {
    if (over) return;
    elapsed = startT ? performance.now() - startT : 0;
    if (!survival && startT) elapsed = Math.min(elapsed, (cfg.time + bonus) * 1000);
    over = true;
    fx.clear();
    if (aborted) {
      onEnd({ ...stats(), win: false, corruption, title: text.title, aborted: true });
      return;
    }
    if (win) sfx.win();
    else if (survival) sfx.gameOver();
    else sfx.win();
    setTimeout(() => onEnd({ ...stats(), win, corruption, title: text.title, aborted: false }), 500);
  }

  let raf = 0;
  let last = performance.now();
  let lastHud = '';
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (over) return;
    const running = startT > 0;
    if (running) {
      const t = (now - startT) / 1000;
      if (survival) {
        corruption = Math.min(100, corruption + (1.0 + t * 0.03) * dt);
        if (corruption >= 100) {
          finish(false);
        }
      } else {
        const left = Math.max(0, cfg.time + bonus - t);
        const timer = h('timer')!;
        timer.textContent = String(Math.ceil(left));
        timer.classList.toggle('low', left <= 5);
        if (left <= 0) finish(true);
      }
    }
    const intensity = survival ? corruption / 100 : 0.25;
    wrap.style.setProperty('--corr', intensity.toFixed(3));
    fx.tick(dt, intensity);

    const s = stats();
    const key = `${s.wpm}|${s.acc}|${s.wordsOk}|${Math.round(corruption)}|${streak}`;
    if (key !== lastHud) {
      lastHud = key;
      h('wpm')!.textContent = String(running ? s.wpm : 0);
      h('acc')!.textContent = `${s.acc}%`;
      h('ok')!.textContent = String(s.wordsOk);
      h('streak')!.textContent = String(streak);
      if (survival) {
        h('corr')!.textContent = `${Math.round(corruption)}%`;
        h('fill')!.style.width = `${corruption}%`;
      }
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      bootTimers.forEach((t) => clearTimeout(t));
      offKeys();
      fx.clear();
      window.removeEventListener('resize', onResize);
    },
  };
}
