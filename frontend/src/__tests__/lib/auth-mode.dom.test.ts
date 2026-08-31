// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAppRouteAccess } from "@/app/commercial-access";
import { useAuthStore } from "@/modules/identity_access/public";

const runtimeState = vi.hoisted(() => ({ authRequired: true }));

vi.mock("@/lib/runtime-config", () => ({
  authRequired: () => runtimeState.authRequired,
}));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  runtimeState.authRequired = true;
  useAuthStore.getState().reset();
  localStorage.clear();
});

describe("application route authentication", () => {
  it("does not authenticate an empty auth-required runtime session", async () => {
    vi.stubEnv("VITE_AUTH_MODE", "cookie");
    runtimeState.authRequired = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401 })),
    );

    expect(await resolveAppRouteAccess()).toBe("unauthenticated");
  });

  it("uses /auth/me to establish a no-auth runtime session without showing login", async () => {
    vi.stubEnv("VITE_AUTH_MODE", "cookie");
    runtimeState.authRequired = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          data: { username: "local", role: "owner" },
        }),
      })),
    );

    await expect(resolveAppRouteAccess()).resolves.toBe("granted");
    expect(useAuthStore.getState().username).toBe("local");
    expect(useAuthStore.getState().role).toBe("owner");
  });
});
