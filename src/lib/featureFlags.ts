/** Build-time gates from SPEC-CORE-LOOP §0. Features stay inert unless enabled. */
export const ENV_RECORDS_ENABLED = import.meta.env.VITE_FF_ENV_RECORDS === 'true';
