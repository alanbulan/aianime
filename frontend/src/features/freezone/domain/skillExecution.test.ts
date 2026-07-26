// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  isSkillRunDoneStatus,
  isSkillRunFailureStatus,
  isSkillRunTerminalStatus,
  skillRunErrorMessage,
} from "./skillExecution";

describe("Freezone skill execution", () => {
  it("recognizes successful and failed terminal statuses case-insensitively", () => {
    expect(isSkillRunDoneStatus("SUCCEEDED")).toBe(true);
    expect(isSkillRunFailureStatus("Cancelled")).toBe(true);
    expect(isSkillRunTerminalStatus("running")).toBe(false);
    expect(isSkillRunTerminalStatus("completed")).toBe(true);
  });

  it("adds the user action hint to structured errors", () => {
    expect(skillRunErrorMessage({
      code: "missing_input",
      category: "validation",
      message: "Input is missing.",
      retryable: false,
      user_action_hint: "Connect a source image.",
    })).toBe("Input is missing. Connect a source image.");
    expect(skillRunErrorMessage("plain failure")).toBe("plain failure");
    expect(skillRunErrorMessage(null)).toBeNull();
  });
});
