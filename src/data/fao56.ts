// FAO-56 single-Kc crop coefficients + yield-response (Ky) factors, one
// representative crop per CropCategory. Static, bundled data — no fetch,
// no Math.random (deterministic by construction).
//
// Sources (verified 2026-09-04 against the FAO-56 HTML at
// https://www.fao.org/4/x0490e/x0490e0b.htm, FAO-56 Ch. 6):
//   - Table 12 "Single crop coefficients (Kc) ... for non-stressed, well-
//     managed crops in a subhumid climate (RHmin ≈ 45 %, u2 ≈ 2 m/s)":
//       tomato 0.60 / 1.15 / 0.80 (h 0.6 m; Kc_end 0.70–0.90 range, long
//       season hard harvest value 0.80 used)
//       maize (grain) 0.30 / 1.20 / 0.60 (Kc_end high end — harvest at
//       high grain moisture; field-dry would be 0.35)
//       deciduous orchard, no ground cover, killing frost 0.45 / 0.95 /
//       0.70 (h 4 m). Note: the Wave-4 spec sketched 0.5/0.95/0.65; the
//       verified Table 12 row is used instead (documented deviation).
//       grass pasture (mean) 0.40 / 0.80 / 0.75 stands in for cover_crop;
//       small vegetables 0.70 / 1.05 / 0.90 stands in for herb/flower.
//   - Table 11 "stage lengths (days)" — tomato (Calif. Apr/May)
//       35/40/50/30 of 155 d; maize (Spain/Calif.) 30/40/50/30 of 150 d;
//       deciduous orchard (Calif.) 30/50/130/30 of 240 d. The generic
//       annual-crop norm is ≈ 0.2/0.3/0.35/0.15 (ini/dev/mid/late
//       fractions); orchards genuinely run a much longer mid season.
//   - Ky (yield response to water, 1 − Ya/Ym = Ky × (1 − ETa/ETm)):
//       FAO-56 Annex Table (originally Doorenbos & Kassam 1979, FAO
//       Irrigation & Drainage Paper 33): tomato 1.05, maize 1.25,
//       citrus 0.8–1.1 / deciduous fruit ≈ 0.9, small vegetables ≈ 1.0,
//       grass/pasture ≈ 0.9. The Ky annex is not part of the Ch. 6 HTML
//       fetched above; values follow the FAO-33 ranges the Wave-4 spec
//       cites (tomato 1.05, maize 1.25).
// fungus is excluded: mushrooms have no Kc curve and no transpiration
// demand — sim treats them as zero water demand (no curve).

import type { CropCategory } from '@/types';

/** FAO-56 single-Kc curve; stage fractions are fractions of growthDays. */
export interface KcCurve {
  /** Kc during the initial stage (Table 12, Kc_ini). */
  ini: number;
  /** Kc mid-season peak (Table 12, Kc_mid). */
  mid: number;
  /** Kc at late-season end (Table 12, Kc_end). */
  end: number;
  /** Fraction of season in the initial stage (Table 11-derived). */
  iniFrac: number;
  /** Fraction of season in the development stage (Table 11-derived). */
  devFrac: number;
  /** Fraction of season in the mid stage (Table 11-derived; remainder = late). */
  midFrac: number;
}

