// Copyright (c) 2026 AI anime
import { describe, it, expect } from "vitest";
import { api } from "@/shared/api/transport";

describe("api client", () => {
  it("is a ky instance with expected methods", () => {
    expect(api).toBeDefined();
    expect(typeof api.get).toBe("function");
    expect(typeof api.post).toBe("function");
    expect(typeof api.patch).toBe("function");
    expect(typeof api.put).toBe("function");
    expect(typeof api.delete).toBe("function");
  });
});
