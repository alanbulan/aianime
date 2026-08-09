import type { CommercialIdentityGateway } from "@/modules/identity_access/application/commercial-session-ports";
import {
  parseCommercialCaptcha,
  parseCommercialPublicConfig,
  parseCommercialSession,
} from "@/modules/identity_access/domain/commercial-session";
import {
  getCommercialBridge,
  invokeCommercial,
  requireCommercialBridge,
} from "@/shared/commercial-bridge";

export const electronCommercialIdentityGateway: CommercialIdentityGateway = {
  async status() {
    const commercial = getCommercialBridge();
    return commercial
      ? invokeCommercial(() => commercial.status())
      : { configured: false, gatewayOrigin: "" };
  },
  async fetchPublicConfig(tenantCode) {
    return parseCommercialPublicConfig(
      await invokeCommercial(() =>
        requireCommercialBridge().publicConfig(tenantCode),
      ),
    );
  },
  async fetchPublicLogo(tenantCode) {
    const logo = await invokeCommercial(() =>
      requireCommercialBridge().publicLogo(tenantCode),
    );
    if (!logo.contentType.startsWith("image/") || !logo.dataUrl.startsWith("data:image/")) {
      throw new Error("Commercial Gateway returned an invalid public Logo");
    }
    return logo;
  },
  async fetchCaptcha(tenantCode) {
    return parseCommercialCaptcha(
      await invokeCommercial(() =>
        requireCommercialBridge().publicCaptcha(tenantCode),
      ),
    );
  },
  register(input) {
    return invokeCommercial(() => requireCommercialBridge().register(input));
  },
  async restoreSession() {
    const session = await invokeCommercial(() => requireCommercialBridge().session());
    return session ? parseCommercialSession(session) : null;
  },
  async login(input) {
    return parseCommercialSession(
      await invokeCommercial(() => requireCommercialBridge().login(input)),
    );
  },
  logout() {
    return invokeCommercial(() => requireCommercialBridge().logout());
  },
};
