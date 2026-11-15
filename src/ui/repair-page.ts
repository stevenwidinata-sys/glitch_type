import '../styles/game.css';
import '../styles/repair.css';
import type { Screen } from '../router';
import { navigate } from '../router';
import { store, save, type Lang } from '../core/storage';
import { randomSeed } from '../core/rng';
import { parsePlayParams } from '../core/params';
import { recordRun, submitBest } from '../core/stats';
import { unlock } from '../core/achievements';
import { onKeys } from '../core/input';
import { runRepair, type RepairConfig, type RepairGame, type RepairResult } from '../games/repair/repair';
import { showResults } from './results';
import { guardKeyboard } from './mobile-notice';

// remembered for this visit only
const last = { src: 'story' as RepairConfig['src'], rule: 'survival' as RepairConfig['rule'], time: 30 };

function seg(name: string, options: [string, string][], value: string): string {
  return `<div class="seg" data-seg="${name}">${options
    .map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="${v === value}">${label}</button>`)
    .join('')}</div>`;
}

export const repairScreen: Screen = (root) => {
  let lang: Lang = store.settings.lang;
  root.innerHTML = `
    <div class="page rp-setup">
      <div class="page-head">
        <a class="back" href="#/">← claw machine</a>
        <div>
          <h1 class="page-title glitch" data-text="REPAIR PROTOCOL">REPAIR PROTOCOL</h1>
          <p class="page-sub">// the transmission is corrupted. type every word to restore it.</p>
        </div>
      </div>
      <div class="setup-grid">
        <div class="panel">
          <div class="opt-row"><span class="label">source</span>${seg('src', [['story', 'Story logs'], ['common', 'Common words']], last.src)}</div>
          <div class="opt-row"><span class="label">rule</span>${seg('rule', [['survival', 'Survival'], ['timed', 'Timed']], last.rule)}</div>
          <div class="opt-row" data-time><span class="label">time</span>${seg('time', [['15', '15s'], ['30', '30s'], ['60', '60s']], String(last.time))}</div>
          <div class="opt-row"><span class="label">language</span>${seg('lang', [['en', 'English'], ['id', 'Bahasa Indonesia']], lang)}</div>
          <button class="btn pink go" type="button">Start repair <span class="k">↵ enter</span></button>
        </div>
        <div class="panel">
          <span class="label">how it works</span>
          <p class="muted" style="line-height:1.7">
            <b style="color:var(--text)">Survival</b>: corruption rises every second. Each word you repair pushes it back, each mistake makes it worse. Finish the text before it hits 100%.<br><br>
            <b style="color:var(--text)">Timed</b>: repair as many words as you can before the clock runs out. Your score is your WPM.<br><br>
            Words that flicker are still corrupted. Wrong words stay broken, so accuracy matters.
          </p>
          <div class="best" style="font-family:var(--font-mono);font-size:12px;color:var(--yellow);margin-top:12px">
            BEST SURVIVAL: ${store.bests['repair-survival'] ?? 0} wpm · BEST TIMED 60s: ${store.bests['repair-timed-60'] ?? 0} wpm
          </div>
        </div>
      </div>
    </div>`;

  const timeRow = root.querySelector<HTMLElement>('[data-time]')!;
  const syncTime = () => (timeRow.style.display = last.rule === 'timed' ? '' : 'none');
  syncTime();

  root.querySelectorAll<HTMLDivElement>('.seg').forEach((s) => {
    s.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      s.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const v = b.dataset.v!;
      const name = s.dataset.seg;
      if (name === 'src') last.src = v as RepairConfig['src'];
      if (name === 'rule') last.rule = v as RepairConfig['rule'];
      if (name === 'time') last.time = Number(v);
      if (name === 'lang') lang = v as Lang;
      syncTime();
    });
  });

  const go = () => navigate(`/repair/play?src=${last.src}&rule=${last.rule}&t=${last.time}&lang=${lang}`);
  root.querySelector('.go')!.addEventListener('click', go);
  const off = onKeys((k) => {
    if (k === 'Enter') go();
  });
  return off;
};

export const repairPlayScreen: Screen = (root, params) => {
  const src: RepairConfig['src'] = params.get('src') === 'common' ? 'common' : 'story';
  const rule: RepairConfig['rule'] = params.get('rule') === 'timed' ? 'timed' : 'survival';
  const time = [15, 30, 60].includes(Number(params.get('t'))) ? Number(params.get('t')) : 30;
  const { lang, seed: fixedSeed, beat, daily } = parsePlayParams(params);

  let game: RepairGame | null = null;
  let closeResults: (() => void) | null = null;

  const start = () => {
    game?.destroy();
    const cfg: RepairConfig = { src, rule, time, lang, seed: fixedSeed ?? randomSeed(), beat };
    game = runRepair(root, cfg, (r) => end(cfg, r));
  };

  const end = (cfg: RepairConfig, r: RepairResult) => {
    if (r.aborted) {
      start();
      return;
    }
    const modeKey = rule === 'timed' ? 'repair-timed' : 'repair-survival';
    if (r.words > 0) recordRun({ mode: modeKey, wpm: r.wpm, acc: r.acc, score: r.wpm, chars: r.chars, lang });
    const bestKey = rule === 'timed' ? `repair-timed-${time}` : 'repair-survival';
    const isBest = (rule === 'timed' || r.win) && r.words > 0 ? submitBest(bestKey, r.wpm).isBest : false;
    if (rule === 'survival' && r.win) unlock('survivor');
    if (daily && r.words > 0) {
      const k = `${daily}-rp`;
      if (r.wpm > (store.daily[k] ?? -1)) store.daily[k] = r.wpm;
      save();
      unlock('daily');
    }
    const title = rule === 'timed' ? "TIME'S UP" : r.win ? 'SYSTEM RESTORED' : 'SYSTEM CORRUPTED';
    closeResults = showResults({
      win: rule === 'timed' || r.win,
      title,
      subtitle: `${r.title} · ${rule === 'timed' ? `timed ${time}s` : 'survival'}`,
      stats: [
        { label: 'wpm', value: String(r.wpm), hl: true },
        { label: 'accuracy', value: `${r.acc}%` },
        { label: 'words fixed', value: `${r.wordsOk}/${r.words}` },
        ...(rule === 'survival' ? [{ label: 'corruption', value: `${Math.round(r.corruption)}%` }] : []),
      ],
      isBest,
      beat,
      score: r.wpm,
      unit: 'wpm',
      challenge: {
        r: '/repair/play',
        q: `src=${src}&rule=${rule}&t=${time}&lang=${lang}&seed=${cfg.seed}`,
        s: r.wpm,
        u: 'wpm',
        n: `REPAIR · ${rule === 'timed' ? `TIMED ${time}s` : 'SURVIVAL'}`,
      },
      onRetry: start,
      backHref: daily ? '/daily' : '/repair',
    });
  };

  if (guardKeyboard(root, start)) start();

  return () => {
    game?.destroy();
    closeResults?.();
  };
};
