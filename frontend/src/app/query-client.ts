// Copyright (c) 2026 AI anime
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Task and stream-backed queries override this or invalidate explicitly.
      staleTime: 30_000,
    },
  },
});
