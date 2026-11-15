import '../styles/game.css';
import '../styles/pages.css';
import type { Screen } from '../router';
import { navigate } from '../router';
import { decodeChallenge } from '../core/share';
import { onKeys } from '../core/input';

const ALLOWED = new Set(['/blackhole/play', '/repair/play']);

export const challengeScreen: Screen = (root, params) => {
  const c = decodeChallenge(params.get('d'));
  if (!c || !ALLOWED.has(c.r)) {
    root.innerHTML = `<div class="challenge"><div class="panel"><h2 class="result-title lose">BROKEN LINK</h2><p class="muted">This challenge link is corrupted beyond repair.</p><a class="btn" href="#/">Go to the claw machine</a></div></div>`;
    return;
  }
  const q = new URLSearchParams(c.q);
  q.set('beat', String(c.s));
  q.delete('daily');
  const target = `${c.r}?${q.toString()}`;

  const wrap = document.createElement('div');
  wrap.className = 'challenge';
  wrap.innerHTML = `
    <div class="panel">
      <span class="label">incoming transmission</span>
      <h2 class="result-title" style="color:var(--yellow)">YOU'VE BEEN CHALLENGED</h2>
      <p class="muted">A friend played <b style="color:var(--text)"></b> and scored</p>
      <div class="score"></div>
      <p class="muted unit"></p>
      <p class="muted" style="font-size:13px">You get the exact same round. Beat their score.</p>
      <div class="result-actions" style="margin-top:24px">
        <button class="btn pink" type="button">Accept challenge <span class="k">↵</span></button>
        <a class="btn ghost" href="#/">Nah</a>
      </div>
    </div>`;
  wrap.querySelector('p b')!.textContent = c.n;
  wrap.querySelector('.score')!.textContent = String(c.s);
  wrap.querySelector('.unit')!.textContent = c.u;
  root.append(wrap);
  const go = () => navigate(target);
  wrap.querySelector('button')!.addEventListener('click', go);
  return onKeys((k) => {
    if (k === 'Enter') go();
  });
};
