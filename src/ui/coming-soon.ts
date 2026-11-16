import '../styles/game.css';
import type { Screen } from '../router';
import { crateById } from './claw/crates';
import { returnToMachine } from './claw/state';
import { onKeys } from '../core/input';

/** Temporary screen for games that are still being built. */
export function comingSoon(id: string): Screen {
  return (root) => {
    const def = crateById(id);
    root.innerHTML = `
      <div class="need-kb">
        <div class="panel">
          <div class="ico" style="color:${def?.color ?? '#fff'}">${def?.glyph ?? '?'}</div>
          <h2>${def?.label ?? 'GAME'}</h2>
          <p class="muted">This crate is still being packed. Check back soon!</p>
          <div class="actions"><button class="btn" type="button">← Back to the claw machine <span class="k">esc</span></button></div>
        </div>
      </div>`;
    root.querySelector('button')!.addEventListener('click', () => void returnToMachine());
    return onKeys((k) => {
      if (k === 'Escape') void returnToMachine();
    });
  };
}
