import type { CommercialEntitlement } from "@/modules/identity_access/domain/commercial-entitlement";

export interface CommercialEntitlementGateway {
  current(): Promise<CommercialEntitlement>;
  activateCurrentDevice(): Promise<CommercialEntitlement>;
  refreshLease(): Promise<CommercialEntitlement>;
  deactivateCurrentDevice(reason: string): Promise<CommercialEntitlement>;
}
