import './styles/theme.css';
import { route, startRouter } from './router';
import { store } from './core/storage';
import { sfx } from './core/audio';

function applySettings(): void {
  document.documentElement.classList.toggle('reduce-motion', store.settings.reducedMotion);
}

applySettings();
window.addEventListener('glitch:settings', applySettings);

// browsers only allow audio after a user gesture
const prime = () => sfx.prime();
window.addEventListener('pointerdown', prime, { once: true });
window.addEventListener('keydown', prime, { once: true });

route('/', () => import('./ui/home').then((m) => m.homeScreen));
route('/blackhole', () => import('./ui/blackhole-page').then((m) => m.blackholeScreen));
route('/blackhole/play', () => import('./ui/blackhole-page').then((m) => m.blackholePlayScreen));
route('/repair', () => import('./ui/repair-page').then((m) => m.repairScreen));
route('/repair/play', () => import('./ui/repair-page').then((m) => m.repairPlayScreen));
route('/lessons', () => import('./ui/lessons-page').then((m) => m.lessonsScreen));
route('/lessons/play', () => import('./ui/lessons-page').then((m) => m.lessonPlayScreen));
route('/stats', () => import('./ui/stats-page').then((m) => m.statsScreen));
route('/daily', () => import('./ui/daily').then((m) => m.dailyScreen));
route('/settings', () => import('./ui/settings').then((m) => m.settingsScreen));
route('/racer', () => import('./ui/racer-page').then((m) => m.racerScreen));
route('/racer/play', () => import('./ui/racer-page').then((m) => m.racerPlayScreen));
route('/boss', () => import('./ui/boss-page').then((m) => m.bossScreen));
route('/boss/play', () => import('./ui/boss-page').then((m) => m.bossPlayScreen));
route('/bomb', () => import('./ui/bomb-page').then((m) => m.bombScreen));
route('/bomb/play', () => import('./ui/bomb-page').then((m) => m.bombPlayScreen));
route('/challenge', () => import('./ui/challenge').then((m) => m.challengeScreen));

startRouter();
