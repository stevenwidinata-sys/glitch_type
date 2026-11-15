import '../styles/game.css';
import '../styles/pages.css';
import type { Screen } from '../router';
import { store, type RunRecord } from '../core/storage';
import { streak } from '../core/stats';
import { ACHIEVEMENTS } from '../core/achievements';
import { createKeyboard } from './keyboard';
import { weakestKeys } from './lessons-page';

const MODE_NAMES: Record<string, string> = {
  'bh-endless': 'Black Hole · Endless',
  'bh-campaign': 'Black Hole · Campaign',
  'repair-survival': 'Repair · Survival',
  'repair-timed': 'Repair · Timed',
  lesson: 'Lesson',
};

function avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

function drawChart(cv: HTMLCanvasElement, runs: RunRecord[]): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const pad = { l: 36, r: 36, t: 10, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxW = Math.max(40, ...runs.map((r) => r.wpm)) * 1.15;
  const x = (i: number) => pad.l + (runs.length <= 1 ? iw / 2 : (i / (runs.length - 1)) * iw);
  const yW = (v: number) => pad.t + ih - (v / maxW) * ih;
  const yA = (v: number) => pad.t + ih - (v / 100) * ih;

  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = '#9a86b8';
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = (maxW / 4) * i;
    const y = yW(v);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(W - pad.r, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(v)), pad.l - 6, y + 3);
    ctx.textAlign = 'left';
    ctx.fillText(`${i * 25}%`, W - pad.r + 6, yA(i * 25) + 3);
  }
  if (!runs.length) return;

  const line = (vals: number[], y: (v: number) => number, color: string, width: number, fill: boolean) => {
    ctx.beginPath();
    vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (fill) {
      ctx.lineTo(x(vals.length - 1), pad.t + ih);
      ctx.lineTo(x(0), pad.t + ih);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
      g.addColorStop(0, 'rgba(255,43,214,0.28)');
      g.addColorStop(1, 'rgba(255,43,214,0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
  };
  line(runs.map((r) => r.acc), yA, 'rgba(0,240,255,0.55)', 1.5, false);
  line(runs.map((r) => r.wpm), yW, '#ff2bd6', 2.5, true);
  runs.forEach((r, i) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x(i), yW(r.wpm), 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

export const statsScreen: Screen = (root) => {
  const h = store.history;
  const recent = h.slice(-50);
  const last10 = h.slice(-10);
  const bestWpm = Math.max(0, ...h.map((r) => r.wpm));
  const totalChars = h.reduce((a, r) => a + r.chars, 0);
  const weak = weakestKeys(6);
  const unlocked = ACHIEVEMENTS.filter((a) => store.achievements[a.id]).length;

  root.innerHTML = `
    <div class="page">
      <div class="page-head">
        <a class="back" href="#/">← claw machine</a>
        <div>
          <h1 class="page-title glitch" data-text="STATS">STATS</h1>
          <p class="page-sub">// saved only in this browser. no account, no server.</p>
        </div>
      </div>
      <div class="stat-cards">
        <div class="stat-card hl"><span class="label">best wpm</span><b>${bestWpm}</b></div>
        <div class="stat-card"><span class="label">avg wpm (last 10)</span><b>${avg(last10.map((r) => r.wpm))}</b></div>
        <div class="stat-card"><span class="label">avg accuracy</span><b>${avg(last10.map((r) => r.acc))}%</b></div>
        <div class="stat-card"><span class="label">day streak</span><b>🔥 ${streak()}</b></div>
        <div class="stat-card"><span class="label">runs</span><b>${h.length}</b></div>
        <div class="stat-card"><span class="label">chars typed</span><b>${totalChars.toLocaleString()}</b></div>
      </div>
      <div class="panel">
        <h2 class="section-title">PROGRESS · LAST ${recent.length} RUNS</h2>
        <div class="chart-legend"><span><i style="background:#ff2bd6"></i>WPM (left)</span><span><i style="background:#00f0ff"></i>accuracy (right)</span></div>
        ${h.length ? '<div class="chart-wrap"><canvas aria-label="WPM and accuracy over your recent runs"></canvas></div>' : '<div class="empty">No runs yet. Grab a crate from the claw machine and play!</div>'}
      </div>
      <div class="panel" style="margin-top:18px">
        <h2 class="section-title">WEAK-KEY HEATMAP</h2>
        <p class="muted" style="margin:0 0 14px;font-size:13px">Redder keys get missed more. The number is your miss rate.</p>
        <div data-kb></div>
        ${
          weak.length
            ? `<div class="weak-list">${weak.map((w) => `<span>${w.key.toUpperCase()}<small>${Math.round(w.rate * 100)}%</small></span>`).join('')}</div>
               <a class="btn pink" href="#/lessons/play?keys=${weak.map((w) => w.key).join('')}">Practice these keys</a>`
            : '<p class="muted" style="font-size:13px;text-align:center">Type a bit more to find your weak keys.</p>'
        }
      </div>
      <div class="two-col">
        <div class="panel">
          <h2 class="section-title">ACHIEVEMENTS · ${unlocked}/${ACHIEVEMENTS.length}</h2>
          <div class="ach-grid">
            ${ACHIEVEMENTS.map(
              (a) => `<div class="ach ${store.achievements[a.id] ? 'on' : ''}"><div class="i">${a.icon}</div><b>${a.name}</b><span>${a.desc}</span></div>`,
            ).join('')}
          </div>
        </div>
        <div class="panel">
          <h2 class="section-title">RECENT RUNS</h2>
          ${
            h.length
              ? `<table class="runs"><thead><tr><th>mode</th><th>wpm</th><th>acc</th><th>score</th><th>when</th></tr></thead><tbody>
                ${[...h]
                  .slice(-12)
                  .reverse()
                  .map(
                    (r) =>
                      `<tr><td>${MODE_NAMES[r.mode] ?? r.mode}</td><td>${r.wpm}</td><td>${r.acc}%</td><td>${r.score}</td><td>${new Date(r.t).toLocaleDateString()}</td></tr>`,
                  )
                  .join('')}</tbody></table>`
              : '<div class="empty">Nothing here yet.</div>'
          }
        </div>
      </div>
    </div>`;

  const kb = createKeyboard();
  const heat: Record<string, number> = {};
  const labels: Record<string, string> = {};
  for (const [k, s] of Object.entries(store.keyStats)) {
    const total = s.hit + s.miss;
    if (total < 3) continue;
    const rate = s.miss / total;
    heat[k] = Math.min(1, rate / 0.25);
    labels[k] = `${Math.round(rate * 100)}`;
  }
  kb.heat(heat, labels);
  root.querySelector('[data-kb]')!.append(kb.el);

  const cv = root.querySelector('canvas');
  if (cv) {
    const draw = () => drawChart(cv, recent);
    requestAnimationFrame(draw);
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }
};
