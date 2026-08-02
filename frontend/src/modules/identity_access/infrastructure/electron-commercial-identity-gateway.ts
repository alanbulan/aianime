import type { CommercialIdentityGateway } from "@/modules/identity_access/application/commercial-session-ports";
import {
  parseCommercialCaptcha,
  parseCommercialPublicConfig,
  parseCommercialSession,
} from "@/modules/identity_access/domain/commercial-session";

function bridge(): AIAnimeCommercialBridge {
  const commercial = window.aiAnimeDesktop?.commercial;
  if (!commercial) throw new Error("Commercial Gateway requires the Electron desktop app");
  return commercial;
}

export const electronCommercialIdentityGateway: CommercialIdentityGateway = {
  async status() {
    const commercial = window.aiAnimeDesktop?.commercial;
    return commercial
      ? commercial.status()
      : { configured: false, gatewayOrigin: "" };
  },
  async fetchPublicConfig(tenantCode) {
    return parseCommercialPublicConfig(await bridge().publicConfig(tenantCode));
  },
  async fetchPublicLogo(tenantCode) {
    const logo = await bridge().publicLogo(tenantCode);
    if (!logo.contentType.startsWith("image/") || !logo.dataUrl.startsWith("data:image/")) {
      throw new Error("Commercial Gateway returned an invalid public Logo");
    }
    return logo;
  },
  async fetchCaptcha(tenantCode) {
    return parseCommercialCaptcha(await bridge().publicCaptcha(tenantCode));
  },
  async restoreSession() {
    const session = await bridge().session();
    return session ? parseCommercialSession(session) : null;
  },
  async login(input) {
    return parseCommercialSession(await bridge().login(input));
  },
  logout() {
    return bridge().logout();
  },
};
