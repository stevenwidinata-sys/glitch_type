import '../styles/game.css';
import type { Screen } from '../router';
import { navigate } from '../router';
import { store, save } from '../core/storage';
import { randomSeed } from '../core/rng';
import { parsePlayParams } from '../core/params';
import { calcAcc, recordRun, submitBest } from '../core/stats';
import { unlock } from '../core/achievements';
import { runBlackHole, type BHConfig, type BHGame, type BHResult } from '../games/blackhole/game';
import { CAMPAIGN } from '../games/blackhole/levels';
import { showResults } from './results';
import { guardKeyboard } from './mobile-notice';

export const blackholeScreen: Screen = (root) => {
  const unlocked = store.campaign.unlocked;
  const lang = store.settings.lang;
  root.innerHTML = `
    <div class="page">
      <div class="page-head">
        <a class="back" href="#/">← claw machine</a>
        <div>
          <h1 class="page-title glitch" data-text="BLACK HOLE">BLACK HOLE</h1>
          <p class="page-sub">// rocks pour out of the singularity. type their letters to blast them.</p>
        </div>
      </div>
      <div class="setup-grid">
        <a class="mode-card" style="--c:var(--pink)" href="#/blackhole/play?mode=endless&lang=${lang}">
          <span class="label">survival</span>
          <h3>ENDLESS</h3>
          <p>3 shields. Waves get faster forever. Chain hits for up to an x8 combo multiplier and grab power-ups: FREEZE, NUKE, SHIELD.</p>
          <div class="best">BEST: ${store.bests['bh-endless'] ?? 0} pts</div>
          <span class="big">∞</span>
        </a>
        <div class="mode-card" style="--c:var(--cyan); cursor:default">
          <span class="label">training path</span>
          <h3>CAMPAIGN</h3>
          <p>20 levels, from the home row to full words and bosses. Clear a level to unlock the next. Stars are based on accuracy.</p>
          <div class="best">PROGRESS: ${Math.min(unlocked - 1, 20)}/20 cleared</div>
          <span class="big">20</span>
        </div>
      </div>
      <h2 class="label" style="margin:34px 0 14px">select level</h2>
      <div class="levels">
        ${CAMPAIGN.map((lv, i) => {
          const n = i + 1;
          const stars = store.campaign.stars[n] ?? 0;
          return `<button class="lvl ${lv.boss ? 'boss' : ''}" data-l="${n}" ${n > unlocked ? 'disabled' : ''} title="${lv.name}: ${lv.hint}">
            ${n > unlocked ? '🔒' : n}<small>${n > unlocked ? '' : '★'.repeat(stars) + '☆'.repeat(3 - stars)}</small></button>`;
        }).join('')}
      </div>
      <p class="page-sub" style="margin-top:22px">tip: words lock on after the first letter. press <span class="kbd">Backspace</span> to release a lock, <span class="kbd">Esc</span> to pause.</p>
    </div>`;
  root.querySelectorAll<HTMLButtonElement>('.lvl').forEach((b) =>
    b.addEventListener('click', () => navigate(`/blackhole/play?mode=campaign&level=${b.dataset.l}&lang=${lang}`)),
  );
};

export const blackholePlayScreen: Screen = (root, params) => {
  const mode = params.get('mode') === 'campaign' ? 'campaign' : 'endless';
  const level = Math.max(1, Math.min(20, Number(params.get('level')) || 1));
  const { lang, seed: fixedSeed, beat, daily } = parsePlayParams(params);

  if (mode === 'campaign' && level > store.campaign.unlocked && fixedSeed === null) {
    navigate('/blackhole');
    return;
  }

  let game: BHGame | null = null;
  let closeResults: (() => void) | null = null;

  const start = (lv = level) => {
    game?.destroy();
    const cfg: BHConfig = { mode, level: lv, seed: fixedSeed ?? randomSeed(), lang, beat };
    game = runBlackHole(root, cfg, (r) => end(cfg, r));
  };

  const end = (cfg: BHConfig, r: BHResult) => {
    const wpm = r.ms > 0 ? Math.round(r.chars / 5 / (r.ms / 60000)) : 0;
    const acc = calcAcc(r.hits, r.hits + r.misses);
    const modeKey = mode === 'endless' ? 'bh-endless' : 'bh-campaign';
    if (r.chars > 0) recordRun({ mode: modeKey, wpm, acc, score: r.score, chars: r.chars, lang });
    let isBest = false;
    let stars = 0;
    if (mode === 'endless') {
      isBest = submitBest('bh-endless', r.score).isBest;
    } else if (r.win) {
      stars = acc >= 95 ? 3 : acc >= 85 ? 2 : 1;
      store.campaign.stars[cfg.level] = Math.max(store.campaign.stars[cfg.level] ?? 0, stars);
      store.campaign.unlocked = Math.max(store.campaign.unlocked, Math.min(21, cfg.level + 1));
      if (cfg.level >= 10) unlock('campaign_10');
      if (cfg.level >= 20) unlock('campaign_20');
      save();
    }
    if (daily) {
      const k = `${daily}-bh`;
      if (r.score > (store.daily[k] ?? -1)) store.daily[k] = r.score;
      save();
      unlock('daily');
    }

    const title =
      mode === 'endless' ? (r.score > 0 ? 'SHIELDS DOWN' : 'GAME OVER') : r.win ? `LEVEL ${cfg.level} CLEAR` : 'MISSION FAILED';
    const canNext = mode === 'campaign' && r.win && cfg.level < 20 && fixedSeed === null;
    closeResults = showResults({
      win: r.win || (mode === 'endless' && isBest),
      title,
      subtitle: mode === 'endless' ? `endless · reached wave ${r.wave}` : `campaign · ${CAMPAIGN[cfg.level - 1].name}`,
      stats: [
        { label: 'score', value: String(r.score), hl: true },
        ...(mode === 'campaign' && r.win ? [{ label: 'stars', value: '★'.repeat(stars) + '☆'.repeat(3 - stars) }] : [{ label: mode === 'endless' ? 'wave' : 'level', value: String(r.wave) }]),
        { label: 'wpm', value: String(wpm) },
        { label: 'accuracy', value: `${acc}%` },
        { label: 'best combo', value: String(r.bestCombo) },
      ],
      isBest,
      beat,
      score: r.score,
      unit: 'pts',
      challenge: {
        r: '/blackhole/play',
        q: `mode=${mode}&level=${cfg.level}&seed=${cfg.seed}&lang=${lang}`,
        s: r.score,
        u: 'pts',
        n: mode === 'endless' ? 'BLACK HOLE · ENDLESS' : `BLACK HOLE · LEVEL ${cfg.level}`,
      },
      onRetry: () => start(cfg.level),
      onNext: canNext ? () => navigate(`/blackhole/play?mode=campaign&level=${cfg.level + 1}&lang=${lang}`) : undefined,
      nextLabel: 'Next level',
      backHref: daily ? '/daily' : '/blackhole',
    });
  };

  if (guardKeyboard(root, () => start())) start();

  return () => {
    game?.destroy();
    closeResults?.();
  };
};
