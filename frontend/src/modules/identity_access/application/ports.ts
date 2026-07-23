import type { CurrentUser } from "@/modules/identity_access/domain/session";

export interface IdentityGateway {
  login(username: string, password: string): Promise<CurrentUser>;
  authorize(code: string): Promise<CurrentUser>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<CurrentUser>;
  getAvatarUrl(): Promise<string | null | undefined>;
  uploadAvatar(file: File): Promise<string | null>;
}
