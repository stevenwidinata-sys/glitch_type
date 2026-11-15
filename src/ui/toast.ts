export function toast(title: string, body: string, icon = '★', ms = 3800): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  const ico = document.createElement('span');
  ico.className = 'ico';
  ico.textContent = icon;
  const b = document.createElement('b');
  b.textContent = title;
  const s = document.createElement('span');
  s.textContent = body;
  el.append(ico, b, s);
  host.append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, ms);
}
