// Copyright (c) 2026 AI anime
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/modules/identity_access/public";
import { useRegionStore } from "@/shared/stores/region-store";
import { getRegionCookie, setRegionCookie, clearRegionCookie } from "@/lib/region-cookie";

describe("switchRegion orchestrator", () => {
  beforeEach(() => {
    // Clear module-level state (e.g. nav-lock) between tests so every case
    // starts with the lock released. We also re-import the static dependency
    // graph below to keep the zustand store singleton aligned with what the
    // dynamically-imported orchestrator sees.
    vi.resetModules();
    useAuthStore.setState({ username: "alice", role: "admin" });
    useRegionStore.setState({ selectedRegionId: "cn-1", isSwitching: false, isLocked: false });
    clearRegionCookie();
    setRegionCookie("cn-1");
    vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("runs the full flow in order, sets new cookie, and hard-reloads", async () => {
    // After resetModules, a fresh import of the orchestrator loads fresh
    // copies of every dependency — including the auth store singleton. Resolve
    // that same instance and spy on its logout so the assertion can observe it.
    const { switchRegion } = await import("@/lib/region-switch");
    const { useAuthStore: freshAuthStore } = await import(
      "@/modules/identity_access/public"
    );
    const logoutSpy = vi.spyOn(freshAuthStore.getState(), "logout").mockResolvedValue();
    await switchRegion({ newRegionId: "us-1", queryClient: new QueryClient() });
    expect(logoutSpy).toHaveBeenCalled();
    expect(getRegionCookie()).toBe("us-1");
    expect(window.location.assign).toHaveBeenCalledWith("/login");
  });

  it("times out a hanging logout after 2s and proceeds", async () => {
    vi.useFakeTimers();
    const { switchRegion } = await import("@/lib/region-switch");
    const { useAuthStore: freshAuthStore } = await import(
      "@/modules/identity_access/public"
    );
    vi.spyOn(freshAuthStore.getState(), "logout").mockReturnValue(new Promise(() => {}));
    const p = switchRegion({ newRegionId: "us-1", queryClient: new QueryClient() });
    await vi.advanceTimersByTimeAsync(2100);
    await p;
    expect(getRegionCookie()).toBe("us-1");
    expect(window.location.assign).toHaveBeenCalledWith("/login");
  });

  it("backs off if nav-lock is already held", async () => {
    const { tryAcquireNavLock } = await import("@/lib/nav-lock");
    tryAcquireNavLock(); // a prior flow holds the lock
    const { switchRegion } = await import("@/lib/region-switch");
    const { useAuthStore: freshAuthStore } = await import(
      "@/modules/identity_access/public"
    );
    const logoutSpy = vi.spyOn(freshAuthStore.getState(), "logout");
    await switchRegion({ newRegionId: "us-1", queryClient: new QueryClient() });
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
