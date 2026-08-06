// Copyright (c) 2026 AI anime
import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { QueryClient } from "@tanstack/react-query";
import { installApiRuntime } from "@/app/api-runtime";
import { api } from "@/shared/api/transport";
import { setRegionCookie, getRegionCookie } from "@/lib/region-cookie";
import { server } from "@/__mocks__/msw/server";
import { useRegionStore } from "@/shared/stores/region-store";

let queryClient: QueryClient;

beforeEach(() => {
  server.resetHandlers();
  queryClient = new QueryClient();
  installApiRuntime(queryClient);
  useRegionStore.getState().setRegion("cn-1");
  setRegionCookie("cn-1");
  vi.stubGlobal("location", { ...window.location, href: "/" });
});

describe("api 400 no_region handling", () => {
  it("clears the region cookie + store and redirects to /login when edge returns no_region", async () => {
    const clearSpy = vi.spyOn(queryClient, "clear");
    server.use(
      http.get("http://localhost/api/v1/anything", () =>
        HttpResponse.json({ ok: false, error: "no_region" }, { status: 400 }),
      ),
    );
    await api.get(new URL("/api/v1/anything", "http://localhost/")).catch(() => {});
    expect(clearSpy).toHaveBeenCalled();
    expect(getRegionCookie()).toBeNull();
    expect(useRegionStore.getState().selectedRegionId).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("ignores generic 400s that do not carry error=no_region", async () => {
    server.use(
      http.get("http://localhost/api/v1/validation", () =>
        HttpResponse.json({ ok: false, error: "bad_input" }, { status: 400 }),
      ),
    );
    setRegionCookie("cn-1");
    useRegionStore.getState().setRegion("cn-1");
    await api.get(new URL("/api/v1/validation", "http://localhost/")).catch(() => {});
    expect(getRegionCookie()).toBe("cn-1");
    expect(useRegionStore.getState().selectedRegionId).toBe("cn-1");
  });
});
