import { keyboardConfirmed, confirmKeyboard } from '../core/device';

/**
 * Typing games need a physical keyboard. On touch-only devices we show a
 * friendly notice first (with an escape hatch for tablets with keyboards).
 * Returns true if the game can start right away.
 */
export function guardKeyboard(root: HTMLElement, start: () => void): boolean {
  if (keyboardConfirmed()) return true;
  root.innerHTML = `
    <div class="need-kb">
      <div class="panel">
        <div class="ico">⌨</div>
        <h2>KEYBOARD REQUIRED</h2>
        <p class="muted">glitch_type is a typing trainer, so the games need a physical keyboard. Open this page on a laptop or desktop, or connect a keyboard to your tablet.</p>
        <div class="actions">
          <button class="btn" type="button">I have a keyboard, let me play</button>
          <a class="btn ghost" href="#/">Back to the claw machine</a>
        </div>
      </div>
    </div>`;
  root.querySelector('button')!.addEventListener('click', () => {
    confirmKeyboard();
    root.replaceChildren();
    start();
  });
  return false;
}
