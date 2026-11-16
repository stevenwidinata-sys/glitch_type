// Shared "inside the crate" menu shell: themed walls, title, options, START.
// Esc / Back returns to the claw machine (crate closing animation).
import '../styles/game.css';
import '../styles/crate-menu.css';
import { crateById, type GameId } from './claw/crates';
import { returnToMachine } from './claw/state';
import { onKeys } from '../core/input';

export interface CrateMenuOpts {
  id: GameId;
  tagline: string;
  /** HTML for the options card (segmented controls etc.) */
  options: string;
  /** optional second card (how to play, level grid...) */
  extra?: string;
  bests?: { label: string; value: string | number }[];
  startLabel?: string;
  onStart(): void;
}

export function seg(name: string, options: [string, string][], value: string): string {
  return `<div class="seg" data-seg="${name}">${options
    .map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="${v === value}">${label}</button>`)
    .join('')}</div>`;
}

export function optRow(label: string, control: string, attrs = ''): string {
  return `<div class="opt-row" ${attrs}><span class="label">${label}</span>${control}</div>`;
}

/** Wire up every .seg in `root`: clicking a button selects it and calls onChange(name, value). */
export function bindSegs(root: HTMLElement, onChange: (name: string, value: string) => void): void {
  root.querySelectorAll<HTMLDivElement>('.seg').forEach((s) =>
    s.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b || !s.contains(b)) return;
      s.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onChange(s.dataset.seg ?? '', b.dataset.v ?? '');
    }),
  );
}

export function renderCrateMenu(root: HTMLElement, opts: CrateMenuOpts): () => void {
  const def = crateById(opts.id)!;
  const index = ['blackhole', 'repair', 'racer', 'boss', 'bomb'].indexOf(opts.id) + 1;
  root.innerHTML = `
    <div class="crate-room" style="--c:${def.color}">
      <div class="cr-lamp" aria-hidden="true"></div>
      <div class="cr-stencil" aria-hidden="true">GT-0${index}</div>
      <button class="back cr-back" type="button">◀ back to machine <span class="kbd">esc</span></button>
      <div class="cr-inner">
        <h1 class="cr-title">${def.label}</h1>
        <p class="cr-tag">// ${opts.tagline}</p>
        <div class="cr-card">
          <div class="cr-opts">${opts.options}</div>
          <div class="cr-start"><button class="btn" type="button" data-start>${opts.startLabel ?? 'Start'} <span class="k">↵ enter</span></button></div>
          ${
            opts.bests?.length
              ? `<div class="cr-bests">${opts.bests.map((b) => `<span>${b.label}: <b>${b.value}</b></span>`).join('')}</div>`
              : ''
          }
        </div>
        ${opts.extra ? `<div class="cr-card">${opts.extra}</div>` : ''}
      </div>
    </div>`;
  root.querySelector('.cr-back')!.addEventListener('click', () => void returnToMachine());
  root.querySelector('[data-start]')!.addEventListener('click', () => opts.onStart());
  return onKeys((k, e) => {
    if (k === 'Escape') void returnToMachine();
    else if (k === 'Enter' && (e.target as HTMLElement)?.tagName !== 'BUTTON') opts.onStart();
  });
}
