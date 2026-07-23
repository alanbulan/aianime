import { quotaSafeStateStorage } from "@/lib/localStorageQuota";
import { createUseCurrentUser } from "@/modules/identity_access/application/query-hooks";
import { createAuthStore } from "@/modules/identity_access/application/session-store";
import { httpIdentityGateway } from "@/modules/identity_access/infrastructure/http-identity-gateway";

export const useAuthStore = createAuthStore(
  httpIdentityGateway,
  quotaSafeStateStorage,
);

export const useCurrentUser = createUseCurrentUser(useAuthStore);

export async function ensureAuthenticatedForAppRoute(): Promise<boolean> {
  const auth = useAuthStore.getState();
  if (auth.username) return true;
  return Boolean(
    await auth.getCurrentUser({ clearOnNetworkFailure: false }),
  );
}
