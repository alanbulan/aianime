import type { CommercialEntitlementGateway } from "@/modules/identity_access/application/commercial-entitlement-ports";
import { parseCommercialEntitlement } from "@/modules/identity_access/domain/commercial-entitlement";
import {
  invokeCommercial,
  requireCommercialBridge,
} from "@/shared/commercial-bridge";

export const electronCommercialEntitlementGateway: CommercialEntitlementGateway = {
  async current() {
    return parseCommercialEntitlement(
      await invokeCommercial(() => requireCommercialBridge().currentLicense()),
    );
  },
  async activateCurrentDevice() {
    return parseCommercialEntitlement(
      await invokeCommercial(() => requireCommercialBridge().activateLicense()),
    );
  },
  async refreshLease() {
    return parseCommercialEntitlement(
      await invokeCommercial(() =>
        requireCommercialBridge().refreshLicenseLease(),
      ),
    );
  },
  async deactivateCurrentDevice(reason) {
    return parseCommercialEntitlement(
      await invokeCommercial(() =>
        requireCommercialBridge().deactivateLicense(reason),
      ),
    );
  },
};
