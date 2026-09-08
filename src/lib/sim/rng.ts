// Deterministic keyed draws for the sim engine (SPEC-SIM-ECOSYSTEM §5 trap:
// "No Math.random in sim code"). Same (seed, dayIndex, salt) ⇒ same value, so
// environment synthesis and any future stochastic term replays exactly.

/** FNV-1a 32-bit hash of a string (cell keys, salt names). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** splitmix32 finalizer — u32 → u32 with good avalanche. */
function mix32(x: number): number {
  x = (x + 0x9e3779b9) | 0;
  let t = x ^ (x >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

/** One keyed uniform draw in [0, 1). Pure: no hidden state, no Math.random. */
export function uniform01(seed: number, dayIndex: number, salt: string): number {
  return (
    mix32((seed ^ hashString(salt) ^ Math.imul(dayIndex | 0, 0x9e3779b9)) >>> 0) / 4294967296
  );
}
