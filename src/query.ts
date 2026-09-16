import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isApiError(error)) {
          // One retry after a 401: the client middleware refreshes the JWT in between.
          if (error.status === 401) return failureCount < 1;
          if (error.status >= 400 && error.status < 500) return false;
        }
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
