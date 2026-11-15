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

startRouter();
