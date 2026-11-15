// Versioned localStorage wrapper. Every read/write is guarded so the app
// still works in private windows or when storage is blocked.

export type Lang = 'en' | 'id';

export interface Settings {
  sound: boolean;
  volume: number; // 0..1
  reducedMotion: boolean;
  lang: Lang;
}

export interface RunRecord {
  mode: string; // e.g. 'bh-endless', 'bh-campaign', 'repair-timed', 'repair-survival', 'lesson'
  t: number; // timestamp
  wpm: number;
  acc: number; // 0..100
  score: number;
  chars: number;
  lang: Lang;
}

export interface KeyStat {
  hit: number;
  miss: number;
}

export interface SaveData {
  v: 1;
  settings: Settings;
  history: RunRecord[];
  keyStats: Record<string, KeyStat>;
  bests: Record<string, number>;
  campaign: { unlocked: number; stars: Record<number, number> };
  daily: Record<string, number>;
  achievements: Record<string, number>;
  practiceDays: string[];
  lessons: Record<string, number>; // lesson id -> best wpm
  seenIntro: boolean;
}

const KEY = 'glitch_type:v1';
const MAX_HISTORY = 300;

function defaults(): SaveData {
  return {
    v: 1,
    settings: {
      sound: true,
      volume: 0.6,
      reducedMotion: false,
      lang: navigator.language?.toLowerCase().startsWith('id') ? 'id' : 'en',
    },
    history: [],
    keyStats: {},
    bests: {},
    campaign: { unlocked: 1, stars: {} },
    daily: {},
    achievements: {},
    practiceDays: [],
    lessons: {},
    seenIntro: false,
  };
}

function load(): SaveData {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (!parsed || parsed.v !== 1) return base;
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      campaign: { ...base.campaign, ...(parsed.campaign ?? {}) },
    };
  } catch {
    return base;
  }
}

export const store: SaveData = load();

let saveQueued = false;

export function save(): void {
  if (store.history.length > MAX_HISTORY) {
    store.history.splice(0, store.history.length - MAX_HISTORY);
  }
  if (saveQueued) return;
  saveQueued = true;
  queueMicrotask(() => {
    saveQueued = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* storage unavailable: keep playing in memory */
    }
  });
}

export function resetAll(): void {
  const fresh = defaults();
  fresh.settings = { ...store.settings };
  fresh.seenIntro = true;
  Object.assign(store, fresh);
  save();
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
