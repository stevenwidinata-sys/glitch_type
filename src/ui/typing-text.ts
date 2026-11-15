// Reusable "type the words" text block (Repair mode + Lessons).
// Handles chars, mistakes, extra chars, caret and line scrolling.

export interface TypingCallbacks {
  onStart?(): void;
  onKey?(expected: string | undefined, typed: string, ok: boolean): void;
  onWord?(index: number, ok: boolean): void;
  onDone?(): void;
  onChange?(): void;
}

export class TypingText {
  readonly el: HTMLDivElement;
  private inner: HTMLDivElement;
  private caret: HTMLDivElement;
  private wordEls: HTMLSpanElement[] = [];
  words: string[] = [];
  index = 0;
  typed = '';
  started = false;
  finished = false;
  /** characters of correctly typed words (+1 for each space) */
  correctChars = 0;
  keystrokes = 0;
  correctKeystrokes = 0;
  results: boolean[] = [];

  constructor(words: string[], private cb: TypingCallbacks = {}) {
    this.el = document.createElement('div');
    this.el.className = 'tt';
    this.inner = document.createElement('div');
    this.inner.className = 'tt-inner';
    this.caret = document.createElement('div');
    this.caret.className = 'tt-caret';
    this.inner.append(this.caret);
    this.el.append(this.inner);
    this.append(words);
    this.renderCurrent();
  }

  append(words: string[]): void {
    for (const w of words) {
      const span = document.createElement('span');
      span.className = 'w';
      for (const ch of w) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = ch;
        span.append(c);
      }
      this.wordEls.push(span);
      this.words.push(w);
      this.inner.append(span);
    }
  }

  remaining(): number {
    return this.words.length - this.index;
  }

  wordEl(i: number): HTMLSpanElement | undefined {
    return this.wordEls[i];
  }

  get current(): string {
    return this.words[this.index] ?? '';
  }

  /** the next char the user should type ('' = space/next word) */
  get expected(): string {
    const w = this.current;
    return this.typed.length < w.length ? w[this.typed.length] : ' ';
  }

  handleKey(k: string): void {
    if (this.finished) return;
    if (!this.started) {
      this.started = true;
      this.el.classList.add('typing');
      this.cb.onStart?.();
    }
    const word = this.current;
    if (k === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
    } else if (k === ' ') {
      if (!this.typed) return;
      this.keystrokes++;
      const ok = this.typed === word;
      if (ok) this.correctKeystrokes++;
      this.cb.onKey?.(' ', ' ', ok || this.typed.length >= word.length);
      this.submit();
      return;
    } else if (k.length === 1) {
      if (this.typed.length >= word.length + 8) return;
      const expected = word[this.typed.length];
      const ok = k === expected;
      this.typed += k;
      this.keystrokes++;
      if (ok) this.correctKeystrokes++;
      this.cb.onKey?.(expected, k, ok);
      // last word completes without needing a space
      if (this.index === this.words.length - 1 && this.typed === word) {
        this.submit();
        return;
      }
    } else {
      return;
    }
    this.renderCurrent();
    this.cb.onChange?.();
  }

  private submit(): void {
    const word = this.current;
    const ok = this.typed === word;
    const el = this.wordEls[this.index];
    el.classList.remove('cur');
    el.classList.add(ok ? 'done-ok' : 'done-bad');
    if (ok) this.correctChars += word.length + 1;
    this.results.push(ok);
    const i = this.index;
    this.index++;
    this.typed = '';
    this.cb.onWord?.(i, ok);
    if (this.index >= this.words.length) {
      this.finished = true;
      this.cb.onDone?.();
    }
    this.renderCurrent();
    this.cb.onChange?.();
  }

  renderCurrent(): void {
    const el = this.wordEls[this.index];
    if (!el) {
      this.caret.style.display = 'none';
      return;
    }
    this.caret.style.display = '';
    el.classList.add('cur');
    const word = this.words[this.index];
    el.querySelectorAll('.extra').forEach((x) => x.remove());
    const chars = el.querySelectorAll<HTMLSpanElement>('.c');
    chars.forEach((c, i) => {
      c.textContent = word[i];
      c.className = 'c';
      if (i < this.typed.length) c.classList.add(this.typed[i] === word[i] ? 'ok' : 'no');
    });
    for (let i = word.length; i < this.typed.length; i++) {
      const x = document.createElement('span');
      x.className = 'c extra';
      x.textContent = this.typed[i];
      el.append(x);
    }
    // caret position
    const all = el.querySelectorAll<HTMLSpanElement>('.c');
    let left: number;
    let top: number;
    if (this.typed.length < all.length) {
      const c = all[this.typed.length];
      left = el.offsetLeft + c.offsetLeft;
      top = el.offsetTop + c.offsetTop;
    } else {
      const c = all[all.length - 1];
      left = el.offsetLeft + c.offsetLeft + c.offsetWidth;
      top = el.offsetTop + c.offsetTop;
    }
    const lineH = el.offsetHeight;
    this.caret.style.left = `${left - 1}px`;
    this.caret.style.top = `${top + lineH * 0.18}px`;
    // keep the current line as the second visible line
    const shift = Math.max(0, el.offsetTop - lineH);
    this.inner.style.transform = `translateY(${-shift}px)`;
  }

  /** call after layout changes (resize / font load) */
  relayout(): void {
    this.renderCurrent();
  }
}
