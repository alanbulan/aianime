import { regionAbortController } from "@/lib/region-abort";
import type { OkResponse } from "@/types/api";

export interface CurrentUser {
  username: string;
  role: string;
  credit_balance: number;
  credential_kind?: string;
  avatar_url?: string | null;
}

export class AuthAdapterError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "AuthAdapterError";
  }
}

export interface AuthAdapter {
  login: (username: string, password: string) => Promise<CurrentUser>;
  authorize: (code: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  getCurrentUser: () => Promise<CurrentUser>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      signal: regionAbortController().signal,
    });
  } catch (error) {
    throw new AuthAdapterError(error instanceof Error ? error.message : String(error), null);
  }

  if (!response.ok) {
    let body: { error?: string; detail?: string } | null = null;
    if (typeof response.json === "function") {
      body = await response.json().catch(() => null) as
        | { error?: string; detail?: string }
        | null;
    }
    throw new AuthAdapterError(
      body?.error || body?.detail || `Authentication failed (${response.status})`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export const authAdapter: AuthAdapter = {
  async login(username, password) {
    const body = await request<OkResponse<CurrentUser>>("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return body.data;
  },
  async authorize(code) {
    const body = await request<OkResponse<CurrentUser>>("/api/v1/auth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    return body.data;
  },
  async logout() {
    await request<{ ok: true }>("/api/v1/auth/logout", { method: "POST" });
  },
  async getCurrentUser() {
    const body = await request<OkResponse<CurrentUser>>("/api/v1/auth/me");
    return body.data;
  },
};
