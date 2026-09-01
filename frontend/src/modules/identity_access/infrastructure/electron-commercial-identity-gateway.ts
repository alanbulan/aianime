import type { CommercialIdentityGateway } from "@/modules/identity_access/application/commercial-session-ports";
import {
  parseCommercialAvatarUploadResult,
  parseCommercialCaptcha,
  parseCommercialImage,
  parseCommercialLogoutResult,
  parseCommercialPasswordChangeResult,
  parseCommercialPasswordResetResult,
  parseCommercialProfileResult,
  parseCommercialPublicConfig,
  parseCommercialRememberedLogin,
  parseCommercialSession,
  parseCommercialStatus,
  parseCommercialSuccessMessage,
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
      ? parseCommercialStatus(await invokeCommercial(() => commercial.status()))
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
    return parseCommercialImage(
      await invokeCommercial(() =>
        requireCommercialBridge().publicLogo(tenantCode),
      ),
      "commercial public Logo",
    );
  },
  async fetchCaptcha(tenantCode) {
    return parseCommercialCaptcha(
      await invokeCommercial(() =>
        requireCommercialBridge().publicCaptcha(tenantCode),
      ),
    );
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
  async logout() {
    return parseCommercialLogoutResult(
      await invokeCommercial(() => requireCommercialBridge().logout()),
    );
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
    return parseCommercialImage(
      await invokeCommercial(() => requireCommercialBridge().avatar()),
      "commercial protected avatar",
    );
  },
  async uploadAvatar(input) {
    return parseCommercialAvatarUploadResult(
      await invokeCommercial(() =>
        requireCommercialBridge().uploadAvatar(input),
      ),
    );
  },
  async deleteAvatar() {
    return parseCommercialProfileResult(
      await invokeCommercial(() => requireCommercialBridge().deleteAvatar()),
    );
  },
  async changePassword(oldPassword, newPassword) {
    return parseCommercialPasswordChangeResult(
      await invokeCommercial(() =>
        requireCommercialBridge().changePassword({ oldPassword, newPassword }),
      ),
    );
  },
  async sendSmsLoginCode(tenantCode, phone) {
    return parseCommercialSuccessMessage(
      await invokeCommercial(() =>
        requireCommercialBridge().sendSmsLoginCode({ tenantCode, phone }),
      ),
      "commercial SMS login code result",
    );
  },
  async sendPasswordResetCode(tenantCode, email) {
    return parseCommercialSuccessMessage(
      await invokeCommercial(() =>
        requireCommercialBridge().sendPasswordResetCode({ tenantCode, email }),
      ),
      "commercial password reset code result",
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
  async resetPassword(tenantCode, resetTicket, newPassword) {
    return parseCommercialPasswordResetResult(
      await invokeCommercial(() =>
        requireCommercialBridge().resetPassword({
          tenantCode,
          resetTicket,
          newPassword,
        }),
      ),
    );
  },
};
