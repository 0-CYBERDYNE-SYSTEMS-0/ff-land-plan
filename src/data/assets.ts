// Placeable garden assets for the plot designer. Footprints are real-world
// defaults in meters (snap to the 0.25 m grid); rectangle tool can resize
// anything. `plantable` assets accept crops painted on top.

import type { GardenAsset } from '@/types';

export const assetLibrary: GardenAsset[] = [
  // --- Growing ---------------------------------------------------------
  {
    slug: 'raised-bed', label: 'Raised Bed', category: 'growing',
    defaultWM: 1.25, defaultHM: 2.5, colorHex: '#8D6E63', pattern: 'solid',
    emoji: '🪴', plantable: true,
    description: 'Classic timber bed (default 1.25 × 2.5 m — reachable from both sides).',
  },
  {
    slug: 'inground-bed', label: 'In-ground Bed', category: 'growing',
    defaultWM: 1.25, defaultHM: 3, colorHex: '#6D4C41', pattern: 'solid',
    emoji: '🟫', plantable: true,
    description: 'Tilled or no-dig bed at grade.',
  },
  {
    slug: 'greenhouse', label: 'Greenhouse', category: 'growing',
    defaultWM: 2.5, defaultHM: 4, colorHex: '#AED6F1', pattern: 'cross',
    emoji: '🏡', plantable: true,
    description: 'Glass/poly house; extends the season at both ends.',
  },
  {
    slug: 'polytunnel', label: 'Polytunnel', category: 'growing',
    defaultWM: 3, defaultHM: 6, colorHex: '#D6EAF8', pattern: 'stripes',
    emoji: '⛺', plantable: true,
    description: 'Hooped poly cover; cheap protected growing space.',
  },
  {
    slug: 'cold-frame', label: 'Cold Frame', category: 'growing',
    defaultWM: 0.75, defaultHM: 1.25, colorHex: '#A9CCE3', pattern: 'cross',
    emoji: '🪟', plantable: true,
    description: 'Low glazed box for hardening off and winter salads.',
  },
  {
    slug: 'trellis', label: 'Trellis', category: 'growing',
    defaultWM: 0.25, defaultHM: 2, colorHex: '#A1887F', pattern: 'stripes',
    emoji: '🪜', plantable: true,
    description: 'Vertical support for peas, beans, cucumbers.',
  },
  {
    slug: 'fruit-tree', label: 'Fruit Tree', category: 'growing',
    defaultWM: 3, defaultHM: 3, colorHex: '#7CB342', pattern: 'dots',
    emoji: '🌳', plantable: false,
    description: 'Canopy footprint of a semi-dwarf tree (~3 m).',
  },
  {
    slug: 'grow-tent', label: 'Grow Tent', category: 'growing',
    defaultWM: 1.5, defaultHM: 1.5, colorHex: '#4A4A52', pattern: 'cross',
    emoji: '⛺', plantable: true,
    description: 'Reflective indoor grow tent; herbs and greens under grow lights.',
  },
  // --- Equipment (indoor canvases: tent / warehouse / greenhouse) ----------
  {
    slug: 'grow-light', label: 'LED Light Bar', category: 'equipment',
    defaultWM: 0.5, defaultHM: 0.25, colorHex: '#FFE9A8', pattern: 'stripes',
    emoji: '💡', plantable: false,
    surfaces: ['tent', 'indoor', 'greenhouse'],
    description: 'Full-spectrum LED bar; paint rows to tile continuous light runs.',
  },
  {
    slug: 'plant-rack', label: 'Vertical Grow Rack', category: 'equipment',
    defaultWM: 0.9, defaultHM: 0.6, colorHex: '#6B7280', pattern: 'stripes',
    emoji: '🗄️', plantable: true,
    surfaces: ['tent', 'indoor', 'greenhouse'],
    description: 'Three-deck vertical shelving; crops paint onto the shelf levels.',
  },
  {
    slug: 'hydro-channel', label: 'Hydro NFT Channel', category: 'equipment',
    defaultWM: 1, defaultHM: 0.25, colorHex: '#BFD8D2', pattern: 'dots',
    emoji: '🟩', plantable: true,
    surfaces: ['tent', 'indoor', 'greenhouse'],
    description: 'Sloped NFT channel for lettuce/greens; paint rows, plant the holes.',
  },
  {
    slug: 'clip-fan', label: 'Clip Fan', category: 'equipment',
    defaultWM: 0.3, defaultHM: 0.3, colorHex: '#9AA2A8', pattern: 'dots',
    emoji: '🌀', plantable: false,
    surfaces: ['tent', 'indoor', 'greenhouse'],
    description: 'Airflow fan — keeps canopy moving and mold away.',
  },
  {
    slug: 'hvac-unit', label: 'HVAC Unit', category: 'equipment',
    defaultWM: 1, defaultHM: 0.4, colorHex: '#E8E6E1', pattern: 'solid',
    emoji: '❄️', plantable: false,
    surfaces: ['indoor', 'tent'],
    description: 'Climate control for sealed rooms; the twin dials it into the model.',
  },
  {
    slug: 'grow-bench', label: 'Potting Bench', category: 'equipment',
    defaultWM: 1.2, defaultHM: 0.6, colorHex: '#C7CDD3', pattern: 'cross',
    emoji: '🧰', plantable: true,
    surfaces: ['greenhouse', 'tent', 'indoor'],
    description: 'Waist-high bench with a galvanized top; trays and pots grow on it.',
  },
  // --- Infrastructure ---------------------------------------------------
  {
    slug: 'path-gravel', label: 'Gravel Path', category: 'infrastructure',
    defaultWM: 0.5, defaultHM: 3, colorHex: '#BDC3C7', pattern: 'dots',
    emoji: '🪨', plantable: false,
    description: 'All-weather path; 0.5 m walk, 1 m for a wheelbarrow.',
  },
  {
    slug: 'path-woodchip', label: 'Woodchip Path', category: 'infrastructure',
    defaultWM: 0.5, defaultHM: 3, colorHex: '#A0793D', pattern: 'dots',
    emoji: '🪵', plantable: false,
    description: 'Soft, free path material; top up yearly.',
  },
  {
    slug: 'path-stone', label: 'Stone Path', category: 'infrastructure',
    defaultWM: 0.5, defaultHM: 3, colorHex: '#909497', pattern: 'cross',
    emoji: '🧱', plantable: false,
    description: 'Pavers or flag stones; permanent edging-grade path.',
  },
  {
    slug: 'fence', label: 'Fence', category: 'infrastructure',
    defaultWM: 0.25, defaultHM: 4, colorHex: '#795548', pattern: 'stripes',
    emoji: '🚧', plantable: false,
    description: 'Perimeter or deer/rabbit fencing line.',
  },
  {
    slug: 'gate', label: 'Gate', category: 'infrastructure',
    defaultWM: 1, defaultHM: 0.25, colorHex: '#5D4037', pattern: 'solid',
    emoji: '🚪', plantable: false,
    description: '1 m garden gate (wheelbarrow-wide).',
  },
  {
    slug: 'shed', label: 'Shed', category: 'infrastructure',
    defaultWM: 2, defaultHM: 3, colorHex: '#6E2C00', pattern: 'solid',
    emoji: '🛖', plantable: false,
    description: 'Tool and seed storage.',
  },
  {
    slug: 'compost-bin', label: 'Compost Bays', category: 'infrastructure',
    defaultWM: 1, defaultHM: 3, colorHex: '#4E342E', pattern: 'stripes',
    emoji: '♻️', plantable: false,
    description: 'Three-bay system: filling, cooking, finished.',
  },
  {
    slug: 'rain-barrel', label: 'Rain Barrel', category: 'infrastructure',
    defaultWM: 0.75, defaultHM: 0.75, colorHex: '#1F618D', pattern: 'solid',
    emoji: '🛢️', plantable: false,
    description: '200–300 L off a roof downspout.',
  },
  {
    slug: 'ibc-tote', label: 'IBC Tote', category: 'infrastructure',
    defaultWM: 1.25, defaultHM: 1.25, colorHex: '#21618C', pattern: 'cross',
    emoji: '🧊', plantable: false,
    description: '1000 L caged water tank.',
  },
  {
    slug: 'water-tap', label: 'Water Tap', category: 'infrastructure',
    defaultWM: 0.25, defaultHM: 0.25, colorHex: '#3498DB', pattern: 'solid',
    emoji: '🚰', plantable: false,
    description: 'Hose bib / standpipe location.',
  },
  {
    slug: 'irrigation-line', label: 'Irrigation Line', category: 'infrastructure',
    defaultWM: 0.25, defaultHM: 3, colorHex: '#85C1E9', pattern: 'stripes',
    emoji: '💧', plantable: false,
    description: 'Drip tape or soaker hose run.',
  },
  {
    slug: 'pond', label: 'Pond', category: 'infrastructure',
    defaultWM: 2, defaultHM: 1.5, colorHex: '#2874A6', pattern: 'solid',
    emoji: '🪷', plantable: false,
    description: 'Wildlife pond; the single best biodiversity feature.',
  },
  // --- Life --------------------------------------------------------------
  {
    slug: 'beehive', label: 'Beehive', category: 'life',
    defaultWM: 0.5, defaultHM: 0.5, colorHex: '#D4AC0D', pattern: 'stripes',
    emoji: '🐝', plantable: false,
    description: 'Langstroth hive; face the entrance away from paths.',
  },
  {
    slug: 'chicken-coop', label: 'Chicken Coop + Run', category: 'life',
    defaultWM: 2, defaultHM: 4, colorHex: '#CA6F1E', pattern: 'cross',
    emoji: '🐔', plantable: false,
    description: 'Coop with run; ~1 m² of run per bird minimum.',
  },
  {
    slug: 'barn', label: 'Barn', category: 'infrastructure',
    defaultWM: 4.5, defaultHM: 3, colorHex: '#A93226', pattern: 'solid',
    emoji: '🏠', plantable: false,
    description: 'Classic red barn; wakes farm life around it.',
  },
  {
    slug: 'picket-fence', label: 'Picket Fence', category: 'infrastructure',
    defaultWM: 0.25, defaultHM: 4, colorHex: '#D7CBAF', pattern: 'stripes',
    emoji: '🚧', plantable: false,
    description: 'Decorative picket line; paint cells in a row to connect segments.',
  },
  {
    slug: 'hay-bale', label: 'Hay Bale', category: 'infrastructure',
    defaultWM: 0.9, defaultHM: 0.5, colorHex: '#DBB124', pattern: 'stripes',
    emoji: '🌾', plantable: false,
    description: 'Square bale; feed store, seating and windbreak in one.',
  },
  {
    slug: 'crate-stack', label: 'Crate Stack', category: 'infrastructure',
    defaultWM: 0.75, defaultHM: 0.75, colorHex: '#8D6E63', pattern: 'dots',
    emoji: '📦', plantable: false,
    description: 'Harvest crates staged where the day’s picking lands.',
  },
  {
    slug: 'signpost', label: 'Signpost', category: 'infrastructure',
    defaultWM: 0.25, defaultHM: 0.25, colorHex: '#6E2C00', pattern: 'solid',
    emoji: '🪧', plantable: false,
    description: 'Labels plots and rows so helpers find their way.',
  },
  {
    slug: 'scarecrow', label: 'Scarecrow', category: 'life',
    defaultWM: 0.5, defaultHM: 0.5, colorHex: '#C0392B', pattern: 'cross',
    emoji: '🪆', plantable: false,
    description: 'Patchwork guardian; keeps hungry birds off the beds.',
  },
];

export const assetBySlug = (slug: string): GardenAsset | undefined =>
  assetLibrary.find((a) => a.slug === slug);
