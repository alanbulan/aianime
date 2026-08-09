import type {
  CommercialCaptcha,
  CommercialLoginInput,
  CommercialPublicConfig,
  CommercialRegistrationInput,
  CommercialSession,
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
}

export interface CommercialTenantPreference {
  read(): string;
  write(tenantCode: string): void;
}
