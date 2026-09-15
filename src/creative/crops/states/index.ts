/**
 * Lifecycle state builders per archetype (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 * One module per archetype keeps builder agents conflict-free; this index is
 * the single assembly point consumed by `crops/map.ts` (makeCropFor state
 * axis), `three/plants.ts` (template key state axis + geometry-availability
 * probe) and the showcase scrub tool (real state previews). Empty state
 * objects fall back to the Tier-1 tint + pose channels.
 */
import type { ArchetypeStates, PlantStateVisual } from '../shared';
import { tomatoStates } from './tomato';
import { leafyHeadStates } from './leafy-head';
import { wheatStates } from './wheat';
import { cornStates } from './corn';
import { rootCarrotStates } from './root-carrot';
import { alliumStates } from './allium';
import { potatoStates } from './potato';
import { brassicaStates } from './brassica';
import { greensOpenStates } from './greens-open';
import { cucurbitVineStates } from './cucurbit-vine';
import { legumeTrellisStates } from './legume-trellis';
import { bushBeanStates } from './bush-bean';
import { strawberryStates } from './strawberry';
import { herbClumpStates } from './herb-clump';
import { herbShrubStates } from './herb-shrub';
import { berryBushStates } from './berry-bush';
import { appleTreeStates } from './apple-tree';
import { mushroomStates } from './mushroom';

export const STATE_BUILDERS: Record<string, ArchetypeStates> = {
  tomato: tomatoStates,
  'leafy-head': leafyHeadStates,
  wheat: wheatStates,
  corn: cornStates,
  'root-carrot': rootCarrotStates,
  allium: alliumStates,
  potato: potatoStates,
  brassica: brassicaStates,
  'greens-open': greensOpenStates,
  'cucurbit-vine': cucurbitVineStates,
  'legume-trellis': legumeTrellisStates,
  'bush-bean': bushBeanStates,
  strawberry: strawberryStates,
  'herb-clump': herbClumpStates,
  'herb-shrub': herbShrubStates,
  'berry-bush': berryBushStates,
  'apple-tree': appleTreeStates,
  mushroom: mushroomStates,
};

/** True when the archetype has dedicated geometry for a lifecycle state. */
export function hasStateBuilder(archetype: string | undefined, state: PlantStateVisual): boolean {
  if (!archetype) return false;
  return STATE_BUILDERS[archetype]?.[state] !== undefined;
}
