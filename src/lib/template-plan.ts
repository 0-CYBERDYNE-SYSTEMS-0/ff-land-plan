import type { GardenTemplate } from '@/data/templates';
import { growingTargetKey } from '@/lib/growingTargets';
import type { Crop, Environment, GrowingTargetPlan, PlanState } from '@/types';

function templateTimestamp(daysAgo: number, now: Date): string {
  return new Date(now.getTime() - Math.max(0, daysAgo) * 86_400_000).toISOString();
}

export function planForTemplate(
  base: PlanState,
  template: GardenTemplate,
  crops: readonly Crop[],
  now = new Date(),
): { plan: PlanState; skippedCrops: number } {
  const nameToId = new Map(crops.map((crop) => [crop.name.toLowerCase(), crop.id]));
  const planting: Record<string, number> = {};
  const ground = { ...template.ground };
  const plantedAt: Record<string, string> = {};
  const targets: Record<string, GrowingTargetPlan> = {};
  let skippedCrops = 0;

  for (const [key, cropName] of Object.entries(template.planting)) {
    const cropId = nameToId.get(cropName.toLowerCase());
    if (cropId === undefined) {
      skippedCrops += 1;
      continue;
    }
    planting[key] = cropId;
    plantedAt[key] = templateTimestamp(template.plantedAtDaysAgo?.[cropName] ?? 0, now);
  }

  for (const target of template.targets ?? []) {
    const targetPlanting: Record<string, number> = {};
    const targetPlantedAt: Record<string, string> = {};
    for (const [cell, cropName] of Object.entries(target.planting)) {
      const cropId = nameToId.get(cropName.toLowerCase());
      if (cropId === undefined) {
        skippedCrops += 1;
        continue;
      }
      targetPlanting[cell] = cropId;
      targetPlantedAt[cell] = templateTimestamp(target.plantedAtDaysAgo ?? 0, now);
    }
    if (Object.keys(targetPlanting).length > 0) {
      const key = growingTargetKey({ kind: 'growing-level', growingSpaceId: target.growingSpaceId, levelId: target.levelId });
      targets[key] = {
        growingSpaceId: target.growingSpaceId,
        levelId: target.levelId,
        planting: targetPlanting,
        ...(Object.keys(targetPlantedAt).length > 0 ? { plantedAt: targetPlantedAt } : {}),
      };
    }
  }

  const plan: PlanState = {
    ...base,
    planting,
    ground,
    plantedAt,
    updatedAt: now.toISOString(),
    ...(Object.keys(targets).length > 0 ? { targets } : {}),
  };
  if (Object.keys(targets).length === 0) delete plan.targets;
  return { plan, skippedCrops };
}

export function environmentForTemplate(
  environment: Environment,
  template: GardenTemplate,
  crops: readonly Crop[],
  now = new Date(),
): { environment: Environment; skippedCrops: number } {
  const { plan, skippedCrops } = planForTemplate(environment.plan, template, crops, now);
  return {
    environment: {
      ...environment,
      plan,
      layout: {
        ...(environment.layout ?? { access: [], reservations: [], growingSpaces: [] }),
        growingSpaces: structuredClone(template.growingSpaces ?? []),
      },
      instances: structuredClone(template.instances ?? []),
    },
    skippedCrops,
  };
}
