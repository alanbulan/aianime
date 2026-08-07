// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

describe("application module graph", () => {
  it(
    "initializes the generated route tree without temporal dead-zone errors",
    async () => {
      vi.resetModules();

      await expect(import("@/app/router")).resolves.toHaveProperty("router");
    },
    60_000,
  );

  it(
    "initializes the cross-context lazy routes without temporal dead-zone errors",
    async () => {
      vi.resetModules();
      await import("@/app/router");

      const routes = [
        () => import("@/routes/_app/projects.$project/characters.lazy"),
        () =>
          import(
            "@/routes/_app/projects.$project/episodes.$episode/beats.lazy"
          ),
        () =>
          import(
            "@/routes/_app/projects.$project/episodes.$episode/compose.lazy"
          ),
        () => import("@/routes/_app/projects.$project/freezone.lazy"),
      ];

      for (const loadRoute of routes) {
        await expect(loadRoute()).resolves.toHaveProperty("Route");
      }
    },
    30_000,
  );
});
