// Visual corruption: random characters in not-yet-repaired words flicker
// into glitch symbols for a moment. Purely cosmetic: the real text stays intact.
import type { TypingText } from '../../ui/typing-text';

const GLYPHS = '█▓▒░#@%&$¥Ø∆§¤╳◊※';

export class Corruption {
  private timer = 0;
  private swaps: { el: HTMLSpanElement; orig: string; until: number }[] = [];

  constructor(private tt: TypingText) {}

  /** intensity 0..1 controls how many characters flicker */
  tick(dt: number, intensity: number): void {
    const now = performance.now();
    // restore expired swaps
    for (let i = this.swaps.length - 1; i >= 0; i--) {
      const s = this.swaps[i];
      if (now >= s.until) {
        s.el.textContent = s.orig;
        s.el.classList.remove('glitched');
        this.swaps.splice(i, 1);
      }
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.06;
    const n = Math.round(1 + intensity * 7);
    const start = this.tt.index + 1;
    const end = Math.min(this.tt.words.length, start + 40);
    if (end <= start) return;
    for (let k = 0; k < n; k++) {
      const w = this.tt.wordEl(start + Math.floor(Math.random() * (end - start)));
      if (!w) continue;
      const chars = w.querySelectorAll<HTMLSpanElement>('.c');
      if (!chars.length) continue;
      const el = chars[Math.floor(Math.random() * chars.length)];
      if (el.classList.contains('glitched')) continue;
      this.swaps.push({ el, orig: el.textContent ?? '', until: now + 80 + Math.random() * 160 });
      el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      el.classList.add('glitched');
    }
  }

  /** restore everything (call before the current word changes) */
  clear(): void {
    for (const s of this.swaps) {
      s.el.textContent = s.orig;
      s.el.classList.remove('glitched');
    }
    this.swaps = [];
  }
}
