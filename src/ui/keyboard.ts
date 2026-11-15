// On-screen QWERTY keyboard with finger colors, next-key highlight and heatmap.

export type Finger = 'lp' | 'lr' | 'lm' | 'li' | 'ri' | 'rm' | 'rr' | 'rp' | 'th';

export const FINGERS: Record<Finger, { name: string; color: string }> = {
  lp: { name: 'left pinky', color: '#ff2bd6' },
  lr: { name: 'left ring', color: '#b14dff' },
  lm: { name: 'left middle', color: '#4d7cff' },
  li: { name: 'left index', color: '#00f0ff' },
  ri: { name: 'right index', color: '#39ff88' },
  rm: { name: 'right middle', color: '#ffe94a' },
  rr: { name: 'right ring', color: '#ff8a2b' },
  rp: { name: 'right pinky', color: '#ff3860' },
  th: { name: 'thumb', color: '#9a86b8' },
};

const ROWS: [string, Finger][][] = [
  [['`', 'lp'], ['1', 'lp'], ['2', 'lr'], ['3', 'lm'], ['4', 'li'], ['5', 'li'], ['6', 'ri'], ['7', 'ri'], ['8', 'rm'], ['9', 'rr'], ['0', 'rp'], ['-', 'rp'], ['=', 'rp']],
  [['q', 'lp'], ['w', 'lr'], ['e', 'lm'], ['r', 'li'], ['t', 'li'], ['y', 'ri'], ['u', 'ri'], ['i', 'rm'], ['o', 'rr'], ['p', 'rp'], ['[', 'rp'], [']', 'rp']],
  [['a', 'lp'], ['s', 'lr'], ['d', 'lm'], ['f', 'li'], ['g', 'li'], ['h', 'ri'], ['j', 'ri'], ['k', 'rm'], ['l', 'rr'], [';', 'rp'], ["'", 'rp']],
  [['z', 'lp'], ['x', 'lr'], ['c', 'lm'], ['v', 'li'], ['b', 'li'], ['n', 'ri'], ['m', 'ri'], [',', 'rm'], ['.', 'rr'], ['/', 'rp']],
];

const SHIFTED: Record<string, string> = {
  '~': '`', '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  _: '-', '+': '=', '{': '[', '}': ']', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/',
};

const FINGER_OF: Record<string, Finger> = {};
for (const row of ROWS) for (const [k, f] of row) FINGER_OF[k] = f;
FINGER_OF[' '] = 'th';

/** base key + whether shift is needed */
export function baseKey(ch: string): { key: string; shift: boolean } {
  if (ch === ' ') return { key: ' ', shift: false };
  if (SHIFTED[ch]) return { key: SHIFTED[ch], shift: true };
  const lower = ch.toLowerCase();
  return { key: lower, shift: lower !== ch };
}

export function fingerFor(ch: string): Finger | null {
  return FINGER_OF[baseKey(ch).key] ?? null;
}

export interface KeyboardUI {
  el: HTMLDivElement;
  highlight(ch: string | null): void;
  press(ch: string, ok: boolean): void;
  heat(values: Record<string, number>, labels?: Record<string, string>): void;
}

export function createKeyboard(): KeyboardUI {
  const el = document.createElement('div');
  el.className = 'kb';
  const keys = new Map<string, HTMLDivElement>();
  let lshift: HTMLDivElement;
  let rshift: HTMLDivElement;

  ROWS.forEach((row, ri) => {
    const r = document.createElement('div');
    r.className = 'kb-row';
    if (ri === 3) {
      lshift = mk('shift', 'lp', true);
      r.append(lshift);
    }
    for (const [k, f] of row) {
      const key = mk(k === '`' ? '`' : k.toUpperCase(), f);
      keys.set(k, key);
      r.append(key);
    }
    if (ri === 3) {
      rshift = mk('shift', 'rp', true);
      r.append(rshift);
    }
    el.append(r);
  });
  const sr = document.createElement('div');
  sr.className = 'kb-row';
  const space = mk('', 'th');
  space.classList.add('space');
  keys.set(' ', space);
  sr.append(space);
  el.append(sr);

  function mk(label: string, f: Finger, wide = false): HTMLDivElement {
    const d = document.createElement('div');
    d.className = 'kb-key' + (wide ? ' wide' : '');
    d.textContent = label;
    d.style.setProperty('--f', FINGERS[f].color);
    return d;
  }

  let lit: HTMLDivElement[] = [];

  return {
    el,
    highlight(ch) {
      lit.forEach((k) => k.classList.remove('next'));
      lit = [];
      if (ch == null) return;
      const { key, shift } = baseKey(ch);
      const k = keys.get(key);
      if (k) lit.push(k);
      if (shift) {
        const f = FINGER_OF[key];
        lit.push(f && f.startsWith('l') ? rshift : lshift);
      }
      lit.forEach((x) => x.classList.add('next'));
    },
    press(ch, ok) {
      const k = keys.get(baseKey(ch).key);
      if (!k) return;
      const cls = ok ? 'hit-ok' : 'hit-no';
      k.classList.add(cls);
      setTimeout(() => k.classList.remove(cls), 140);
    },
    heat(values, labels) {
      el.classList.add('heatmap');
      for (const [k, node] of keys) {
        const v = values[k] ?? 0;
        node.style.setProperty('--heat', String(Math.min(1, v)));
        node.querySelector('.pct')?.remove();
        if (labels?.[k]) {
          const p = document.createElement('span');
          p.className = 'pct';
          p.textContent = labels[k];
          node.append(p);
        }
      }
    },
  };
}

export function fingerLegend(): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'finger-legend';
  for (const f of Object.values(FINGERS)) {
    const s = document.createElement('span');
    s.innerHTML = `<i style="background:${f.color}"></i>${f.name}`;
    d.append(s);
  }
  return d;
}
