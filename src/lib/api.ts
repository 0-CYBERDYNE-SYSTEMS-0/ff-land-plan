// API seam. `apiFetch` is the local-first client (persistent store + real
// Open-Meteo weather). Point this at a fetch-based server client to wire a
// real backend without touching pages.

import { localApi, type Api } from '@/lib/localApi';

export type { Api };
export const apiFetch: Api = localApi;
