// The 5 game crates that live inside the claw machine.

export type GameId = 'blackhole' | 'repair' | 'racer' | 'boss' | 'bomb';

export interface CrateDef {
  id: GameId;
  label: string;
  sub: string;
  route: string;
  color: string;
  glyph: string;
}

export const CRATES: CrateDef[] = [
  { id: 'blackhole', label: 'BLACK HOLE', sub: 'ASTEROID SHOOTER', route: '/blackhole', color: '#ff2bd6', glyph: '◉' },
  { id: 'repair', label: 'REPAIR', sub: 'TYPING TEST', route: '/repair', color: '#00d9ff', glyph: '▣' },
  { id: 'racer', label: 'NEON RACER', sub: 'TYPE TO DRIVE', route: '/racer', color: '#ffc21a', glyph: '⚑' },
  { id: 'boss', label: 'BOSS DUEL', sub: 'TYPE TO FIGHT', route: '/boss', color: '#9b4dff', glyph: '☠' },
  { id: 'bomb', label: 'BOMB DEFUSE', sub: 'CUT THE WIRES', route: '/bomb', color: '#ff4d2e', glyph: '✹' },
];

export function crateById(id: string | null | undefined): CrateDef | undefined {
  return CRATES.find((c) => c.id === id);
}
