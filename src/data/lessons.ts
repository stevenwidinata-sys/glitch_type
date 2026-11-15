import type { Lang } from '../core/storage';
import { mulberry32, pick, type Rng } from '../core/rng';
import { WORDS_EN } from './words-en';
import { WORDS_ID } from './words-id';
import { STORIES_EN } from './stories-en';
import { STORIES_ID } from './stories-id';

export function wordsFor(lang: Lang): string[] {
  return lang === 'id' ? WORDS_ID : WORDS_EN;
}

export function storiesFor(lang: Lang) {
  return lang === 'id' ? STORIES_ID : STORIES_EN;
}

export interface Lesson {
  id: string;
  title: string;
  desc: string;
  keys: string; // the keys this lesson drills
  pool: string; // all keys allowed in generated words
}

const HOME = 'asdfghjkl';
const TOP = 'qwertyuiop';
const BOTTOM = 'zxcvbnm';

export const LESSONS: Lesson[] = [
  { id: 'home-1', title: 'Home Row I', desc: 'F and J anchors: a s d f j k l', keys: 'asdfjkl', pool: 'asdfjkl' },
  { id: 'home-2', title: 'Home Row II', desc: 'Add G and H in the middle', keys: 'gh', pool: HOME },
  { id: 'top-1', title: 'Top Row I', desc: 'E R U I with the home row', keys: 'eriu', pool: HOME + 'eriu' },
  { id: 'top-2', title: 'Top Row II', desc: 'The whole top row', keys: TOP, pool: HOME + TOP },
  { id: 'bottom-1', title: 'Bottom Row I', desc: 'C V N M reach down', keys: 'cvnm', pool: HOME + TOP + 'cvnm' },
  { id: 'bottom-2', title: 'Bottom Row II', desc: 'The whole bottom row', keys: BOTTOM, pool: HOME + TOP + BOTTOM },
  { id: 'all', title: 'All Letters', desc: 'Real words using every letter', keys: HOME + TOP + BOTTOM, pool: HOME + TOP + BOTTOM },
  { id: 'caps', title: 'Capitals', desc: 'Shift with the opposite pinky', keys: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', pool: '' },
  { id: 'punct', title: 'Punctuation', desc: 'Commas, periods, and friends', keys: ",.;'?!", pool: '' },
  { id: 'numbers', title: 'Numbers', desc: 'The number row 1 to 0', keys: '1234567890', pool: '' },
  { id: 'symbols', title: 'Symbols', desc: 'Coder mode: brackets and operators', keys: '()[]{}<>=+-*/_#@$%&', pool: '' },
];

function fakeWord(rng: Rng, keys: string, min = 2, max = 5): string {
  const len = min + Math.floor(rng() * (max - min + 1));
  let w = '';
  for (let i = 0; i < len; i++) w += keys[Math.floor(rng() * keys.length)];
  return w;
}

/** Builds a list of drill words for a lesson (or a custom key set). */
export function lessonWords(lesson: Lesson, lang: Lang, seed: number, count = 30): string[] {
  const rng = mulberry32(seed);
  const words = wordsFor(lang);
  const out: string[] = [];
  if (lesson.id === 'caps') {
    for (let i = 0; i < count; i++) {
      const w = pick(rng, words);
      out.push(w[0].toUpperCase() + w.slice(1));
    }
    return out;
  }
  if (lesson.id === 'punct') {
    const marks = [',', '.', ';', '?', '!', "'s", ':'];
    for (let i = 0; i < count; i++) {
      const w = pick(rng, words);
      out.push(rng() < 0.6 ? w + pick(rng, marks) : w);
    }
    return out;
  }
  if (lesson.id === 'numbers') {
    for (let i = 0; i < count; i++) out.push(String(Math.floor(rng() * 10 ** (1 + Math.floor(rng() * 4)))));
    return out;
  }
  if (lesson.id === 'symbols') {
    const snippets = ['()', '[]', '{}', '<>', 'a=b', 'x+y', 'i++', 'n-1', 'a*b', 'x/2', '#tag', '@me', '$5', '50%', 'a&b', 'my_var', '=>', '!=', '<=', '>=', '[0]', '{x}', 'f(x)', '#1', '10%'];
    for (let i = 0; i < count; i++) out.push(pick(rng, snippets));
    return out;
  }
  // real words that only use the allowed keys, focusing on the new keys
  const pool = new Set(lesson.pool);
  const focus = new Set(lesson.keys);
  const real = words.filter((w) => [...w].every((c) => pool.has(c)) && [...w].some((c) => focus.has(c)));
  for (let i = 0; i < count; i++) {
    if (real.length >= 6 && rng() < 0.6) out.push(pick(rng, real));
    else out.push(fakeWord(rng, rng() < 0.6 ? lesson.keys : lesson.pool));
  }
  return out;
}

/** A custom lesson built from your weakest keys. */
export function customLesson(keys: string): Lesson {
  const k = [...new Set(keys.toLowerCase().replace(/[^a-z]/g, ''))].join('') || 'asdf';
  return { id: 'custom', title: 'Weak Keys', desc: `Drill: ${k.toUpperCase().split('').join(' ')}`, keys: k, pool: HOME + TOP + BOTTOM };
}
