import type { CommercialEntitlement } from "@/modules/identity_access/domain/commercial-entitlement";
import { commercialEntitlementAllowsWorkspace } from "@/modules/identity_access/domain/commercial-entitlement";

export type AppRouteAccess =
  | "granted"
  | "unauthenticated"
  | "license-required";

export interface AppRouteAccessDependencies {
  initializeCommercialSession: () => Promise<void>;
  readCommercialSession: () => {
    configured: boolean;
    authenticated: boolean;
  };
  initializeCommercialEntitlement: () => Promise<CommercialEntitlement>;
  readLocalUsername: () => string | null;
  getCurrentLocalUser: () => Promise<unknown | null>;
}

export function createAppRouteAccessResolver(
  dependencies: AppRouteAccessDependencies,
): () => Promise<AppRouteAccess> {
  return async () => {
    await dependencies.initializeCommercialSession();
    const commercial = dependencies.readCommercialSession();

    if (commercial.configured) {
      if (!commercial.authenticated) return "unauthenticated";
      try {
        const entitlement =
          await dependencies.initializeCommercialEntitlement();
        if (!commercialEntitlementAllowsWorkspace(entitlement)) {
          return "license-required";
        }
      } catch {
        return "license-required";
      }
    }

    if (dependencies.readLocalUsername()) return "granted";
    return (await dependencies.getCurrentLocalUser())
      ? "granted"
      : "unauthenticated";
  };
}
