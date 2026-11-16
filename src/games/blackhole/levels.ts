// Campaign levels and endless-wave tuning for Black Hole mode.

export interface WaveDef {
  name: string;
  hint: string;
  letters: string; // letters used for single-letter rocks
  count: number; // rocks in this wave
  fall: number; // seconds for a rock to reach the ground
  interval: number; // seconds between spawns
  wordRatio: number; // 0..1 chance a rock carries a word
  wordLen: [number, number];
  boss: boolean; // a boss rock appears at the end
  powerChance: number;
}

const HOME = 'asdfghjkl';
const TOP = 'qwertyuiop';
const BOTTOM = 'zxcvbnm';
const ALL = HOME + TOP + BOTTOM;

export const CAMPAIGN: WaveDef[] = [
  { name: 'First Contact', hint: 'home row: a s d f j k l', letters: 'asdfjkl', count: 14, fall: 9, interval: 1.6, wordRatio: 0, wordLen: [2, 3], boss: false, powerChance: 0 },
  { name: 'Center Line', hint: 'full home row, G and H join', letters: HOME, count: 18, fall: 8.5, interval: 1.4, wordRatio: 0, wordLen: [2, 3], boss: false, powerChance: 0 },
  { name: 'Reach Up', hint: 'top row letters', letters: TOP, count: 18, fall: 8.5, interval: 1.4, wordRatio: 0, wordLen: [2, 3], boss: false, powerChance: 0 },
  { name: 'Upper Deck', hint: 'home + top rows', letters: HOME + TOP, count: 22, fall: 8, interval: 1.25, wordRatio: 0, wordLen: [2, 3], boss: false, powerChance: 0 },
  { name: 'Low Orbit', hint: 'bottom row + a boss', letters: BOTTOM, count: 20, fall: 8, interval: 1.3, wordRatio: 0, wordLen: [4, 5], boss: true, powerChance: 0 },
  { name: 'Full Spectrum', hint: 'every letter', letters: ALL, count: 26, fall: 7.5, interval: 1.15, wordRatio: 0, wordLen: [2, 3], boss: false, powerChance: 0 },
  { name: 'Meteor Rain', hint: 'faster letters', letters: ALL, count: 30, fall: 6.8, interval: 0.95, wordRatio: 0, wordLen: [2, 3], boss: false, powerChance: 0.04 },
  { name: 'First Words', hint: 'short words appear', letters: ALL, count: 24, fall: 7.5, interval: 1.4, wordRatio: 0.3, wordLen: [2, 3], boss: false, powerChance: 0.05 },
  { name: 'Word Storm', hint: 'half the rocks are words', letters: ALL, count: 26, fall: 7.2, interval: 1.35, wordRatio: 0.5, wordLen: [2, 4], boss: false, powerChance: 0.05 },
  { name: 'The Big One', hint: 'boss level', letters: ALL, count: 24, fall: 7, interval: 1.3, wordRatio: 0.5, wordLen: [3, 4], boss: true, powerChance: 0.06 },
  { name: 'Longer Words', hint: 'four and five letters', letters: ALL, count: 24, fall: 7.5, interval: 1.6, wordRatio: 0.7, wordLen: [4, 5], boss: false, powerChance: 0.06 },
  { name: 'Crossfire', hint: 'mixed letters and words', letters: ALL, count: 32, fall: 6.6, interval: 1.1, wordRatio: 0.5, wordLen: [3, 5], boss: false, powerChance: 0.06 },
  { name: 'Deep Space', hint: 'mostly words', letters: ALL, count: 28, fall: 6.8, interval: 1.35, wordRatio: 0.8, wordLen: [4, 6], boss: false, powerChance: 0.07 },
  { name: 'Gravity Well', hint: 'faster falls', letters: ALL, count: 30, fall: 6, interval: 1.15, wordRatio: 0.7, wordLen: [4, 6], boss: false, powerChance: 0.07 },
  { name: 'Twin Suns', hint: 'boss level', letters: ALL, count: 28, fall: 6.2, interval: 1.2, wordRatio: 0.7, wordLen: [4, 6], boss: true, powerChance: 0.08 },
  { name: 'Long Haul', hint: 'long words', letters: ALL, count: 26, fall: 6.8, interval: 1.5, wordRatio: 0.9, wordLen: [5, 8], boss: false, powerChance: 0.08 },
  { name: 'Overdrive', hint: 'everything at once', letters: ALL, count: 36, fall: 5.6, interval: 0.95, wordRatio: 0.6, wordLen: [3, 7], boss: false, powerChance: 0.08 },
  { name: 'Spaghettification', hint: 'very fast', letters: ALL, count: 36, fall: 5.2, interval: 0.95, wordRatio: 0.7, wordLen: [4, 8], boss: false, powerChance: 0.09 },
  { name: 'Event Horizon', hint: 'the hole is wide open', letters: ALL, count: 40, fall: 5, interval: 0.85, wordRatio: 0.75, wordLen: [4, 9], boss: true, powerChance: 0.1 },
  { name: 'Singularity', hint: 'final boss', letters: ALL, count: 44, fall: 4.6, interval: 0.8, wordRatio: 0.8, wordLen: [5, 10], boss: true, powerChance: 0.1 },
];

export function endlessWave(n: number): WaveDef {
  return {
    name: `Wave ${n}`,
    hint: n === 1 ? 'type the letters to shoot' : n % 5 === 0 ? 'boss incoming' : 'faster',
    letters: ALL,
    count: 10 + n * 3,
    fall: Math.max(3.4, 8.5 - n * 0.42),
    interval: Math.max(0.42, 1.45 - n * 0.085),
    wordRatio: Math.min(0.8, (n - 1) * 0.12),
    wordLen: [Math.min(6, 2 + Math.floor(n / 3)), Math.min(10, 3 + Math.floor(n / 2))],
    boss: n % 5 === 0,
    powerChance: n >= 2 ? 0.07 : 0,
  };
}

export const POWERS = ['freeze', 'nuke', 'shield', 'magnet'] as const;
export type Power = (typeof POWERS)[number];
