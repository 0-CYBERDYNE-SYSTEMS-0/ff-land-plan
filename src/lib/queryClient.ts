import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const path = Array.isArray(queryKey) ? (queryKey as unknown[]).join('/') : String(queryKey);
        const res = await fetch(String(path));
        if (!res.ok) {
          const body = await res.text().catch(() => res.statusText);
          throw new Error(`${res.status}: ${body}`);
        }
        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
