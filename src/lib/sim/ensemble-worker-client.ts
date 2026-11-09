import type { SeasonEnsembles } from '@/lib/ensembles';
import { ensembleCacheKey, ensembleResultCache, ensembleUnavailableReason, selectedEnsembleYears } from './ensemble';
import type { RunConfig, RunEnsembleResult } from './types';
import type { RunEnsembleOptions } from './ensemble';

type WorkerResponse =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'result'; result: RunEnsembleResult | null }
  | { type: 'error'; message: string };

export interface CachedEnsembleResult {
  key: string;
  result: RunEnsembleResult | null;
  unavailableReason?: string;
}

export interface RunEnsembleWorkerOptions extends Pick<RunEnsembleOptions, 'maxYears' | 'onProgress' | 'ctx' | 'persistedConfig'> {
  signal?: AbortSignal;
}

function abortError(): Error {
  const error = new Error('Ensemble calculation cancelled.');
  error.name = 'AbortError';
  return error;
}

/** Runs one historical year at a time in a module worker and reports progress. */
export function runEnsembleInWorker(
  config: RunConfig,
  ensembles: SeasonEnsembles,
  options: RunEnsembleWorkerOptions = {},
): Promise<CachedEnsembleResult> {
  if (options.signal?.aborted) return Promise.reject(abortError());
  const key = ensembleCacheKey(config, ensembles, options.maxYears, options.ctx);
  const unavailableReason = ensembleUnavailableReason(config, ensembles, options.maxYears, options.persistedConfig);
  if (unavailableReason) return Promise.resolve({ key, result: null, unavailableReason });
  const cached = ensembleResultCache.get(key);
  if (cached) return Promise.resolve({ key, result: cached });
  if (selectedEnsembleYears(config, ensembles, options.maxYears).length === 0) {
    return Promise.resolve({ key, result: null });
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./ensemble.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      callback();
    };
    const onAbort = () => finish(() => reject(abortError()));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === 'progress') {
        options.onProgress?.(data.completed, data.total);
      } else if (data.type === 'result') {
        if (data.result) ensembleResultCache.set(key, data.result);
        finish(() => resolve({ key, result: data.result }));
      } else {
        finish(() => reject(new Error(data.message)));
      }
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message || 'Ensemble worker failed.')));
    worker.postMessage({
      type: 'run',
      config,
      ensembles,
      maxYears: options.maxYears,
      ctx: options.ctx,
      persistedConfig: options.persistedConfig,
    });
  });
}
