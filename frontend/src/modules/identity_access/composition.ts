import { quotaSafeStateStorage } from "@/lib/localStorageQuota";
import { createUseCurrentUser } from "@/modules/identity_access/application/query-hooks";
import { createCommercialAuthStore } from "@/modules/identity_access/application/commercial-session-store";
import { createCommercialEntitlementStore } from "@/modules/identity_access/application/commercial-entitlement-store";
import { createAuthStore } from "@/modules/identity_access/application/session-store";
import { browserCommercialTenantPreference } from "@/modules/identity_access/infrastructure/browser-commercial-tenant-preference";
import { electronCommercialIdentityGateway } from "@/modules/identity_access/infrastructure/electron-commercial-identity-gateway";
import { electronCommercialEntitlementGateway } from "@/modules/identity_access/infrastructure/electron-commercial-entitlement-gateway";
import { httpIdentityGateway } from "@/modules/identity_access/infrastructure/http-identity-gateway";

export const useAuthStore = createAuthStore(
  httpIdentityGateway,
  quotaSafeStateStorage,
);
export const useCommercialAuthStore = createCommercialAuthStore(
  electronCommercialIdentityGateway,
  browserCommercialTenantPreference,
);
export const useCommercialEntitlementStore = createCommercialEntitlementStore(
  electronCommercialEntitlementGateway,
);

export const useCurrentUser = createUseCurrentUser(useAuthStore);

export async function logoutAllSessions(): Promise<void> {
  await useAuthStore.getState().logout();
  const commercial = useCommercialAuthStore.getState();
  if (commercial.availability === "configured") await commercial.logout();
  useCommercialEntitlementStore.getState().reset();
}
