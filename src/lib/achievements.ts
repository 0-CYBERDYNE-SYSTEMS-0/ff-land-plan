// Lightweight achievement system for the 3D farm experience.
// Persists to localStorage under "ff-pro:v1-achievements".

export interface Achievement {
  id: string;
  label: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

const DEFINITIONS: Omit<Achievement, 'unlocked'>[] = [
  { id: 'first_plant', label: 'First Seed', description: 'Plant your first crop cell', icon: '🌱' },
  { id: 'five_families', label: 'Biodiversity', description: 'Plant crops from 5 different families', icon: '🌿' },
  { id: 'ten_crops', label: 'Market Garden', description: 'Plant 10 different crop types', icon: '🧺' },
  { id: 'half_beds', label: 'Half Full', description: 'Fill 50% of your bed area with crops', icon: '🏡' },
  { id: 'full_beds', label: 'Full Harvest', description: 'Fill all bed area with crops', icon: '🌾' },
  { id: 'water_feature', label: 'Water Feature', description: 'Place a pond or water source', icon: '💧' },
  { id: 'beehive', label: 'Busy Bees', description: 'Place a beehive', icon: '🐝' },
  { id: 'chickens', label: 'Farm Fresh', description: 'Place a chicken coop', icon: '🐔' },
  { id: 'greenhouse', label: 'Under Glass', description: 'Place a greenhouse', icon: '🏠' },
  { id: 'tour_complete', label: 'Grand Tour', description: 'Complete a farm tour', icon: '🎥' },
  { id: 'flight_time', label: 'Pilot', description: 'Fly for 60 seconds total', icon: '✈️' },
  { id: 'rain_day', label: 'Rainy Day', description: 'See rain falling on your farm', icon: '🌧️' },
  { id: 'snow_day', label: 'Winter Wonderland', description: 'See snow falling on your farm', icon: '❄️' },
  { id: 'dawn_patrol', label: 'Early Riser', description: 'Visit your farm at dawn', icon: '🌅' },
  { id: 'night_owl', label: 'Night Owl', description: 'Visit your farm after dark', icon: '🌙' },
];

const STORAGE_KEY = 'ff-pro:v1-achievements';

export interface AchievementSystem {
  achievements: Achievement[];
  unlocked: Achievement[];
  check: (id: string) => void;
  isUnlocked: (id: string) => boolean;
  stats: () => { total: number; unlocked: number };
}

export function createAchievementSystem(): AchievementSystem {
  const stored: Record<string, boolean> = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();

  const achievements: Achievement[] = DEFINITIONS.map((def) => ({
    ...def,
    unlocked: stored[def.id] === true,
  }));

  const unlockedSet = new Set(Object.keys(stored).filter((k) => stored[k]));

  function save() {
    const state: Record<string, boolean> = {};
    for (const a of achievements) state[a.id] = a.unlocked;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage errors
    }
  }

  function isUnlocked(id: string): boolean {
    return unlockedSet.has(id);
  }

  function check(id: string): void {
    const achievement = achievements.find((a) => a.id === id);
    if (!achievement || achievement.unlocked) return;
    achievement.unlocked = true;
    unlockedSet.add(id);
    save();
  }

  function stats() {
    return { total: achievements.length, unlocked: unlockedSet.size };
  }

  return {
    achievements,
    // Live getter: check() mutates records after creation, so a plain array
    // would freeze at the construction-time unlock set.
    get unlocked() {
      return achievements.filter((a) => a.unlocked);
    },
    check,
    isUnlocked,
    stats,
  };
}
