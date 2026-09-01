import type {
  CommercialCaptcha,
  CommercialLoginInput,
  CommercialRememberedLogin,
  CommercialPasswordResetVerification,
  CommercialProfileUpdateInput,
  CommercialPublicConfig,
  CommercialSession,
  CommercialUserProfile,
} from "@/modules/identity_access/domain/commercial-session";

export interface CommercialIdentityGateway {
  status(): Promise<{ configured: boolean; gatewayOrigin: string }>;
  fetchPublicConfig(tenantCode: string): Promise<CommercialPublicConfig>;
  fetchPublicLogo(
    tenantCode: string,
  ): Promise<{ contentType: string; dataUrl: string }>;
  fetchCaptcha(tenantCode: string): Promise<CommercialCaptcha>;
  restoreSession(): Promise<CommercialSession | null>;
  rememberedLogin(): Promise<CommercialRememberedLogin | null>;
  revealRememberedPassword(): Promise<string>;
  login(input: CommercialLoginInput): Promise<CommercialSession>;
  loginRemembered(input: {
    rememberMe: boolean;
    captchaKey?: string;
    captchaCode?: string;
  }): Promise<CommercialSession>;
  logout(): Promise<{ remoteRevoked: boolean; success: boolean }>;
  fetchProfile(): Promise<CommercialUserProfile>;
  updateProfile(input: CommercialProfileUpdateInput): Promise<CommercialUserProfile>;
  fetchAvatar(): Promise<{ contentType: string; dataUrl: string }>;
  uploadAvatar(input: {
    fileName: string;
    contentType: string;
    bytes: Uint8Array;
  }): Promise<{
    profile: CommercialUserProfile;
    avatar: { contentType: string; dataUrl: string };
  }>;
  deleteAvatar(): Promise<{ profile: CommercialUserProfile }>;
  changePassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<{
    success: boolean;
    sessionsRevoked: boolean;
    tokenReissued: boolean;
  }>;
  sendSmsLoginCode(
    tenantCode: string,
    phone: string,
  ): Promise<{ success: boolean; message: string }>;
  sendPasswordResetCode(
    tenantCode: string,
    email: string,
  ): Promise<{ success: boolean; message: string }>;
  verifyPasswordResetCode(
    tenantCode: string,
    email: string,
    code: string,
  ): Promise<CommercialPasswordResetVerification>;
  resetPassword(
    tenantCode: string,
    resetTicket: string,
    newPassword: string,
  ): Promise<{
    success: boolean;
    message: string;
    sessionsRevoked: boolean;
    tokenReissued: boolean;
  }>;
}

export interface CommercialTenantPreference {
  read(): string;
  write(tenantCode: string): void;
}
