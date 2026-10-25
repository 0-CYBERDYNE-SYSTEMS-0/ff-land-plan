import { describe, expect, it } from 'vitest';

import { cropLibrary } from '@/data/crops';
import { effectivePlantingArea } from '@/lib/plan';

const lettuce = cropLibrary.find((crop) => crop.slug === 'lettuce')!;

describe('effectivePlantingArea', () => {
  it('applies a legacy uniform tier count before the spacing floor', () => {
    expect(effectivePlantingArea(lettuce, 2, 4)).toBe(6);
    expect(effectivePlantingArea(lettuce, 2) * 4).toBe(4);
  });

  it('aggregates equivalent occupied target areas before flooring', () => {
    expect(effectivePlantingArea(lettuce, [
      { cells: 1, cellM: 0.25, system: 'rack' },
      { cells: 1, cellM: 0.25, system: 'rack' },
    ])).toBe(1);
    expect(effectivePlantingArea(lettuce, [
      { cells: 1, cellM: 0.25, system: 'soil' },
      { cells: 1, cellM: 0.25, system: 'hydro' },
    ])).toBe(0);
  });
});
