// Boss Duel: type attack words to hit the boss, type BLOCK words before its attacks land.
import '../../styles/boss.css';
import { mulberry32, pick, type Rng } from '../../core/rng';
import { onKeys } from '../../core/input';
import { sfx } from '../../core/audio';
import { store } from '../../core/storage';
import { recordKey, calcAcc } from '../../core/stats';
import { WORDS_EN } from '../../data/words-en';
import { BOSSES, hydraHeadPos, type BossDef, type BossView } from './bosses';

export interface DuelResult {
  win: boolean;
  ms: number;
  wpm: number;
  acc: number;
  chars: number;
  maxCombo: number;
  hpLeft: number;
  blocks: number;
  blocksFailed: number;
}

interface Target {
  word: string;
  typed: number;
  head: number; // hydra head index (0 otherwise)
  clean: boolean; // no mistakes yet
  kind: 'attack' | 'breach';
}

interface Block {
  word: string;
  typed: number;
  left: number;
  total: number;
  remaining: number; // extra block words after this one (kernel double attack)
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Bolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  color: string;
}

const PLAYER_MAX = 100;

export function runDuel(root: HTMLElement, bossN: number, seed: number, onEnd: (r: DuelResult) => void): { destroy(): void } {
  const def: BossDef = BOSSES[bossN - 1];
  const rng: Rng = mulberry32(seed);
  root.innerHTML = `
    <div class="duel" style="--bc:${def.color}">
      <canvas class="bd-canvas"></canvas>
      <div class="bd-top">
        <div class="bd-name"><b>${def.name}</b><span>${def.title}</span></div>
        <div class="bd-hp"><div class="bd-hp-fill" data-h="bhp"></div><div class="bd-hp-ghost" data-h="bhpg"></div></div>
        <button class="hud-btn" data-h="quit" type="button">ESC quit</button>
      </div>
      <div class="bd-player">
        <span class="label">your hp</span>
        <div class="bd-php"><div data-h="php"></div></div>
        <span class="bd-combo" data-h="combo"></span>
      </div>
      <div class="bd-words">
        <div class="bd-block hidden" data-h="block">
          <span class="bd-tag">BLOCK!</span>
          <div class="bd-word" data-h="blockword"></div>
          <div class="bd-timer"><div data-h="blocktimer"></div></div>
        </div>
        <div class="bd-attacks" data-h="attacks"></div>
      </div>
    </div>`;

  const wrap = root.querySelector<HTMLDivElement>('.duel')!;
  const cv = root.querySelector<HTMLCanvasElement>('.bd-canvas')!;
  const ctx = cv.getContext('2d')!;
  const h = (k: string) => root.querySelector<HTMLElement>(`[data-h="${k}"]`)!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  const resize = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  // ---- words ----
  const byLen = new Map<number, string[]>();
  for (const w of WORDS_EN) {
    if (!byLen.has(w.length)) byLen.set(w.length, []);
    byLen.get(w.length)!.push(w);
  }
  const used = new Set<string>();
  function word([min, max]: [number, number], avoidFirst: string[] = []): string {
    for (let tries = 0; tries < 30; tries++) {
      const len = min + Math.floor(rng() * (max - min + 1));
      const list = byLen.get(len);
      if (!list?.length) continue;
      const w = pick(rng, list);
      if (used.has(w) || avoidFirst.includes(w[0])) continue;
      used.add(w);
      if (used.size > 60) used.clear();
      return w;
    }
    return pick(rng, WORDS_EN);
  }

  // ---- state ----
  const heads = def.heads ?? 1;
  const headHp = Array.from({ length: heads }, () => def.hp / heads);
  const bossHp = () => headHp.reduce((a, b) => a + Math.max(0, b), 0);
  let shownHp = def.hp;
  let playerHp = PLAYER_MAX;
  let targets: Target[] = [];
  let locked: Target | null = null;
  let block: Block | null = null;
  let nextAttack = def.interval * 0.8;
  let shieldTimer = def.shieldEvery ?? 0;
  let shield = false;
  let phase: 'intro' | 'fight' | 'dying' | 'over' = 'intro';
  let introT = 2.2;
  let dyingT = 0;
  let fightMs = 0;
  let combo = 0;
  let maxCombo = 0;
  let correct = 0;
  let total = 0;
  let chars = 0;
  let blocks = 0;
  let blocksFailed = 0;
  let hurt = 0;
  let playerHurt = 0;
  let shieldFx = 0;
  let shake = 0;
  let phantomX = 0;
  let phantomTimer = 3;
  const floats: FloatText[] = [];
  const bolts: Bolt[] = [];
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];

  function spawnTargets(): void {
    if (shield) {
      targets = [{ word: word([7, 9]), typed: 0, head: 0, clean: true, kind: 'breach' }];
      locked = null;
      return;
    }
    const firsts: string[] = [];
    targets = [];
    for (let i = 0; i < heads; i++) {
      if (headHp[i] <= 0) continue;
      const w = word(def.attackLen, firsts);
      firsts.push(w[0]);
      targets.push({ word: w, typed: 0, head: i, clean: true, kind: 'attack' });
    }
    locked = null;
  }
  spawnTargets();

  function replaceTarget(t: Target): void {
    const firsts = targets.filter((x) => x !== t).map((x) => x.word[0]);
    t.word = word(def.attackLen, firsts);
    t.typed = 0;
    t.clean = true;
  }

  // ---- geometry ----
  const bossPos = () => ({ x: W / 2, y: H * 0.43, s: Math.min(W * 0.55, H * 0.56) });
  const heroPos = () => ({ x: W * 0.16, y: H * 0.8 });
  function targetPos(t: Target) {
    const b = bossPos();
    if (def.heads) return hydraHeadPos(b.x, b.y, b.s, t.head, performance.now() / 1000);
    return { x: b.x + phantomX * b.s, y: b.y };
  }

  // ---- combat ----
  const mult = () => 1 + Math.min(1, Math.floor(combo / 12) * 0.25);

  function hitBoss(t: Target): void {
    const p = targetPos(t);
    const hero = heroPos();
    bolts.push({ x1: hero.x + 20, y1: hero.y - 40, x2: p.x, y2: p.y, life: 0.25, color: '#00f0ff' });
    if (t.kind === 'breach') {
      shield = false;
      shieldTimer = def.shieldEvery ?? 0;
      floats.push({ x: p.x, y: p.y - 40, text: 'SHIELD DOWN', color: '#ffe94a', life: 1.2 });
      sfx.explode(true);
      shake = 12;
      spawnTargets();
      return;
    }
    let dmg = Math.round(t.word.length * 1.6 * mult() * (t.clean ? 1.2 : 1));
    const crit = t.clean && t.word.length >= 6;
    if (crit) dmg = Math.round(dmg * 1.3);
    headHp[t.head] -= dmg;
    hurt = 1;
    shake = Math.max(shake, crit ? 10 : 5);
    floats.push({ x: p.x + (Math.random() - 0.5) * 60, y: p.y - 30, text: `${crit ? 'CRIT ' : ''}-${dmg}`, color: crit ? '#ffe94a' : '#fff', life: 1 });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 0.6, color: def.color });
    }
    sfx.explode(false);
    if (headHp[t.head] <= 0 && def.heads) {
      floats.push({ x: p.x, y: p.y - 60, text: 'HEAD DOWN', color: '#ff2bd6', life: 1.2 });
      targets = targets.filter((x) => x !== t);
      if (locked === t) locked = null;
    } else {
      replaceTarget(t);
    }
    if (locked === t) locked = null;
    if (bossHp() <= 0) {
      phase = 'dying';
      dyingT = 0;
      block = null;
      sfx.win();
    }
  }

  function startBlock(): void {
    const remaining = def.double && rng() < 0.35 ? 1 : 0;
    const tt = def.windup * (bossHp() < def.hp * 0.5 ? 0.85 : 1);
    block = { word: word(def.blockLen), typed: 0, left: tt, total: tt, remaining };
    sfx.alarm();
  }

  function blockDone(): void {
    if (!block) return;
    blocks++;
    shieldFx = 0.6;
    sfx.block();
    const b = bossPos();
    floats.push({ x: heroPos().x, y: heroPos().y - 90, text: 'BLOCKED', color: '#00f0ff', life: 1 });
    headHp.forEach((v, i) => {
      if (v > 0) headHp[i] = v - 3;
    });
    floats.push({ x: b.x, y: b.y - 40, text: '-3', color: '#9ff', life: 0.8 });
    if (block.remaining > 0) {
      const tt = block.total * 0.75;
      block = { word: word(def.blockLen), typed: 0, left: tt, total: tt, remaining: block.remaining - 1 };
      sfx.alarm();
    } else {
      block = null;
      nextAttack = def.interval * (bossHp() < def.hp * 0.5 ? 0.75 : 1);
    }
    if (bossHp() <= 0) {
      phase = 'dying';
      block = null;
    }
  }

  function blockFail(): void {
    if (!block) return;
    blocksFailed++;
    playerHp -= def.damage * (block.remaining + 1);
    playerHurt = 1;
    shake = 18;
    combo = 0;
    sfx.hurt();
    const hero = heroPos();
    const b = bossPos();
    bolts.push({ x1: b.x, y1: b.y, x2: hero.x, y2: hero.y - 30, life: 0.35, color: '#ff2b4d' });
    floats.push({ x: hero.x, y: hero.y - 90, text: `-${def.damage * (block.remaining + 1)}`, color: '#ff2b4d', life: 1 });
    block = null;
    nextAttack = def.interval;
    if (playerHp <= 0) {
      playerHp = 0;
      phase = 'over';
      sfx.gameOver();
      setTimeout(() => finish(false), 1200);
    }
  }

  function miss(expected?: string): void {
    total++;
    if (expected) recordKey(expected, false);
    combo = 0;
    sfx.error();
    wrap.classList.remove('miss');
    void wrap.offsetWidth;
    wrap.classList.add('miss');
  }

  function good(expected: string): void {
    total++;
    correct++;
    chars++;
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    recordKey(expected, true);
    sfx.key();
  }

  function onChar(ch: string): void {
    if (phase !== 'fight') return;
    if (block) {
      const exp = block.word[block.typed];
      if (ch === exp) {
        good(exp);
        block.typed++;
        if (block.typed >= block.word.length) blockDone();
      } else miss(exp);
      return;
    }
    if (locked) {
      const exp = locked.word[locked.typed];
      if (ch === exp) {
        good(exp);
        locked.typed++;
        if (locked.typed >= locked.word.length) hitBoss(locked);
      } else {
        locked.clean = false;
        miss(exp);
      }
      return;
    }
    const t = targets.find((x) => x.word[0] === ch);
    if (t) {
      good(ch);
      t.typed = 1;
      locked = t;
      if (t.typed >= t.word.length) hitBoss(t);
    } else miss(targets[0]?.word[0]);
  }

  const offKeys = onKeys((k) => {
    if (k === 'Escape') {
      quit();
      return;
    }
    if (k === 'Backspace') {
      if (locked && !block) {
        locked.typed = 0;
        locked = null;
      }
      return;
    }
    if (k.length !== 1 || k === ' ') return;
    onChar(k.toLowerCase());
  });
  let quitting = false;
  function quit(): void {
    if (quitting) return;
    quitting = true;
    location.hash = '#/boss';
  }
  h('quit').addEventListener('click', quit);

  let ended = false;
  function finish(win: boolean): void {
    if (ended) return;
    ended = true;
    onEnd({
      win,
      ms: fightMs,
      wpm: fightMs > 0 ? Math.round(chars / 5 / (fightMs / 60000)) : 0,
      acc: calcAcc(correct, total),
      chars,
      maxCombo,
      hpLeft: Math.max(0, Math.round(playerHp)),
      blocks,
      blocksFailed,
    });
  }

  // ---- DOM words ----
  function wordHtml(w: string, typed: number, lag: boolean): string {
    return [...w]
      .map((c, i) => {
        const cls = i < typed ? 'd' : i === typed ? 'n' : '';
        const delay = lag ? ` style="animation-delay:${((i * 0.37 + w.length) % 1.3).toFixed(2)}s"` : '';
        return `<span class="${cls}"${delay}>${c}</span>`;
      })
      .join('');
  }

  let lastDom = '';
  function paintDom(): void {
    const blockKey = block ? `${block.word}:${block.typed}` : '-';
    const tKey = targets.map((t) => `${t.word}:${t.typed}:${t === locked}`).join('|');
    const key = `${blockKey}#${tKey}#${shield}`;
    if (key !== lastDom) {
      lastDom = key;
      h('block').classList.toggle('hidden', !block);
      if (block) h('blockword').innerHTML = wordHtml(block.word, block.typed, !!def.lag);
      h('attacks').innerHTML = targets
        .map((t) => {
          const label = t.kind === 'breach' ? 'BREAK SHIELD' : def.heads ? `HEAD ${t.head + 1}` : 'ATTACK';
          return `<div class="bd-attack ${t === locked ? 'locked' : ''} ${t.kind} ${block ? 'dim' : ''}"><span class="bd-tag">${label}</span><div class="bd-word ${def.lag ? 'lag' : ''}">${wordHtml(t.word, t.typed, !!def.lag)}</div></div>`;
        })
        .join('');
    }
    if (block) h('blocktimer').style.width = `${(block.left / block.total) * 100}%`;
    const hpPct = (bossHp() / def.hp) * 100;
    shownHp += (bossHp() - shownHp) * 0.06;
    h('bhp').style.width = `${Math.max(0, hpPct)}%`;
    h('bhpg').style.width = `${Math.max(0, (shownHp / def.hp) * 100)}%`;
    h('php').style.width = `${(playerHp / PLAYER_MAX) * 100}%`;
    h('combo').textContent = combo >= 5 ? `COMBO ${combo} · x${mult().toFixed(2)}` : '';
  }

  // ---- render ----
  function drawHero(t: number): void {
    const p = heroPos();
    const s = Math.min(W, H) * 0.16;
    ctx.save();
    ctx.translate(p.x + (playerHurt > 0 ? (Math.random() - 0.5) * 10 : 0), p.y + Math.sin(t * 3) * 3);
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#16052c';
    ctx.strokeStyle = playerHurt > 0.3 ? '#ff2b4d' : '#ff2bd6';
    ctx.lineWidth = 3;
    // body
    ctx.beginPath();
    ctx.roundRect(-s * 0.22, -s * 0.55, s * 0.44, s * 0.45, 8);
    ctx.fill();
    ctx.stroke();
    // head visor
    ctx.beginPath();
    ctx.roundRect(-s * 0.18, -s * 0.9, s * 0.36, s * 0.3, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.fillRect(-s * 0.12, -s * 0.8, s * 0.24, s * 0.07);
    // keyboard cannon
    ctx.fillStyle = '#2a0b4d';
    ctx.strokeStyle = '#00f0ff';
    ctx.beginPath();
    ctx.roundRect(s * 0.1, -s * 0.45, s * 0.42, s * 0.12, 4);
    ctx.fill();
    ctx.stroke();
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k === Math.floor(t * 8) % 5 ? '#ffe94a' : '#00f0ff';
      ctx.fillRect(s * 0.14 + k * s * 0.07, -s * 0.42, s * 0.045, s * 0.05);
    }
    // legs
    ctx.strokeStyle = '#ff2bd6';
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.1);
    ctx.lineTo(-s * 0.14, 0);
    ctx.moveTo(s * 0.1, -s * 0.1);
    ctx.lineTo(s * 0.14, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (shieldFx > 0) {
      ctx.strokeStyle = `rgba(0,240,255,${shieldFx * 1.5})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2 + t;
        const r = s * 0.75;
        if (k === 0) ctx.moveTo(Math.cos(a) * r, -s * 0.45 + Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, -s * 0.45 + Math.sin(a) * r);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function render(t: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shake > 0.3 && !store.settings.reducedMotion) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    // arena
    const bg = ctx.createRadialGradient(W / 2, H * 0.38, 10, W / 2, H * 0.4, Math.max(W, H) * 0.7);
    bg.addColorStop(0, `${def.color}33`);
    bg.addColorStop(0.5, '#0b0018');
    bg.addColorStop(1, '#030006');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // floor grid
    const fy = H * 0.68;
    ctx.strokeStyle = `${def.color}40`;
    ctx.lineWidth = 1;
    for (let i = -14; i <= 14; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 30, fy);
      ctx.lineTo(W / 2 + i * 150, H);
      ctx.stroke();
    }
    for (let k = 0; k < 10; k++) {
      const y = fy + Math.pow(k / 10, 1.8) * (H - fy) + ((t * 20) % 8);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // boss
    const b = bossPos();
    const view: BossView = {
      t,
      hurt,
      windup: block ? 1 - block.left / block.total : 0,
      shield,
      heads: headHp.map((v) => v > 0),
      dying: phase === 'dying' ? dyingT : 0,
      offsetX: phantomX,
    };
    ctx.save();
    if (phase === 'dying') {
      ctx.globalAlpha = Math.max(0, 1 - dyingT);
      ctx.translate((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
    }
    if (phase === 'intro') {
      const k = Math.min(1, (2.2 - introT) / 1.2);
      ctx.globalAlpha = k;
      ctx.translate(0, (1 - k) * -H * 0.3);
    }
    def.draw(ctx, b.x, b.y, b.s, view);
    if (hurt > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = hurt * 0.4;
      def.draw(ctx, b.x, b.y, b.s, view);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    // lock marker
    if (locked && phase === 'fight') {
      const p = targetPos(locked);
      ctx.strokeStyle = '#ffe94a';
      ctx.lineWidth = 2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(t * 2);
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.arc(0, 0, b.s * 0.14, -0.3, 0.3);
        ctx.stroke();
      }
      ctx.restore();
    }
    drawHero(t);
    for (const bo of bolts) {
      ctx.strokeStyle = bo.color;
      ctx.globalAlpha = Math.min(1, bo.life * 4);
      ctx.lineWidth = 5;
      ctx.shadowColor = bo.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(bo.x1, bo.y1);
      const mx = (bo.x1 + bo.x2) / 2 + (Math.random() - 0.5) * 30;
      const my = (bo.y1 + bo.y2) / 2 + (Math.random() - 0.5) * 30;
      ctx.lineTo(mx, my);
      ctx.lineTo(bo.x2, bo.y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life / 0.6);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const f of floats) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = `900 ${f.text.length > 6 ? 22 : 30}px Orbitron, sans-serif`;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (playerHurt > 0) {
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(255,0,40,0)');
      v.addColorStop(1, `rgba(255,0,40,${playerHurt * 0.5})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
    if (phase === 'intro') {
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.min(64, W * 0.08)}px Orbitron, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 30;
      ctx.fillText(introT > 0.7 ? `BOSS ${def.n}` : 'FIGHT!', W / 2, H * 0.72);
      ctx.shadowBlur = 0;
    }
  }

  // ---- loop ----
  let raf = 0;
  let last = performance.now();
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    if (phase === 'intro') {
      introT -= dt;
      if (introT <= 0) {
        phase = 'fight';
        sfx.beep(true);
      }
    } else if (phase === 'fight') {
      fightMs += dt * 1000;
      if (block) {
        block.left -= dt;
        if (block.left <= 0) blockFail();
      } else {
        nextAttack -= dt;
        if (nextAttack <= 0) startBlock();
      }
      if (def.shieldEvery && !shield && !block) {
        shieldTimer -= dt;
        if (shieldTimer <= 0) {
          shield = true;
          floats.push({ x: W / 2, y: H * 0.2, text: 'SHIELD UP', color: '#ff7a2b', life: 1.3 });
          sfx.power();
          spawnTargets();
        }
      }
      if (def.lag) {
        phantomTimer -= dt;
        if (phantomTimer <= 0) {
          phantomTimer = 2.5 + rng() * 2;
          phantomX = (rng() - 0.5) * 0.6;
          sfx.whoosh();
        }
      }
    } else if (phase === 'dying') {
      dyingT += dt * 0.7;
      if (dyingT >= 1) {
        phase = 'over';
        setTimeout(() => finish(true), 300);
      }
    }

    hurt = Math.max(0, hurt - dt * 4);
    playerHurt = Math.max(0, playerHurt - dt * 1.5);
    shieldFx = Math.max(0, shieldFx - dt);
    shake *= 0.86;
    for (const f of floats) {
      f.y -= 40 * dt;
      f.life -= dt;
    }
    for (let i = floats.length - 1; i >= 0; i--) if (floats[i].life <= 0) floats.splice(i, 1);
    for (const bo of bolts) bo.life -= dt;
    for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].life <= 0) bolts.splice(i, 1);
    for (const s of sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.93;
      s.vy *= 0.93;
      s.life -= dt;
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
    wrap.classList.toggle('danger', !!block && block.left / block.total < 0.35);
    render(t);
    paintDom();
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      offKeys();
      window.removeEventListener('resize', resize);
    },
  };
}
