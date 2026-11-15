import { store, save, todayKey, type RunRecord, type Lang } from './storage';
import { unlock } from './achievements';

/** Standard WPM: 5 characters = 1 word. */
export function calcWpm(correctChars: number, ms: number): number {
  if (ms <= 0) return 0;
  return Math.round((correctChars / 5) / (ms / 60000));
}

export function calcAcc(correct: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((correct / total) * 1000) / 10;
}

/** Track hits and misses per key for the weak-key heatmap. */
export function recordKey(expected: string, ok: boolean): void {
  const k = expected.toLowerCase();
  if (k === ' ' || k.length !== 1) return;
  const s = (store.keyStats[k] ??= { hit: 0, miss: 0 });
  if (ok) s.hit++;
  else s.miss++;
}

export function streak(): number {
  const days = new Set(store.practiceDays);
  const d = new Date();
  if (!days.has(todayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(todayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export interface RunInput {
  mode: string;
  wpm: number;
  acc: number;
  score: number;
  chars: number;
  lang: Lang;
}

/** Saves a finished run, updates the streak, and checks stat-based achievements. */
export function recordRun(input: RunInput): RunRecord {
  const run: RunRecord = { ...input, t: Date.now() };
  store.history.push(run);
  const today = todayKey();
  if (!store.practiceDays.includes(today)) store.practiceDays.push(today);
  if (store.practiceDays.length > 400) store.practiceDays.splice(0, store.practiceDays.length - 400);
  save();

  unlock('first_run');
  if (run.chars >= 20) {
    if (run.wpm >= 30) unlock('wpm_30');
    if (run.wpm >= 50) unlock('wpm_50');
    if (run.wpm >= 80) unlock('wpm_80');
    if (run.wpm >= 100) unlock('wpm_100');
  }
  if (run.chars >= 50 && run.acc >= 100) unlock('perfect');
  if (run.lang === 'id') unlock('polyglot');
  if (store.history.length >= 50) unlock('runs_50');
  const s = streak();
  if (s >= 3) unlock('streak_3');
  if (s >= 7) unlock('streak_7');
  return run;
}

/** Returns true if `value` beats the stored best for `key` (and stores it). */
export function submitBest(key: string, value: number): { isBest: boolean; prev: number } {
  const prev = store.bests[key] ?? 0;
  if (value > prev) {
    store.bests[key] = value;
    save();
    return { isBest: true, prev };
  }
  return { isBest: false, prev };
}
