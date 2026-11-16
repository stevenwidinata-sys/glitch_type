// Memory shared between visits to the claw machine (lives for the page session).
import { navigate } from '../../router';
import { crateById, type GameId } from './crates';
import { coverForClosing } from './openings';

export interface SavedCrate {
  id: GameId;
  x: number; // 0..1 of glass width
  y: number; // 0..1 of glass height
  a: number;
}

export const clawState = {
  /** crate that was opened and should come back with the closing animation */
  opened: null as GameId | null,
  /** pile layout so the machine looks the same when you come back */
  pile: null as SavedCrate[] | null,
  clawX: 0.5,
};

let leaving = false;

/** Leave a game and go back to the claw machine (plays the crate closing animation). */
export async function returnToMachine(): Promise<void> {
  if (leaving) return;
  leaving = true;
  try {
    const def = crateById(clawState.opened);
    if (def) await coverForClosing(def);
    navigate('/');
  } finally {
    leaving = false;
  }
}
