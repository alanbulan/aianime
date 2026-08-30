import type { CommercialIdentityGateway } from "@/modules/identity_access/application/commercial-session-ports";
import {
  parseCommercialCaptcha,
  parseCommercialPublicConfig,
  parseCommercialRememberedLogin,
  parseCommercialSession,
  parseCommercialUserProfile,
  parsePasswordResetVerification,
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
  async rememberedLogin() {
    const login = await invokeCommercial(() =>
      requireCommercialBridge().rememberedLogin(),
    );
    return login ? parseCommercialRememberedLogin(login) : null;
  },
  async revealRememberedPassword() {
    const password = await invokeCommercial(() =>
      requireCommercialBridge().revealRememberedPassword(),
    );
    if (typeof password !== "string" || password.length === 0) {
      throw new Error("Remembered commercial password is unavailable");
    }
    return password;
  },
  async login(input) {
    return parseCommercialSession(
      await invokeCommercial(() => requireCommercialBridge().login(input)),
    );
  },
  async loginRemembered(input) {
    return parseCommercialSession(
      await invokeCommercial(() =>
        requireCommercialBridge().loginRemembered(input),
      ),
    );
  },
  logout() {
    return invokeCommercial(() => requireCommercialBridge().logout());
  },
  async fetchProfile() {
    return parseCommercialUserProfile(
      await invokeCommercial(() => requireCommercialBridge().profile()),
    );
  },
  async updateProfile(input) {
    return parseCommercialUserProfile(
      await invokeCommercial(() =>
        requireCommercialBridge().updateProfile(input),
      ),
    );
  },
  async fetchAvatar() {
    const avatar = await invokeCommercial(() =>
      requireCommercialBridge().avatar(),
    );
    if (
      !avatar.contentType.startsWith("image/") ||
      !avatar.dataUrl.startsWith(`data:${avatar.contentType};base64,`)
    ) {
      throw new Error("Commercial Gateway returned an invalid protected avatar");
    }
    return avatar;
  },
  async uploadAvatar(input) {
    const result = await invokeCommercial(() =>
      requireCommercialBridge().uploadAvatar(input),
    );
    return {
      profile: parseCommercialUserProfile(result.profile),
      avatar: result.avatar,
    };
  },
  async deleteAvatar() {
    const result = await invokeCommercial(() =>
      requireCommercialBridge().deleteAvatar(),
    );
    return { profile: parseCommercialUserProfile(result.profile) };
  },
  changePassword(oldPassword, newPassword) {
    return invokeCommercial(() =>
      requireCommercialBridge().changePassword({ oldPassword, newPassword }),
    );
  },
  sendPasswordResetCode(tenantCode, email) {
    return invokeCommercial(() =>
      requireCommercialBridge().sendPasswordResetCode({ tenantCode, email }),
    );
  },
  async verifyPasswordResetCode(tenantCode, email, code) {
    return parsePasswordResetVerification(
      await invokeCommercial(() =>
        requireCommercialBridge().verifyPasswordResetCode({
          tenantCode,
          email,
          code,
        }),
      ),
    );
  },
  resetPassword(tenantCode, resetTicket, newPassword) {
    return invokeCommercial(() =>
      requireCommercialBridge().resetPassword({
        tenantCode,
        resetTicket,
        newPassword,
      }),
    );
  },
};
