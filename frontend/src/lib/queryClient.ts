import { QueryClient } from "@tanstack/react-query";
import { isApiError } from "@/api/errors";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error) => {
        // a definite answer from the server (auth, permission, validation, not found) will not change on retry
        if (isApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
