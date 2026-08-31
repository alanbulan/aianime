// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  catalogRouteValue,
  resolveCatalogRouteSelection,
} from "./catalog-route";

describe("catalog route", () => {
  const items = [
    {
      code: "text-model",
      capabilities: { routeSelector: "cloud:text-model" },
    },
  ];

  it("uses only the explicit route selector", () => {
    expect(catalogRouteValue(items[0]!)).toBe("cloud:text-model");
    expect(catalogRouteValue({ code: "unrouted", capabilities: {} })).toBe("");
  });

  it("does not restore a persisted raw model code", () => {
    expect(resolveCatalogRouteSelection(items, "text-model")).toBe("");
    expect(resolveCatalogRouteSelection(items, "cloud:text-model")).toBe(
      "cloud:text-model",
    );
  });
});
