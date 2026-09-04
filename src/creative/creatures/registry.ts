/**
 * Lane D registry — creatures, tools & atmosphere.
 *
 * Entry order matters for the lighting presets: they reposition the rig's key
 * light in their tune() and the showcase resets only colors/intensities, so
 * preset cells sit LAST to avoid leaking key direction into later cells.
 */
import type * as THREE from 'three';
import type { AssetEntry } from '@/creative/registry-types';
import { PRESETS, applyPreset } from '@/creative/studio/presets';
import {
  buildHen, tickHen,
  buildRooster, tickRooster,
  buildCow, tickCow,
  buildPig, tickPig,
  buildSheep, tickSheep,
  buildDuck, tickDuck,
  buildBee, tickBee,
  buildButterfly, tickButterfly,
} from './animals';
import {
  buildWateringCan,
  buildWheelbarrow,
  buildHoe,
  buildPitchfork,
  buildSeedBag,
  buildBucket,
} from './tools';
import { buildPresetDiorama, makePresetTick, buildWindDemo, tickWindDemo } from './atmosphere';

const creature = (
  id: string,
  label: string,
  make: () => THREE.Group,
  tick: (obj: THREE.Object3D, t: number) => void,
): AssetEntry => ({ id, label, make, tick });

export const entries: AssetEntry[] = [
  creature('chicken', 'Chicken', buildHen, tickHen),
  creature('rooster', 'Rooster', buildRooster, tickRooster),
  creature('cow', 'Cow', buildCow, tickCow),
  creature('pig', 'Pig', buildPig, tickPig),
  creature('sheep', 'Sheep', buildSheep, tickSheep),
  creature('duck', 'Duck', buildDuck, tickDuck),
  creature('bee', 'Bee', buildBee, tickBee),
  creature('butterfly', 'Butterfly', buildButterfly, tickButterfly),

  { id: 'watering-can', label: 'Watering Can', make: buildWateringCan },
  { id: 'wheelbarrow', label: 'Wheelbarrow', make: buildWheelbarrow },
  { id: 'hoe', label: 'Hoe', make: buildHoe },
  { id: 'pitchfork', label: 'Pitchfork', make: buildPitchfork },
  { id: 'seed-bag', label: 'Seed Bag', make: buildSeedBag },
  { id: 'bucket', label: 'Bucket', make: buildBucket },

  {
    id: 'wind-sway-demo',
    label: 'Wind Sway — Wheat Row + Tomato',
    make: buildWindDemo,
    tick: tickWindDemo,
  },

  ...(['dawn', 'noon', 'dusk', 'night', 'overcast'] as const).map((key) => {
    const preset = PRESETS[key];
    return {
      id: `preset-${preset.id}`,
      label: `Lighting — ${preset.name}`,
      make: () => buildPresetDiorama(preset),
      tick: makePresetTick(preset),
      tune: (rig: Parameters<typeof applyPreset>[0]) => applyPreset(rig, preset),
    } satisfies AssetEntry;
  }),
];
