import { queryClient } from "@/app/query-client";
import {
  createAppRouteAccessResolver,
  parseBootstrapEntitlement,
  useAuthStore,
  useCommercialAuthStore,
  useCommercialEntitlementStore,
  type CommercialEntitlement,
} from "@/modules/identity_access/public";
import { seedCommercialBootstrapModelUsage } from "@/modules/model_usage/public";
import { seedCommercialBootstrapRelease } from "@/modules/platform_release/public";

let bootstrapInFlight: Promise<CommercialEntitlement> | null = null;

function commercialBridge(): AIAnimeCommercialBridge {
  const commercial = window.aiAnimeDesktop?.commercial;
  if (!commercial) {
    throw new Error("Commercial Gateway requires the Electron desktop app");
  }
  return commercial;
}

export async function ensureCommercialBootstrap(): Promise<CommercialEntitlement> {
  const state = useCommercialEntitlementStore.getState();
  if (state.status === "ready" && state.entitlement) {
    return state.entitlement;
  }
  if (bootstrapInFlight) return bootstrapInFlight;

  state.beginBootstrap();
  bootstrapInFlight = (async () => {
    try {
      const payload = await commercialBridge().bootstrap({
        modelOperation: "TEXT",
      });
      const entitlement = parseBootstrapEntitlement(payload);
      seedCommercialBootstrapModelUsage(queryClient, payload);
      seedCommercialBootstrapRelease(queryClient, payload);
      useCommercialEntitlementStore.getState().completeBootstrap(entitlement);
      return entitlement;
    } catch (error) {
      useCommercialEntitlementStore.getState().failBootstrap(error);
      throw error;
    }
  })();

  try {
    return await bootstrapInFlight;
  } finally {
    bootstrapInFlight = null;
  }
}

export const resolveAppRouteAccess = createAppRouteAccessResolver({
  initializeCommercialSession: () =>
    useCommercialAuthStore.getState().initialize(),
  readCommercialSession: () => {
    const state = useCommercialAuthStore.getState();
    return {
      configured: state.availability === "configured",
      authenticated: Boolean(state.session),
    };
  },
  initializeCommercialEntitlement: ensureCommercialBootstrap,
  readLocalUsername: () => useAuthStore.getState().username,
  getCurrentLocalUser: () =>
    useAuthStore
      .getState()
      .getCurrentUser({ clearOnNetworkFailure: false }),
});
