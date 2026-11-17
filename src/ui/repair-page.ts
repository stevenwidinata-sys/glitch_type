import '../styles/game.css';
import '../styles/repair.css';
import type { Screen } from '../router';
import { navigate } from '../router';
import { store, save, type Lang } from '../core/storage';
import { randomSeed } from '../core/rng';
import { parsePlayParams } from '../core/params';
import { recordRun, submitBest } from '../core/stats';
import { unlock } from '../core/achievements';
import { runRepair, type RepairConfig, type RepairGame, type RepairResult } from '../games/repair/repair';
import { showResults } from './results';
import { guardKeyboard } from './mobile-notice';
import { renderCrateMenu, seg, optRow, bindSegs } from './crate-menu';

// remembered for this visit only
const last = { src: 'story' as RepairConfig['src'], rule: 'survival' as RepairConfig['rule'], time: 30, lang: null as Lang | null };

export const repairScreen: Screen = (root) => {
  let lang: Lang = last.lang ?? store.settings.lang;
  const off = renderCrateMenu(root, {
    id: 'repair',
    tagline: 'the transmission is corrupted. type every word to restore it.',
    options:
      optRow('source', seg('src', [['story', 'Story logs'], ['common', 'Common words']], last.src)) +
      optRow('rule', seg('rule', [['survival', 'Survival'], ['timed', 'Timed']], last.rule)) +
      optRow('time', seg('time', [['15', '15s'], ['30', '30s'], ['60', '60s']], String(last.time)), 'data-time') +
      optRow('language', seg('lang', [['en', 'English'], ['id', 'Bahasa Indonesia']], lang)),
    extra: `<p class="cr-help"><b>Survival</b>: corruption rises every second. Each repaired word pushes it back, each mistake makes it worse. Finish before it hits 100%.<br>
      <b>Timed</b>: repair as many words as you can before the clock runs out. Your score is your WPM.<br>
      Flickering words are still corrupted. Wrong words stay broken, so accuracy matters.<br>
      <b style="color:#c77dff">Virus</b> words: get one wrong and it infects the next two words. <b style="color:var(--green)">Clean</b> words cut corruption a lot (or add +1s in Timed).</p>`,
    bests: [
      { label: 'survival best', value: `${store.bests['repair-survival'] ?? 0} wpm` },
      { label: 'timed 60s best', value: `${store.bests['repair-timed-60'] ?? 0} wpm` },
    ],
    startLabel: 'Start repair',
    onStart: () => navigate(`/repair/play?src=${last.src}&rule=${last.rule}&t=${last.time}&lang=${lang}`),
  });
  const timeRow = root.querySelector<HTMLElement>('[data-time]')!;
  const syncTime = () => (timeRow.style.display = last.rule === 'timed' ? '' : 'none');
  syncTime();
  bindSegs(root, (name, v) => {
    if (name === 'src') last.src = v as RepairConfig['src'];
    if (name === 'rule') last.rule = v as RepairConfig['rule'];
    if (name === 'time') last.time = Number(v);
    if (name === 'lang') last.lang = lang = v as Lang;
    syncTime();
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
  let alive = true; // results that arrive after leaving the screen are ignored

  const start = () => {
    game?.destroy();
    const cfg: RepairConfig = { src, rule, time, lang, seed: fixedSeed ?? randomSeed(), beat };
    game = runRepair(root, cfg, (r) => end(cfg, r));
  };

  const end = (cfg: RepairConfig, r: RepairResult) => {
    if (!alive) return;
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
    alive = false;
    game?.destroy();
    closeResults?.();
  };
};
