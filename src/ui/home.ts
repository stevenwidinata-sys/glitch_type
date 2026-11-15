import type { Screen } from '../router';

export const homeScreen: Screen = (root) => {
  root.innerHTML = `<div class="not-found"><div><h1 class="glitch" data-text="GLITCH_TYPE">GLITCH_TYPE</h1><p class="muted">booting...</p></div></div>`;
};
