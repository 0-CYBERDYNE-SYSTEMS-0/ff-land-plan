// Tiny convenience hooks wrapping the mock API. Real backend swap-in is a
// matter of replacing these bodies with TanStack Query calls against
// `fetch('/api/...')`.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Farm } from '@/types';

const farmKeys = {
  all: ['farms'] as const,
  byId: (id: number) => ['farms', id] as const,
};

export function useFarms() {
  return useQuery<Farm[]>({
    queryKey: farmKeys.all,
    queryFn: () => apiFetch.listFarms(),
  });
}

export function useFarm(id: number | undefined) {
  return useQuery<Farm>({
    queryKey: id ? farmKeys.byId(id) : ['farms', 'none'],
    queryFn: () => apiFetch.getFarm(id!),
    enabled: !!id,
  });
}

export function useCreateFarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Farm, 'id' | 'createdAt'>) => apiFetch.createFarm(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: farmKeys.all }),
  });
}

export function useUpdateFarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Farm> }) => apiFetch.updateFarm(id, patch),
    onSuccess: (farm) => {
      qc.invalidateQueries({ queryKey: farmKeys.all });
      qc.invalidateQueries({ queryKey: farmKeys.byId(farm.id) });
    },
  });
}

export function useDeleteFarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch.deleteFarm(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: farmKeys.all }),
  });
}
