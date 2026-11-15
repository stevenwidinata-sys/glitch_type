// Shared parsing for the URL params every play screen accepts.
import { store, type Lang } from './storage';

export interface PlayParams {
  lang: Lang;
  /** fixed seed (daily / friend challenge), or null for a random round */
  seed: number | null;
  /** score to beat from a friend challenge */
  beat: number | undefined;
  /** date key when this is a daily challenge */
  daily: string | undefined;
}

function num(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function parsePlayParams(params: URLSearchParams): PlayParams {
  const l = params.get('lang');
  const daily = params.get('daily');
  return {
    lang: l === 'id' || l === 'en' ? l : store.settings.lang,
    seed: num(params, 'seed') ?? null,
    beat: num(params, 'beat'),
    daily: daily && /^\d{4}-\d{2}-\d{2}$/.test(daily) ? daily : undefined,
  };
}
