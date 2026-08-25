// API seam. `apiFetch` is the local-first client by default (persistent store
// + real Open-Meteo weather via localApi). Set VITE_API_BASE_URL (see
// .env.example) to a backend serving the README's /api/* contract and this
// seam swaps to the fetch-based REST client in restApi.ts — no page changes.

import { localApi, type Api } from '@/lib/localApi';
import { createRestApi } from '@/lib/restApi';

export type { Api };

const envBaseUrl = import.meta.env.VITE_API_BASE_URL;

export const apiFetch: Api =
  typeof envBaseUrl === 'string' && envBaseUrl.trim() !== ''
    ? createRestApi(envBaseUrl.trim())
    : localApi;
