import type { SimRunCtx } from './engine';
import type { RunConfig } from './types';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Fingerprint the frozen management/model inputs used by a persisted ensemble. */
export function ensembleConfigKey(config: RunConfig, ctx?: SimRunCtx): string {
  const input = stableStringify({
    config,
    ...(!config.modelInputs && ctx ? { legacyContext: ctx } : {}),
  });
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x85ebca6b);
  }
  return `ensemble-config-v1:${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
