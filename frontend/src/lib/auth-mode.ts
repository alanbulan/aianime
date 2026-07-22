// Copyright (c) 2026 AI anime
import { useAuthStore } from "@/stores/auth-store";

export type AuthMode = "cookie" | "local";

export function authMode(): AuthMode {
  return import.meta.env.VITE_AUTH_MODE === "local" ? "local" : "cookie";
}

export function isLocalAuthMode(): boolean {
  return authMode() === "local";
}

export async function ensureAuthenticatedForAppRoute(): Promise<boolean> {
  const auth = useAuthStore.getState();
  if (auth.username) return true;
  return Boolean(await auth.getCurrentUser({ clearOnNetworkFailure: false }));
}
