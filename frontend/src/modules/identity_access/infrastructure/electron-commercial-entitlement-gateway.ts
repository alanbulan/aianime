import type { CommercialEntitlementGateway } from "@/modules/identity_access/application/commercial-entitlement-ports";
import { parseCommercialEntitlement } from "@/modules/identity_access/domain/commercial-entitlement";

function bridge(): AIAnimeCommercialBridge {
  const commercial = window.aiAnimeDesktop?.commercial;
  if (!commercial) throw new Error("Commercial Gateway requires the Electron desktop app");
  return commercial;
}

export const electronCommercialEntitlementGateway: CommercialEntitlementGateway = {
  async current() {
    return parseCommercialEntitlement(await bridge().currentLicense());
  },
  async activateCurrentDevice() {
    return parseCommercialEntitlement(await bridge().activateLicense());
  },
  async refreshLease() {
    return parseCommercialEntitlement(await bridge().refreshLicenseLease());
  },
};
