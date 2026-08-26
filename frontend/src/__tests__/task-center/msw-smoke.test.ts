// Copyright (c) 2026 AI anime
import "@/__tests__/setup-msw";

import { describe, it, expect } from "vitest";

describe("MSW smoke", () => {
  it("intercepts GET /api/v1/projects/:project/tasks", async () => {
    const res = await fetch("http://localhost/api/v1/projects/demo/tasks");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].task_type).toBe("script_writer");
  });
});
