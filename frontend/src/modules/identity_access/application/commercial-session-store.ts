import { create, type StoreApi, type UseBoundStore } from "zustand";

import type {
  CommercialIdentityGateway,
  CommercialTenantPreference,
} from "@/modules/identity_access/application/commercial-session-ports";
import type {
  CommercialCaptcha,
  CommercialLoginInput,
  CommercialPublicConfig,
  CommercialRegistrationInput,
  CommercialSession,
} from "@/modules/identity_access/domain/commercial-session";

export type CommercialAvailability = "unknown" | "unconfigured" | "configured";

export interface CommercialAuthState {
  availability: CommercialAvailability;
  session: CommercialSession | null;
  tenantCode: string;
  publicConfig: CommercialPublicConfig | null;
  logoDataUrl: string | null;
  captcha: CommercialCaptcha | null;
  initialize: () => Promise<void>;
  setTenantCode: (tenantCode: string) => void;
  loadPublicConfig: (tenantCode?: string) => Promise<CommercialPublicConfig>;
  refreshCaptcha: () => Promise<CommercialCaptcha>;
  register: (input: CommercialRegistrationInput) => Promise<void>;
  login: (input: CommercialLoginInput) => Promise<CommercialSession>;
  logout: () => Promise<void>;
}

export type CommercialAuthStore = UseBoundStore<StoreApi<CommercialAuthState>>;

export function createCommercialAuthStore(
  gateway: CommercialIdentityGateway,
  tenantPreference: CommercialTenantPreference,
): CommercialAuthStore {
  let initializeInFlight: Promise<void> | null = null;

  return create<CommercialAuthState>((set, get) => ({
    availability: "unknown",
    session: null,
    tenantCode: tenantPreference.read(),
    publicConfig: null,
    logoDataUrl: null,
    captcha: null,
    initialize: async () => {
      if (get().availability !== "unknown") return;
      if (initializeInFlight) return initializeInFlight;
      initializeInFlight = (async () => {
        const status = await gateway.status();
        if (!status.configured) {
          set({ availability: "unconfigured", session: null });
          return;
        }
        const session = await gateway.restoreSession();
        set({ availability: "configured", session });
      })();
      try {
        await initializeInFlight;
      } finally {
        initializeInFlight = null;
      }
    },
    setTenantCode: (tenantCode) => {
      const normalized = tenantCode.trim();
      tenantPreference.write(normalized);
      set((state) => ({
        tenantCode: normalized,
        ...(normalized === state.tenantCode
          ? {}
          : { publicConfig: null, logoDataUrl: null, captcha: null }),
      }));
    },
    loadPublicConfig: async (tenantCodeOverride) => {
      const tenantCode = (tenantCodeOverride ?? get().tenantCode).trim();
      if (!tenantCode) throw new Error("Tenant code is required");
      const publicConfig = await gateway.fetchPublicConfig(tenantCode);
      let logoDataUrl: string | null = null;
      if (publicConfig.system.logo) {
        try {
          logoDataUrl = (await gateway.fetchPublicLogo(tenantCode)).dataUrl;
        } catch {
          // Branding remains usable when the optional binary Logo is unavailable.
        }
      }
      let captcha: CommercialCaptcha | null = null;
      if (publicConfig.login.captchaEnabled) {
        if ((publicConfig.login.captchaType ?? "image") !== "image") {
          throw new Error("Gateway 尚未提供滑块验证码客户端契约");
        }
        captcha = await gateway.fetchCaptcha(tenantCode);
      }
      tenantPreference.write(tenantCode);
      set({ tenantCode, publicConfig, logoDataUrl, captcha });
      return publicConfig;
    },
    refreshCaptcha: async () => {
      const tenantCode = get().tenantCode.trim();
      if (!tenantCode) throw new Error("Tenant code is required");
      const captcha = await gateway.fetchCaptcha(tenantCode);
      set({ captcha });
      return captcha;
    },
    register: async (input) => {
      const tenantCode = input.tenantCode.trim();
      const state = get();
      let publicConfig = state.publicConfig;
      if (!publicConfig || state.tenantCode !== tenantCode) {
        publicConfig = await state.loadPublicConfig(tenantCode);
      }
      if (!publicConfig.register?.enabled) {
        throw new Error("Registration is disabled for this tenant");
      }
      if (
        publicConfig.register.verifyEmail ||
        publicConfig.register.verifyPhone
      ) {
        throw new Error("Registration verification contract is unavailable");
      }
      const captcha = get().captcha;
      if (publicConfig.login.captchaEnabled && !input.captchaCode?.trim()) {
        throw new Error("Captcha code is required");
      }
      try {
        await gateway.register({
          ...input,
          tenantCode,
          ...(publicConfig.login.captchaEnabled && captcha
            ? { captchaKey: captcha.key, captchaCode: input.captchaCode!.trim() }
            : {}),
        });
      } catch (error) {
        if (publicConfig.login.captchaEnabled) {
          await get().refreshCaptcha().catch(() => undefined);
        }
        throw error;
      }
    },
    login: async (input) => {
      const tenantCode = input.tenantCode.trim();
      const state = get();
      let publicConfig = state.publicConfig;
      if (!publicConfig || state.tenantCode !== tenantCode) {
        publicConfig = await state.loadPublicConfig(tenantCode);
      }
      const captcha = get().captcha;
      if (publicConfig.login.captchaEnabled && !input.captchaCode?.trim()) {
        throw new Error("Captcha code is required");
      }
      try {
        const session = await gateway.login({
          ...input,
          tenantCode,
          ...(publicConfig.login.captchaEnabled && captcha
            ? { captchaKey: captcha.key, captchaCode: input.captchaCode!.trim() }
            : {}),
        });
        tenantPreference.write(tenantCode);
        set({ availability: "configured", tenantCode, session, captcha: null });
        return session;
      } catch (error) {
        if (publicConfig.login.captchaEnabled) {
          await get().refreshCaptcha().catch(() => undefined);
        }
        throw error;
      }
    },
    logout: async () => {
      try {
        await gateway.logout();
      } finally {
        set({ session: null });
      }
    },
  }));
}
