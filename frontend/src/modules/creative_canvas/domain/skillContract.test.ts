// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { SKILL_SCHEMA_VERSION } from "./skillContract";

describe("Freezone skill contract", () => {
  it("preserves the persisted schema version", () => {
    expect(SKILL_SCHEMA_VERSION).toBe("skill.v1");
  });
});