// Representative crops (Table 12 rows cited per block) + Table 11 stage
// norms, rounded to 2 dp.
const KC_CURVES: Record<CropCategory, KcCurve> = {
  // FAO-56 Table 12, tomato (0.60/1.15/0.80); Table 11 tomato Calif.
  // 35/40/50/30 of 155 d → 0.23/0.26/0.32, late = remainder.
  vegetable: {
    ini: 0.6, mid: 1.15, end: 0.8,
    iniFrac: 0.23, devFrac: 0.26, midFrac: 0.32,
  },
  // FAO-56 Table 12, maize grain (0.30/1.20/0.60); Table 11 maize
  // Spain/Calif. 30/40/50/30 of 150 d → 0.20/0.27/0.33.
  grain: {
    ini: 0.3, mid: 1.2, end: 0.6,
    iniFrac: 0.2, devFrac: 0.27, midFrac: 0.33,
  },
  // FAO-56 Table 12, deciduous orchard no ground cover, killing frost
  // (0.45/0.95/0.70); Table 11 orchard Calif. 30/50/130/30 of 240 d →
  // 0.13/0.21/0.54 (long mid season — perennials hold a full canopy).
  fruit: {
    ini: 0.45, mid: 0.95, end: 0.7,
    iniFrac: 0.13, devFrac: 0.21, midFrac: 0.54,
  },
  // FAO-56 Table 12, small vegetables stand-in (0.70/1.05/0.90);
  // Table 11 generic annual norm ≈ 0.20/0.30/0.35, late = remainder.
  herb: {
    ini: 0.7, mid: 1.05, end: 0.9,
    iniFrac: 0.2, devFrac: 0.3, midFrac: 0.35,
  },
  // FAO-56 Table 12, small vegetables stand-in (0.70/1.05/0.90);
  // generic annual stage norm as for herb.
  flower: {
    ini: 0.7, mid: 1.05, end: 0.9,
    iniFrac: 0.2, devFrac: 0.3, midFrac: 0.35,
  },
  // FAO-56 Table 12, grass pasture mean stand-in (0.40/0.80/0.75);
  // generic annual stage norm (fast establishment, Table 11 norm).
  cover_crop: {
    ini: 0.4, mid: 0.8, end: 0.75,
    iniFrac: 0.2, devFrac: 0.3, midFrac: 0.35,
  },
  // Fungus: no Kc curve — zero transpiration demand (see kyForCategory).
  fungus: {
    ini: 0, mid: 0, end: 0,
    iniFrac: 0.2, devFrac: 0.3, midFrac: 0.35,
  },
};

// FAO-56 Annex / FAO-33 (Doorenbos & Kassam 1979) yield-response factors
// for the same representative crops. fungus = 0 ⇒ no yield penalty.
const KY: Record<CropCategory, number> = {
  vegetable: 1.05, // FAO-33 Table, tomato
  grain: 1.25, // FAO-33 Table, maize (grain)
  fruit: 0.9, // FAO-33 range, deciduous fruit trees ≈ 0.9 (citrus 0.8–1.1)
  herb: 1.0, // FAO-33 range, small vegetables ≈ 1.0
  flower: 1.0, // FAO-33 range, small vegetables ≈ 1.0 (stand-in)
  cover_crop: 0.9, // FAO-33 range, grass/pasture ≈ 0.9
  fungus: 0, // no water-linked yield response
};

/** FAO-56 single-Kc curve for a crop category (fungus ⇒ all-zero curve). */
export function kcForCategory(cat: CropCategory): KcCurve {
  return KC_CURVES[cat];
}

/** Ky yield-response factor for a crop category (fungus ⇒ 0). */
export function kyForCategory(cat: CropCategory): number {
  return KY[cat];
}

/**
 * Kc at a given season fraction f (0..1): piecewise-linear ini→mid→end
 * across the Table 11 stage fractions. Deterministic, monotone per stage.
 */
export function kcAtFraction(curve: KcCurve, f: number): number {
  const t = Math.max(0, Math.min(1, f));
  if (t <= curve.iniFrac) return curve.ini;
  if (t <= curve.iniFrac + curve.devFrac) {
    const u = (t - curve.iniFrac) / curve.devFrac;
    return curve.ini + u * (curve.mid - curve.ini);
  }
  if (t <= curve.iniFrac + curve.devFrac + curve.midFrac) return curve.mid;
  const u = (t - curve.iniFrac - curve.devFrac - curve.midFrac) /
    Math.max(1e-6, 1 - curve.iniFrac - curve.devFrac - curve.midFrac);
  return curve.mid + u * (curve.end - curve.mid);
}
