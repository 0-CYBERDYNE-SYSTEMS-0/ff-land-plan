/**
 * SHOWCASE-ONLY — superseded in the app by the src/three/sky.ts single-sun
 * system (sky.update() owns the one directional light + ambient; never wire a
 * second lighting authority into World3D). These presets remain functional
 * for the showcase's studio rig: registry entries `preset-dawn` … apply them
 * per diorama cell for visual judgement.
 *
 * Studio lighting presets — pure data + one applier.
 *
 * Each preset produces a distinctly different mood while keeping voxel assets
 * legible: noon is crisp and high-contrast, dawn is warm pink with a low sun,
 * dusk pairs amber key with blue fill, night goes cool but keeps ambient lifted
 * above realism so silhouettes still read, overcast is soft and nearly flat.
 *
 * `applyPreset` sets the rig lights (colors/intensities/positions). The scene
 * background color travels with the preset too — diorama cells apply it in
 * their tick (the showcase owns the Scene, ticks reach it via obj.parent).
 */
import type { StudioRig } from '@/creative/registry-types';

export type PresetId = 'dawn' | 'noon' | 'dusk' | 'night' | 'overcast';

export interface LightPreset {
  id: PresetId;
  name: string;
  key: { color: number; intensity: number; position: [number, number, number] };
  fill: { color: number; intensity: number };
  hemi: { sky: number; ground: number; intensity: number };
  /** Sky / backdrop color for the mood. */
  background: number;
}

export const PRESETS: Record<PresetId, LightPreset> = {
  dawn: {
    id: 'dawn',
    name: 'Dawn',
    // warm pink sun barely off the horizon from the east
    key: { color: 0xffb59a, intensity: 1.15, position: [7, 2.4, 3.5] },
    fill: { color: 0x9fb8ff, intensity: 0.38 },
    hemi: { sky: 0xffd9e2, ground: 0x6b5544, intensity: 0.72 },
    background: 0xe9b9a6,
  },
  noon: {
    id: 'noon',
    name: 'Noon',
    // high white sun, cool sky bounce — the crisp reference look
    key: { color: 0xfff6e2, intensity: 1.55, position: [3.5, 10, 2.5] },
    fill: { color: 0xdfeaff, intensity: 0.5 },
    hemi: { sky: 0xcfe6ff, ground: 0xa08a66, intensity: 1.1 },
    background: 0xbcd8ea,
  },
  dusk: {
    id: 'dusk',
    name: 'Dusk',
    // amber low sun from the west against deepening blue
    key: { color: 0xffa04e, intensity: 1.25, position: [-7, 2, 3] },
    fill: { color: 0x5f7fd0, intensity: 0.55 },
    hemi: { sky: 0x808cc8, ground: 0x54423a, intensity: 0.78 },
    background: 0x8f7699,
  },
  night: {
    id: 'night',
    name: 'Night',
    // cool moonlight; ambient deliberately brighter than realistic
    key: { color: 0x9fb6e8, intensity: 0.92, position: [-4, 8, -4] },
    fill: { color: 0x6478b8, intensity: 0.42 },
    hemi: { sky: 0x39406b, ground: 0x20263c, intensity: 1.28 },
    background: 0x161e36,
  },
  overcast: {
    id: 'overcast',
    name: 'Overcast',
    // big soft source: weak key + strong hemi = gentle flat wrap
    key: { color: 0xdedcd2, intensity: 0.85, position: [3, 8, 5] },
    fill: { color: 0xcfd2cc, intensity: 0.62 },
    hemi: { sky: 0xc8cbc6, ground: 0x8a857a, intensity: 1.15 },
    background: 0xb2b4ac,
  },
};

/** Push a preset onto this cell's light rig (called once at setup per frame). */
export function applyPreset(rig: StudioRig, p: LightPreset): void {
  rig.key.color.setHex(p.key.color);
  rig.key.intensity = p.key.intensity;
  rig.key.position.set(p.key.position[0], p.key.position[1], p.key.position[2]);
  rig.fill.color.setHex(p.fill.color);
  rig.fill.intensity = p.fill.intensity;
  rig.hemi.color.setHex(p.hemi.sky);
  rig.hemi.groundColor.setHex(p.hemi.ground);
  rig.hemi.intensity = p.hemi.intensity;
}
