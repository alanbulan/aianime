import { create, type StoreApi, type UseBoundStore } from "zustand";

import type { CommercialEntitlementGateway } from "@/modules/identity_access/application/commercial-entitlement-ports";
import type { CommercialEntitlement } from "@/modules/identity_access/domain/commercial-entitlement";

export type CommercialEntitlementStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface CommercialEntitlementState {
  status: CommercialEntitlementStatus;
  entitlement: CommercialEntitlement | null;
  error: string | null;
  beginBootstrap: () => void;
  completeBootstrap: (entitlement: CommercialEntitlement) => void;
  failBootstrap: (error: unknown) => void;
  refresh: () => Promise<CommercialEntitlement>;
  activateCurrentDevice: () => Promise<CommercialEntitlement>;
  refreshLease: () => Promise<CommercialEntitlement>;
  deactivateCurrentDevice: (reason: string) => Promise<CommercialEntitlement>;
  reset: () => void;
}

export type CommercialEntitlementStore = UseBoundStore<
  StoreApi<CommercialEntitlementState>
>;

export function createCommercialEntitlementStore(
  gateway: CommercialEntitlementGateway,
): CommercialEntitlementStore {
  const run = async (
    operation: () => Promise<CommercialEntitlement>,
    set: StoreApi<CommercialEntitlementState>["setState"],
  ): Promise<CommercialEntitlement> => {
    set({ status: "loading", error: null });
    try {
      const entitlement = await operation();
      set({ status: "ready", entitlement, error: null });
      return entitlement;
    } catch (error) {
      set({
        status: "error",
        entitlement: null,
        error: error instanceof Error ? error.message : "Commercial license request failed",
      });
      throw error;
    }
  };

  return create<CommercialEntitlementState>((set) => ({
    status: "idle",
    entitlement: null,
    error: null,
    beginBootstrap: () => set({ status: "loading", error: null }),
    completeBootstrap: (entitlement) =>
      set({ status: "ready", entitlement, error: null }),
    failBootstrap: (error) =>
      set({
        status: "error",
        entitlement: null,
        error:
          error instanceof Error
            ? error.message
            : "Commercial bootstrap request failed",
      }),
    refresh: () => run(gateway.current, set),
    activateCurrentDevice: () => run(gateway.activateCurrentDevice, set),
    refreshLease: () => run(gateway.refreshLease, set),
    deactivateCurrentDevice: (reason) =>
      run(() => gateway.deactivateCurrentDevice(reason), set),
    reset: () => set({ status: "idle", entitlement: null, error: null }),
  }));
}
