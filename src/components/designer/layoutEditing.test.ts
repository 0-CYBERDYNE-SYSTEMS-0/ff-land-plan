import { describe, expect, it } from 'vitest';

import { makeEnvironment } from '@/lib/environment-model';
import { layoutWithAccessOnEdge, layoutWithinBounds } from './layoutEditing';

describe('environment access layout editing', () => {
  it('moves a tent opening and its service reservation together', () => {
    const environment = makeEnvironment(1, {
      archetype: 'grow-tent',
      widthM: 2,
      heightM: 2,
      cellM: 0.25,
    }, 'env:test');

    const moved = layoutWithAccessOnEdge(environment, 'east');
    expect(moved?.access[0]).toMatchObject({ edge: 'east', offsetM: 0.75, widthM: 0.75 });
    expect(moved?.reservations[0]).toMatchObject({ edge: 'east', x: 1.5, y: 0.75, widthM: 0.5, depthM: 0.75 });
  });

  it('keeps a south opening and reservation attached after a depth resize', () => {
    const environment = makeEnvironment(1, {
      archetype: 'grow-tent',
      widthM: 2,
      heightM: 2,
      cellM: 0.25,
    }, 'env:test');

    const resized = layoutWithinBounds(environment.layout, 2, 1.5);
    expect(resized?.access[0]).toMatchObject({ edge: 'south', offsetM: 0.75, widthM: 0.75 });
    expect(resized?.reservations[0]).toMatchObject({ edge: 'south', x: 0.75, y: 1, widthM: 0.75, depthM: 0.5 });
  });
});
