import { store, save } from './storage';
import { sfx } from './audio';
import { toast } from '../ui/toast';

export interface Achievement {
  id: string;
  icon: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_run', icon: '◆', name: 'Hello World', desc: 'Finish your first run' },
  { id: 'wpm_30', icon: '⚡', name: 'Warming Up', desc: 'Reach 30 WPM' },
  { id: 'wpm_50', icon: '⚡', name: 'Fast Fingers', desc: 'Reach 50 WPM' },
  { id: 'wpm_80', icon: '⚡', name: 'Overclocked', desc: 'Reach 80 WPM' },
  { id: 'wpm_100', icon: '☄', name: 'Lightspeed', desc: 'Reach 100 WPM' },
  { id: 'perfect', icon: '◎', name: 'Zero Bugs', desc: '100% accuracy on a run of 50+ characters' },
  { id: 'combo_50', icon: '✦', name: 'Chain Reaction', desc: 'Hit a 50 combo in Black Hole' },
  { id: 'boss', icon: '☠', name: 'Boss Slayer', desc: 'Destroy a boss asteroid' },
  { id: 'nuke', icon: '☢', name: 'Big Red Button', desc: 'Type NUKE to clear the screen' },
  { id: 'wave_10', icon: '◉', name: 'Event Horizon', desc: 'Reach wave 10 in Endless' },
  { id: 'campaign_10', icon: '★', name: 'Halfway There', desc: 'Clear campaign level 10' },
  { id: 'campaign_20', icon: '♛', name: 'Black Hole Tamer', desc: 'Clear all 20 campaign levels' },
  { id: 'survivor', icon: '⛨', name: 'System Restored', desc: 'Win a Survival repair' },
  { id: 'daily', icon: '☀', name: 'Daily Driver', desc: 'Finish a daily challenge' },
  { id: 'streak_3', icon: '🔥', name: 'On Fire', desc: 'Practice 3 days in a row' },
  { id: 'streak_7', icon: '🔥', name: 'Unstoppable', desc: 'Practice 7 days in a row' },
  { id: 'polyglot', icon: '⌘', name: 'Bilingual', desc: 'Finish a run in Bahasa Indonesia' },
  { id: 'student', icon: '✎', name: 'Student', desc: 'Finish 5 lessons' },
  { id: 'runs_50', icon: '∞', name: 'Addicted', desc: 'Finish 50 runs' },
  { id: 'claw', icon: '⚙', name: 'Claw Master', desc: 'Grab a crate with the claw by hand' },
];

export function unlock(id: string): boolean {
  if (store.achievements[id]) return false;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return false;
  store.achievements[id] = Date.now();
  save();
  sfx.achievement();
  toast('ACHIEVEMENT UNLOCKED', `${a.name} — ${a.desc}`, a.icon);
  return true;
}

export function has(id: string): boolean {
  return !!store.achievements[id];
}
