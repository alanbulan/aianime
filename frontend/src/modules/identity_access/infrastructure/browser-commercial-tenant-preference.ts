import type { CommercialTenantPreference } from "@/modules/identity_access/application/commercial-session-ports";

const TENANT_CODE_KEY = "ai-anime-commercial-tenant";

export const browserCommercialTenantPreference: CommercialTenantPreference = {
  read() {
    try {
      return localStorage.getItem(TENANT_CODE_KEY)?.trim() ?? "";
    } catch {
      return "";
    }
  },
  write(tenantCode) {
    try {
      const normalized = tenantCode.trim();
      if (normalized) localStorage.setItem(TENANT_CODE_KEY, normalized);
      else localStorage.removeItem(TENANT_CODE_KEY);
    } catch {
      // Tenant preference is optional; authentication remains available.
    }
  },
};
