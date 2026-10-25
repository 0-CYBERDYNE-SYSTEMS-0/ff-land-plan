/** Build-time gates from SPEC-CORE-LOOP §0. Features stay inert unless enabled. */
export const ENV_RECORDS_ENABLED = import.meta.env.VITE_FF_ENV_RECORDS === 'true';
export const ENV_CLIMATE_ENABLED = import.meta.env.VITE_FF_ENV_CLIMATE === 'true';
export const ASSET_PHYSICS_ENABLED = import.meta.env.VITE_FF_ASSET_PHYSICS === 'true';
