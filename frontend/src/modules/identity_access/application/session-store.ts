// Copyright (c) 2026 AI anime
import { create, type StoreApi, type UseBoundStore } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";

import { IdentityRequestError } from "@/modules/identity_access/application/errors";
import type { IdentityGateway } from "@/modules/identity_access/application/ports";
import type { CurrentUser } from "@/modules/identity_access/domain/session";

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
  getCurrentUser: (
    options?: GetCurrentUserOptions,
  ) => Promise<CurrentUser | null>;
  setAvatarUrl: (url: string | null) => void;
  refreshAvatar: () => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  reset: () => void;
}

export type AuthStore = UseBoundStore<StoreApi<AuthState>>;
type PersistedAuthState = Pick<AuthState, "username" | "role">;

const SESSION_VALIDATION_TTL_MS = 15_000;

function sanitizePersisted(
  raw: unknown,
): Pick<AuthState, "username" | "role"> {
  const empty = { username: null, role: null };
  if (!raw || typeof raw !== "object") return empty;
  const record = raw as Record<string, unknown>;
  const stringOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;
  return {
    username: stringOrNull(record.username),
    role: stringOrNull(record.role),
  };
}

export function createAuthStore(
  gateway: IdentityGateway,
  storage: StateStorage,
): AuthStore {
  let currentUserInFlight: Promise<CurrentUserFetchResult> | null = null;
  let cachedCurrentUser: CurrentUser | null = null;
  let lastSuccessfulValidationAt = 0;

  const clearCurrentUserCache = () => {
    currentUserInFlight = null;
    cachedCurrentUser = null;
    lastSuccessfulValidationAt = 0;
  };

  const useAuthStore = create<AuthState>()(
    persist<AuthState, [], [], PersistedAuthState>(
      (set, get) => ({
        username: null,
        role: null,
        avatarUrl: null,
        login: async (username, password) => {
          const user = await gateway.login(username, password);
          cachedCurrentUser = user;
          lastSuccessfulValidationAt = Date.now();
          set({ username: user.username, role: user.role });
          void get().refreshAvatar();
        },
        authorize: async (code) => {
          const user = await gateway.authorize(code);
          cachedCurrentUser = user;
          lastSuccessfulValidationAt = Date.now();
          set({ username: user.username, role: user.role });
          void get().refreshAvatar();
        },
        logout: async () => {
          try {
            await gateway.logout();
          } catch {
            // Local session state must be cleared even when logout is offline.
          }
          clearCurrentUserCache();
          set({ username: null, role: null, avatarUrl: null });
        },
        getCurrentUser: async (options = {}) => {
          if (
            cachedCurrentUser &&
            Date.now() - lastSuccessfulValidationAt <
              SESSION_VALIDATION_TTL_MS
          ) {
            return cachedCurrentUser;
          }

          const request =
            currentUserInFlight ??
            (currentUserInFlight = (async (): Promise<CurrentUserFetchResult> => {
              try {
                const user = await gateway.getCurrentUser();
                cachedCurrentUser = user;
                lastSuccessfulValidationAt = Date.now();
                set({ username: user.username, role: user.role });
                return {
                  user,
                  authFailure: false,
                  networkFailure: false,
                };
              } catch (error) {
                if (error instanceof IdentityRequestError) {
                  if (error.status === 401 || error.status === 403) {
                    return {
                      user: null,
                      authFailure: true,
                      networkFailure: false,
                    };
                  }
                  return {
                    user: null,
                    authFailure: false,
                    networkFailure: error.status === null,
                  };
                }
                return {
                  user: null,
                  authFailure: false,
                  networkFailure: true,
                };
              }
            })());

          try {
            const result = await request;
            if (
              result.authFailure ||
              (result.networkFailure &&
                options.clearOnNetworkFailure !== false)
            ) {
              clearCurrentUserCache();
              set({ username: null, role: null, avatarUrl: null });
            }
            return result.user;
          } finally {
            if (currentUserInFlight === request) currentUserInFlight = null;
          }
        },
        validateSession: async (): Promise<boolean> =>
          Boolean(await get().getCurrentUser()),
        setAvatarUrl: (url) => {
          if (cachedCurrentUser) {
            cachedCurrentUser = { ...cachedCurrentUser, avatar_url: url };
          }
          set({ avatarUrl: url });
        },
        refreshAvatar: async () => {
          const avatarUrl = await gateway.getAvatarUrl();
          if (avatarUrl !== undefined) {
            get().setAvatarUrl(avatarUrl);
          }
        },
        uploadAvatar: async (file) => {
          const avatarUrl = await gateway.uploadAvatar(file);
          get().setAvatarUrl(avatarUrl);
        },
        reset: () => {
          clearCurrentUserCache();
          set({ username: null, role: null, avatarUrl: null });
        },
      }),
      {
        name: "ai-anime-auth",
        storage: createJSONStorage(() => storage),
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

  return useAuthStore;
}
