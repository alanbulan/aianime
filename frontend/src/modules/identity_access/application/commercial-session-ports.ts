import type {
  CommercialCaptcha,
  CommercialLoginInput,
  CommercialPasswordResetVerification,
  CommercialProfileUpdateInput,
  CommercialPublicConfig,
  CommercialRegistrationInput,
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
  register(input: CommercialRegistrationInput): Promise<void>;
  restoreSession(): Promise<CommercialSession | null>;
  login(input: CommercialLoginInput): Promise<CommercialSession>;
  logout(): Promise<{ remoteRevoked: boolean }>;
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
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  sendPasswordResetCode(tenantCode: string, email: string): Promise<void>;
  verifyPasswordResetCode(
    tenantCode: string,
    email: string,
    code: string,
  ): Promise<CommercialPasswordResetVerification>;
  resetPassword(
    tenantCode: string,
    resetTicket: string,
    newPassword: string,
  ): Promise<void>;
}

export interface CommercialTenantPreference {
  read(): string;
  write(tenantCode: string): void;
}
