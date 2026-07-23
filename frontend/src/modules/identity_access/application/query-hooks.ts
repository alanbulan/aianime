// Copyright (c) 2026 AI anime
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { AuthStore } from "@/modules/identity_access/application/session-store";
import type { CurrentUser } from "@/modules/identity_access/domain/session";

interface CurrentUserResponse {
  ok: true;
  data: CurrentUser;
}

export function createUseCurrentUser(authStore: AuthStore) {
  return function useCurrentUser(enabled = true) {
    return useQuery({
      queryKey: queryKeys.currentUser(),
      queryFn: async (): Promise<CurrentUserResponse> => {
        const user = await authStore.getState().getCurrentUser({
          clearOnNetworkFailure: false,
        });
        if (!user) throw new Error("Not authenticated");
        return { ok: true, data: user };
      },
      enabled,
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    });
  };
}
