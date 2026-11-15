// Detect devices that most likely have no physical keyboard.

export function isTouchOnly(): boolean {
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const fine = window.matchMedia('(any-pointer: fine)').matches;
    return coarse && !fine;
  } catch {
    return false;
  }
}

let override = false;

export function keyboardConfirmed(): boolean {
  return override || !isTouchOnly();
}

export function confirmKeyboard(): void {
  override = true;
}
