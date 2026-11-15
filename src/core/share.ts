// Friend challenges live entirely in the URL: no server needed.

export interface Challenge {
  /** route to play, e.g. '/blackhole/play' */
  r: string;
  /** query string for that route (includes the seed) */
  q: string;
  /** score to beat */
  s: number;
  /** unit label shown to the friend */
  u: string;
  /** human readable mode name */
  n: string;
}

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function challengeUrl(c: Challenge): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/challenge?d=${toB64Url(JSON.stringify(c))}`;
}

export function decodeChallenge(d: string | null): Challenge | null {
  if (!d) return null;
  try {
    const c = JSON.parse(fromB64Url(d)) as Challenge;
    if (typeof c.r !== 'string' || !c.r.startsWith('/') || typeof c.s !== 'number') return null;
    return {
      r: c.r,
      q: String(c.q ?? ''),
      s: c.s,
      u: String(c.u ?? 'pts').slice(0, 12),
      n: String(c.n ?? 'a round').slice(0, 60),
    };
  } catch {
    return null;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
