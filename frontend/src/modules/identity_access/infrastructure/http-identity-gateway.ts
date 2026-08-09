import { regionAbortController } from "@/lib/region-abort";
import { IdentityRequestError } from "@/modules/identity_access/application/errors";
import type { IdentityGateway } from "@/modules/identity_access/application/ports";
import type { CurrentUser } from "@/modules/identity_access/domain/session";
import type { OkResponse } from "@/types/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      signal: regionAbortController().signal,
    });
  } catch (error) {
    throw new IdentityRequestError(
      error instanceof Error ? error.message : String(error),
      null,
    );
  }

  if (!response.ok) {
    let body: { error?: string; detail?: string } | null = null;
    if (typeof response.json === "function") {
      body = await response.json().catch(() => null) as
        | { error?: string; detail?: string }
        | null;
    }
    throw new IdentityRequestError(
      body?.error || body?.detail || `Authentication failed (${response.status})`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export const httpIdentityGateway: IdentityGateway = {
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
