// Shared keyboard listener used by every typing screen.

export type KeyHandler = (key: string, e: KeyboardEvent) => void;

const PASS_THROUGH = new Set(['Backspace', 'Escape', 'Enter', 'Tab']);

/**
 * Listen for printable keys plus Backspace/Escape/Enter.
 * Ignores modifier shortcuts (Ctrl+R etc.) and IME composition.
 * Returns an unsubscribe function.
 */
export function onKeys(handler: KeyHandler): () => void {
  const listener = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    const k = e.key;
    if (k.length !== 1 && !PASS_THROUGH.has(k)) return;
    if (k === 'Tab') return;
    // stop page scroll on space, Firefox quick-find on ' and /, back-navigation on Backspace
    if (k === ' ' || k === "'" || k === '/' || k === 'Backspace') e.preventDefault();
    handler(k, e);
  };
  window.addEventListener('keydown', listener);
  return () => window.removeEventListener('keydown', listener);
}
