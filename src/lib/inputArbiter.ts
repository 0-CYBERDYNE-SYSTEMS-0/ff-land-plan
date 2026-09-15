// Deliberate module-level singleton: there is exactly one 3D world per app,
// so a single input-mode flag is authoritative. Whatever captures input
// (e.g. flight) must reset the mode to 'default' on teardown.

export type InputMode = 'default' | 'flight';

let current: InputMode = 'default';

export function setInputMode(mode: InputMode): void {
  current = mode;
}

export function getInputMode(): InputMode {
  return current;
}

export function isInputCaptured(): boolean {
  return current !== 'default';
}
