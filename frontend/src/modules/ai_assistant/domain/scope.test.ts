// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";
import {
  isChatScope,
  scopeForProject,
  scopeMatches,
  scopeSessionKey,
} from "@/modules/ai_assistant/public";

describe("AI Assistant scope", () => {
  it("maps a trimmed project name to project scope", () => {
    expect(scopeForProject("  project-a  ")).toEqual({
      kind: "project",
      id: "project-a",
    });
  });

  it("maps missing or blank project names to home scope", () => {
    expect(scopeForProject()).toEqual({ kind: "home", id: null });
    expect(scopeForProject("   ")).toEqual({ kind: "home", id: null });
  });

  it("builds a project session key only for a non-empty project ID", () => {
    expect(scopeSessionKey({ kind: "project", id: "project-a" }))
      .toBe("ai_anime:project:project-a:main");
    expect(scopeSessionKey({ kind: "project", id: "" }))
      .toBe("ai_anime:home:main");
    expect(scopeSessionKey({ kind: "home", id: null }))
      .toBe("ai_anime:home:main");
    expect(scopeSessionKey({ kind: "asset", id: "asset-a" }))
      .toBe("ai_anime:home:main");
  });

  it("accepts only supported scope kinds", () => {
    for (const kind of ["home", "project", "asset", "task"] as const) {
      expect(isChatScope({ kind, id: "value" })).toBe(true);
    }
    expect(isChatScope(undefined)).toBe(false);
    expect(isChatScope([])).toBe(false);
    expect(isChatScope({ kind: "unknown" })).toBe(false);
  });

  it("matches home by kind and other scopes by normalized ID", () => {
    expect(scopeMatches(undefined, { kind: "home", id: null })).toBe(false);
    expect(scopeMatches(
      { kind: "project", id: "project-a" },
      { kind: "home", id: null },
    )).toBe(false);
    expect(scopeMatches(
      { kind: "home", id: "ignored" },
      { kind: "home", id: null },
    )).toBe(true);
    expect(scopeMatches(
      { kind: "project", id: "project-a" },
      { kind: "project", id: "project-a" },
    )).toBe(true);
    expect(scopeMatches(
      { kind: "project", id: "project-a" },
      { kind: "project", id: "project-b" },
    )).toBe(false);
    expect(scopeMatches(
      { kind: "task" },
      { kind: "task", id: null },
    )).toBe(true);
  });
});
