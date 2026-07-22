// Copyright (c) 2026 AI anime
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { quotaSafeStateStorage } from "@/lib/localStorageQuota";
import { regionAbortController } from "@/lib/region-abort";
import { authAdapter, AuthAdapterError, type CurrentUser } from "@/lib/auth-adapter";

export type { CurrentUser } from "@/lib/auth-adapter";

interface GetCurrentUserOptions {
  clearOnNetworkFailure?: boolean;
}

interface CurrentUserFetchResult {
  user: CurrentUser | null;
  authFailure: boolean;
  networkFailure: boolean;
}

export interface AuthState {
  username: string | null;
  role: string | null;
  avatarUrl: string | null;
  login: (username: string, password: string) => Promise<void>;
  authorize: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  validateSession: () => Promise<boolean>;
  getCurrentUser: (options?: GetCurrentUserOptions) => Promise<CurrentUser | null>;
  setAvatarUrl: (url: string | null) => void;
  refreshAvatar: () => Promise<void>;
  reset: () => void;
}

const SESSION_VALIDATION_TTL_MS = 15_000;

let currentUserInFlight: Promise<CurrentUserFetchResult> | null = null;
let cachedCurrentUser: CurrentUser | null = null;
let lastSuccessfulValidationAt = 0;

// Schema guard for persisted auth blob. Anything that doesn't match exactly
// gets discarded so a tampered localStorage value can't inject objects into
// the store. Previously the persisted payload also carried `apiKey`; the SPA
// is now cookie-backed so we deliberately ignore that field even if legacy
// clients have one sitting in localStorage — letting the cookie drive auth
// avoids two sources of truth disagreeing.
function sanitizePersisted(raw: unknown): Pick<AuthState, "username" | "role"> {
  const empty = { username: null, role: null };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    username: str(r.username),
    role: str(r.role),
  };
}

function clearCurrentUserCache(): void {
  currentUserInFlight = null;
  cachedCurrentUser = null;
  lastSuccessfulValidationAt = 0;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      username: null,
      role: null,
      avatarUrl: null,
      login: async (username: string, password: string) => {
        const user = await authAdapter.login(username, password);
        cachedCurrentUser = user;
        lastSuccessfulValidationAt = Date.now();
        set({
          username: user.username,
          role: user.role,
        });
        void useAuthStore.getState().refreshAvatar();
      },
      authorize: async (code: string) => {
        const user = await authAdapter.authorize(code);
        cachedCurrentUser = user;
        lastSuccessfulValidationAt = Date.now();
        set({ username: user.username, role: user.role });
        void useAuthStore.getState().refreshAvatar();
      },
      logout: async () => {
        // Ask the BE to clear the HttpOnly cookie. If the network call fails
        // we still tear down the local username/role so the UI redirects to
        // /login — a phantom cookie can be cleaned up on the next login.
        try {
          await authAdapter.logout();
        } catch {
          /* ignore — local logout proceeds regardless */
        }
        clearCurrentUserCache();
        set({ username: null, role: null, avatarUrl: null });
      },
      getCurrentUser: async (options: GetCurrentUserOptions = {}) => {
        // The cookie isn't visible to JS (HttpOnly), so we can't pre-check
        // it. Ask the BE directly: /auth/me is cheap and its 401 path
        // tells us the cookie is missing or stale.
        if (
          cachedCurrentUser &&
          Date.now() - lastSuccessfulValidationAt < SESSION_VALIDATION_TTL_MS
        ) {
          return cachedCurrentUser;
        }
        const request =
          currentUserInFlight ??
          (currentUserInFlight = (async (): Promise<CurrentUserFetchResult> => {
            try {
              const user = await authAdapter.getCurrentUser();
              cachedCurrentUser = user;
              lastSuccessfulValidationAt = Date.now();
              set({
                username: user.username,
                role: user.role,
              });
              return { user, authFailure: false, networkFailure: false };
            } catch (error) {
              if (error instanceof AuthAdapterError) {
                if (error.status === 401 || error.status === 403) {
                  return { user: null, authFailure: true, networkFailure: false };
                }
                return {
                  user: null,
                  authFailure: false,
                  networkFailure: error.status === null,
                };
              }
              return { user: null, authFailure: false, networkFailure: true };
            }
          })());
        try {
          const result = await request;
          const shouldClearAuth =
            result.authFailure ||
            (result.networkFailure && options.clearOnNetworkFailure !== false);
          if (shouldClearAuth) {
            // Route guards use the strict default so a failed session check does
            // not bounce between "/" and "/login". Lightweight consumers such as
            // the credit badge can opt out for transient network failures.
            clearCurrentUserCache();
            set({ username: null, role: null, avatarUrl: null });
          }
          return result.user;
        } finally {
          if (currentUserInFlight === request) {
            currentUserInFlight = null;
          }
        }
      },
      validateSession: async (): Promise<boolean> =>
        Boolean(await useAuthStore.getState().getCurrentUser()),
      setAvatarUrl: (url: string | null) => {
        if (cachedCurrentUser) cachedCurrentUser = { ...cachedCurrentUser, avatar_url: url };
        set({ avatarUrl: url });
      },
      refreshAvatar: async () => {
        // EE-only avatar endpoint; absent on CE backends, so failures are silent.
        try {
          const res = await fetch("/api/v1/account/avatar", {
            credentials: "include",
            signal: regionAbortController().signal,
          });
          if (!res.ok) return;
          const body = await res.json();
          useAuthStore.getState().setAvatarUrl(body?.data?.avatar_url ?? null);
        } catch {
          /* ignore — avatar is non-critical */
        }
      },
      reset: () => {
        clearCurrentUserCache();
        set({ username: null, role: null, avatarUrl: null });
      },
    }),
    {
      name: "ai-anime-auth",
      storage: createJSONStorage(() => quotaSafeStateStorage),
      partialize: (state) => ({
        username: state.username,
        role: state.role,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizePersisted(persisted),
      }),
    },
  ),
);
