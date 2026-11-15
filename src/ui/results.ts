import { challengeUrl, copyText, type Challenge } from '../core/share';
import { sfx } from '../core/audio';

export interface ResultOpts {
  win: boolean;
  title: string;
  subtitle?: string;
  stats: { label: string; value: string; hl?: boolean }[];
  isBest?: boolean;
  /** score the player was challenged to beat */
  beat?: number;
  score?: number;
  unit?: string;
  challenge?: Challenge;
  onRetry(): void;
  onNext?: () => void;
  nextLabel?: string;
  backHref: string;
  backLabel?: string;
}

/** Shows the end-of-run overlay. Returns a function that removes it. */
export function showResults(opts: ResultOpts): () => void {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  const vs =
    opts.beat !== undefined && opts.score !== undefined
      ? opts.score > opts.beat
        ? `<p class="vs won">CHALLENGE BEATEN: ${opts.score} vs ${opts.beat} ${opts.unit ?? ''}</p>`
        : `<p class="vs lost">CHALLENGE FAILED: ${opts.score} vs ${opts.beat} ${opts.unit ?? ''}</p>`
      : '';
  ov.innerHTML = `
    <div class="panel" role="dialog" aria-modal="true">
      <span class="label">${opts.subtitle ?? 'run complete'}</span>
      <h2 class="result-title ${opts.win ? 'win' : 'lose'}">${opts.title}</h2>
      ${opts.isBest ? '<span class="newbest">NEW PERSONAL BEST</span>' : ''}
      <div class="result-stats">
        ${opts.stats.map((s) => `<div class="${s.hl ? 'hl' : ''}"><span class="label">${s.label}</span><b>${s.value}</b></div>`).join('')}
      </div>
      ${vs}
      <div class="result-actions">
        ${opts.onNext ? `<button class="btn green" data-a="next">${opts.nextLabel ?? 'Next'} <span class="k">↵</span></button>` : ''}
        <button class="btn" data-a="retry">Retry <span class="k">${opts.onNext ? 'R' : '↵'}</span></button>
        ${opts.challenge ? '<button class="btn pink" data-a="share">Challenge a friend</button>' : ''}
        <a class="btn ghost" href="#${opts.backHref}">${opts.backLabel ?? 'Back'}</a>
      </div>
      <div class="share-box"><p class="muted" style="font-size:13px">Send this link. Your friend plays the exact same round and has to beat your score.</p><input readonly /></div>
    </div>`;
  document.body.append(ov);

  const retry = () => {
    close();
    opts.onRetry();
  };
  const next = () => {
    close();
    opts.onNext?.();
  };
  ov.querySelector('[data-a="retry"]')!.addEventListener('click', retry);
  ov.querySelector('[data-a="next"]')?.addEventListener('click', next);
  ov.querySelector('a.btn')!.addEventListener('click', () => close());
  ov.querySelector('[data-a="share"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const url = challengeUrl(opts.challenge!);
    const box = ov.querySelector('.share-box')!;
    const input = box.querySelector('input')!;
    input.value = url;
    box.classList.add('show');
    input.select();
    const ok = await copyText(url);
    btn.textContent = ok ? 'Link copied!' : 'Copy the link below';
    sfx.repair();
  });

  // keyboard shortcuts (with a short delay so the last keystroke of the run doesn't trigger them)
  let armed = false;
  const armTimer = setTimeout(() => (armed = true), 600);
  const onKey = (e: KeyboardEvent) => {
    if (!armed) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (opts.onNext) next();
      else retry();
    } else if (e.key.toLowerCase() === 'r' && opts.onNext) {
      retry();
    } else if (e.key === 'Escape') {
      close();
      location.hash = `#${opts.backHref}`;
    }
  };
  window.addEventListener('keydown', onKey, true);

  function close(): void {
    clearTimeout(armTimer);
    window.removeEventListener('keydown', onKey, true);
    ov.remove();
  }
  return close;
}
