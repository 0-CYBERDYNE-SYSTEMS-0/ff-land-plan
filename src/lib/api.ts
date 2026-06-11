// API client. The default `apiFetch` runs against the in-memory mock layer
// in `src/mock/api.ts`, which lets the entire app boot and exercise every
// route without a backend. Swap the import in pages for a real `fetch`-based
// client to wire a real server.

import { mockApi, type MockApi } from '@/mock/api';

export const apiFetch: MockApi = mockApi;
