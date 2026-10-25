import type { SeasonEnsembles } from '@/lib/ensembles';
import { ensembleLimitations, runEnsembleYear, selectedEnsembleYears, summarizeEnsemble, type EnsembleSample } from './ensemble';
import type { RunConfig } from './types';
import type { SimRunCtx } from './engine';

interface RunRequest {
  type: 'run';
  config: RunConfig;
  ensembles: SeasonEnsembles;
  maxYears?: number;
  ctx?: SimRunCtx;
}

type WorkerResponse =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'result'; result: ReturnType<typeof summarizeEnsemble> }
  | { type: 'error'; message: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

workerScope.onmessage = ({ data }) => {
  if (data.type !== 'run') return;
  const years = selectedEnsembleYears(data.config, data.ensembles, data.maxYears);
  const samples: EnsembleSample[] = [];
  let index = 0;
  const runNextYear = () => {
    try {
      if (index >= years.length) {
        workerScope.postMessage({
          type: 'result',
          result: summarizeEnsemble(data.ensembles.source, samples, ensembleLimitations(data.config)),
        });
        return;
      }
      const year = years[index]!;
      const sample = runEnsembleYear(data.config, data.ensembles, year, data.ctx);
      if (sample) samples.push(sample);
      index += 1;
      workerScope.postMessage({ type: 'progress', completed: index, total: years.length });
      setTimeout(runNextYear, 0);
    } catch (error) {
      workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };
  setTimeout(runNextYear, 0);
};
