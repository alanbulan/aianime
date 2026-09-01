import { create, type StoreApi, type UseBoundStore } from "zustand";

import type {
  CommercialIdentityGateway,
  CommercialTenantPreference,
} from "@/modules/identity_access/application/commercial-session-ports";
import type {
  CommercialCaptcha,
  CommercialLoginInput,
  CommercialRememberedLogin,
  CommercialProfileUpdateInput,
  CommercialPublicConfig,
  CommercialSession,
  CommercialUserProfile,
} from "@/modules/identity_access/domain/commercial-session";

export type CommercialAvailability = "unknown" | "unconfigured" | "configured";

export interface CommercialAuthState {
  availability: CommercialAvailability;
  session: CommercialSession | null;
  rememberedLogin: CommercialRememberedLogin | null;
  tenantCode: string;
  publicConfig: CommercialPublicConfig | null;
  captcha: CommercialCaptcha | null;
  profile: CommercialUserProfile | null;
  avatarDataUrl: string | null;
  initialize: () => Promise<void>;
  setTenantCode: (tenantCode: string) => void;
  loadPublicConfig: (tenantCode?: string) => Promise<CommercialPublicConfig>;
  refreshCaptcha: () => Promise<CommercialCaptcha>;
  sendSmsLoginCode: (phone: string) => Promise<void>;
  login: (input: CommercialLoginInput) => Promise<CommercialSession>;
  loginRemembered: (
    rememberMe: boolean,
    captchaCode?: string,
  ) => Promise<CommercialSession>;
  revealRememberedPassword: () => Promise<string>;
  logout: () => Promise<void>;
  loadProfile: () => Promise<CommercialUserProfile>;
  updateProfile: (
    input: CommercialProfileUpdateInput,
  ) => Promise<CommercialUserProfile>;
  uploadAvatar: (file: File) => Promise<void>;
  deleteAvatar: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  sendPasswordResetCode: (email: string) => Promise<void>;
  verifyPasswordResetCode: (
    email: string,
    code: string,
  ) => Promise<{ resetTicket: string; expiresIn: number }>;
  resetPassword: (resetTicket: string, newPassword: string) => Promise<void>;
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
    rememberedLogin: null,
    tenantCode: tenantPreference.read(),
    publicConfig: null,
    captcha: null,
    profile: null,
    avatarDataUrl: null,
    initialize: async () => {
      if (get().availability !== "unknown") return;
      if (initializeInFlight) return initializeInFlight;
      initializeInFlight = (async () => {
        const status = await gateway.status();
        if (!status.configured) {
          set({
            availability: "unconfigured",
            session: null,
            rememberedLogin: null,
          });
          return;
        }
        const session = await gateway.restoreSession();
        const rememberedLogin = await gateway.rememberedLogin();
        set({ availability: "configured", session, rememberedLogin });
        if (session) await get().loadProfile().catch(() => undefined);
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
          : { publicConfig: null, captcha: null }),
      }));
    },
    loadPublicConfig: async (tenantCodeOverride) => {
      const tenantCode = (tenantCodeOverride ?? get().tenantCode).trim();
      if (!tenantCode) throw new Error("Tenant code is required");
      const publicConfig = await gateway.fetchPublicConfig(tenantCode);
      let captcha: CommercialCaptcha | null = null;
      if (publicConfig.login.captchaEnabled) {
        captcha = await gateway.fetchCaptcha(tenantCode);
      }
      tenantPreference.write(tenantCode);
      set({ tenantCode, publicConfig, captcha });
      return publicConfig;
    },
    refreshCaptcha: async () => {
      const tenantCode = get().tenantCode.trim();
      if (!tenantCode) throw new Error("Tenant code is required");
      const captcha = await gateway.fetchCaptcha(tenantCode);
      set({ captcha });
      return captcha;
    },
    sendSmsLoginCode: async (phone) => {
      const tenantCode = get().tenantCode.trim();
      if (!tenantCode) throw new Error("Tenant code is required");
      let publicConfig = get().publicConfig;
      if (!publicConfig) {
        publicConfig = await get().loadPublicConfig(tenantCode);
      }
      if (!publicConfig.login.smsLoginEnabled) {
        throw new Error("SMS login is disabled for this tenant");
      }
      await gateway.sendSmsLoginCode(tenantCode, phone.trim());
    },
    login: async (input) => {
      const tenantCode = input.tenantCode.trim();
      const state = get();
      let publicConfig = state.publicConfig;
      if (!publicConfig || state.tenantCode !== tenantCode) {
        publicConfig = await state.loadPublicConfig(tenantCode);
      }
      const isPasswordLogin = input.loginType === "PASSWORD";
      if (!isPasswordLogin && !publicConfig.login.smsLoginEnabled) {
        throw new Error("SMS login is disabled for this tenant");
      }
      const captcha = get().captcha;
      if (
        isPasswordLogin &&
        publicConfig.login.captchaEnabled &&
        !input.captchaCode?.trim()
      ) {
        throw new Error("Captcha code is required");
      }
      try {
        const session = await gateway.login(
          isPasswordLogin
            ? {
                ...input,
                tenantCode,
                ...(publicConfig.login.captchaEnabled && captcha
                  ? {
                      captchaKey: captcha.key,
                      captchaCode: input.captchaCode!.trim(),
                    }
                  : {}),
              }
            : { ...input, tenantCode },
        );
        tenantPreference.write(tenantCode);
        set({
          availability: "configured",
          tenantCode,
          session,
          captcha: null,
          rememberedLogin:
            isPasswordLogin && input.rememberMe
              ? {
                  tenantCode,
                  username: input.username.trim(),
                  hasPassword: true,
                }
              : null,
        });
        await get().loadProfile().catch(() => undefined);
        return session;
      } catch (error) {
        if (isPasswordLogin && publicConfig.login.captchaEnabled) {
          await get().refreshCaptcha().catch(() => undefined);
        }
        throw error;
      }
    },
    loginRemembered: async (rememberMe, captchaCode) => {
      const rememberedLogin = get().rememberedLogin;
      if (!rememberedLogin) throw new Error("没有可用的已保存登录信息");
      let publicConfig = get().publicConfig;
      if (!publicConfig || get().tenantCode !== rememberedLogin.tenantCode) {
        publicConfig = await get().loadPublicConfig(rememberedLogin.tenantCode);
      }
      const captcha = get().captcha;
      if (publicConfig.login.captchaEnabled && !captchaCode?.trim()) {
        throw new Error("Captcha code is required");
      }
      try {
        const session = await gateway.loginRemembered({
          rememberMe,
          ...(publicConfig.login.captchaEnabled && captcha
            ? { captchaKey: captcha.key, captchaCode: captchaCode!.trim() }
            : {}),
        });
        tenantPreference.write(rememberedLogin.tenantCode);
        set({
          availability: "configured",
          tenantCode: rememberedLogin.tenantCode,
          session,
          captcha: null,
          rememberedLogin: rememberMe ? rememberedLogin : null,
        });
        await get().loadProfile().catch(() => undefined);
        return session;
      } catch (error) {
        if (publicConfig.login.captchaEnabled) {
          await get().refreshCaptcha().catch(() => undefined);
        }
        const available = await gateway.rememberedLogin().catch(() => null);
        set({ rememberedLogin: available });
        throw error;
      }
    },
    revealRememberedPassword: async () => {
      if (!get().rememberedLogin) {
        throw new Error("没有可用的已保存登录信息");
      }
      try {
        return await gateway.revealRememberedPassword();
      } catch (error) {
        const available = await gateway.rememberedLogin().catch(() => null);
        set({ rememberedLogin: available });
        throw error;
      }
    },
    logout: async () => {
      let rememberedLogin = get().rememberedLogin;
      try {
        await gateway.logout();
      } finally {
        rememberedLogin = await gateway.rememberedLogin().catch(
          () => rememberedLogin,
        );
        set({
          session: null,
          rememberedLogin,
          profile: null,
          avatarDataUrl: null,
        });
      }
    },
    loadProfile: async () => {
      const profile = await gateway.fetchProfile();
      let avatarDataUrl: string | null = null;
      if (profile.avatar) {
        try {
          avatarDataUrl = (await gateway.fetchAvatar()).dataUrl;
        } catch {
          avatarDataUrl = null;
        }
      }
      set((state) => ({
        profile,
        avatarDataUrl,
        session: mergeProfileIntoSession(state.session, profile),
      }));
      return profile;
    },
    updateProfile: async (input) => {
      const profile = await gateway.updateProfile(input);
      set((state) => ({
        profile,
        session: mergeProfileIntoSession(state.session, profile),
      }));
      return profile;
    },
    uploadAvatar: async (file) => {
      if (!file.type || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Avatar must be JPEG, PNG, or WebP");
      }
      if (file.size < 1 || file.size > 5 * 1024 * 1024) {
        throw new Error("Avatar must be no larger than 5 MiB");
      }
      const result = await gateway.uploadAvatar({
        fileName: file.name,
        contentType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      set((state) => ({
        profile: result.profile,
        avatarDataUrl: result.avatar.dataUrl,
        session: mergeProfileIntoSession(state.session, result.profile),
      }));
    },
    deleteAvatar: async () => {
      const result = await gateway.deleteAvatar();
      set((state) => ({
        profile: result.profile,
        avatarDataUrl: null,
        session: mergeProfileIntoSession(state.session, result.profile),
      }));
    },
    changePassword: async (oldPassword, newPassword) => {
      await gateway.changePassword(oldPassword, newPassword);
      set({ session: null, profile: null, avatarDataUrl: null });
    },
    sendPasswordResetCode: async (email) => {
      await gateway.sendPasswordResetCode(get().tenantCode.trim(), email.trim());
    },
    verifyPasswordResetCode: (email, code) =>
      gateway.verifyPasswordResetCode(
        get().tenantCode.trim(),
        email.trim(),
        code.trim(),
      ),
    resetPassword: async (resetTicket, newPassword) => {
      await gateway.resetPassword(
        get().tenantCode.trim(),
        resetTicket,
        newPassword,
      );
      set({ rememberedLogin: null });
    },
  }));
}

function mergeProfileIntoSession(
  session: CommercialSession | null,
  profile: CommercialUserProfile,
): CommercialSession | null {
  if (!session) return null;
  return {
    ...session,
    user: {
      id: profile.id,
      username: profile.username,
      nickname: profile.nickname,
      email: profile.email,
      avatar: profile.avatar,
    },
  };
}
