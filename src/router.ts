// Minimal hash router with lazy-loaded screens.

export type Cleanup = () => void;
export type Screen = (root: HTMLElement, params: URLSearchParams) => Cleanup | void;
type Loader = () => Promise<Screen>;

const routes = new Map<string, Loader>();
let current: Cleanup | void;
let renderId = 0;
let notFound: Screen = (root) => {
  root.innerHTML = '<div class="not-found"><div><h1>404</h1><p class="muted">signal lost</p><a class="btn" href="#/">Back to menu</a></div></div>';
};

export function route(path: string, loader: Loader): void {
  routes.set(path, loader);
}

export function setNotFound(screen: Screen): void {
  notFound = screen;
}

export function navigate(path: string): void {
  const target = `#${path}`;
  if (location.hash === target) void render();
  else location.hash = target;
}

export function parseHash(): { path: string; params: URLSearchParams } {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

async function render(): Promise<void> {
  const id = ++renderId;
  const root = document.getElementById('app')!;
  const { path, params } = parseHash();
  const loader = routes.get(path);
  let screen: Screen = notFound;
  if (loader) {
    try {
      screen = await loader();
    } catch (err) {
      console.error(err);
    }
  }
  if (id !== renderId) return; // a newer navigation won
  try {
    current?.();
  } catch (err) {
    console.error(err);
  }
  current = undefined;
  root.replaceChildren();
  root.className = '';
  window.scrollTo(0, 0);
  current = screen(root, params);
}

export function startRouter(): void {
  window.addEventListener('hashchange', () => void render());
  void render();
}
