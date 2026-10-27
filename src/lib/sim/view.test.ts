import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import type { CellState } from './types';
import { projectPlant } from './view';

describe('v3 plant view projection', () => {
  it('keeps the juvenile placeholder through the run, including the source maturity endpoint', () => {
    const crop = cropLibrary.find((entry) => entry.id === 1)!;
    const cell: CellState = {
      cropId: crop.id,
      plantedAtDay: 0,
      moistureFrac: 0.7,
      nitrogenKgHa: 80,
      gddAccumC: 40,
      biomassFrac: 1,
      stage: 0,
      floweringFrac: 0,
      pestPressure: 0,
      stress: { water: 0, heat: 0, cold: 0, nitrogen: 0 },
      physiologyStartDay: 2,
      establishmentDryMatterGPerM2: 10,
      establishmentApplied: true,
      sourceThermalCdays: 1003,
      stageEstimateAvailable: false,
    };

    const beforeEndpoint = projectPlant({
      cell: { ...cell, biomassFrac: 0.65, floweringFrac: 0.4, sourceThermalCdays: 500 },
      crop,
      env: null,
      dayIndex: 10,
      cellKey: '0,0',
    });
    const atEndpoint = projectPlant({ cell, crop, env: null, dayIndex: 30, cellKey: '0,0' });

    for (const view of [beforeEndpoint, atEndpoint]) {
      expect(view.growth).toBe(0);
      expect(view.stage).toBe(0);
      expect(view.flowering).toBe(0);
    }
  });
});
