export {
  ensureAuthenticatedForAppRoute,
  useAuthStore,
  useCurrentUser,
} from "@/modules/identity_access/composition";
export type { AuthState } from "@/modules/identity_access/application/session-store";
export type { CurrentUser } from "@/modules/identity_access/domain/session";
