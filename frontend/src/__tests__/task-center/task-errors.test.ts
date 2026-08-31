// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";

import { taskErrorMessage } from "@/modules/task_execution/public";
import type { TaskState } from "@/modules/task_execution/public";

function task(partial: Partial<TaskState>): TaskState {
  return {
    task_id: "task_1",
    task_type: "build_characters",
    project_id: "project_1",
    episode: 0,
    status: "failed",
    created_at: "",
    updated_at: "",
    ...partial,
  } as TaskState;
}

describe("taskErrorMessage", () => {
  it("uses only the nested provider message in failure notifications", () => {
    const t = vi.fn((key: string) => key) as unknown as TFunction;
    const raw =
      'AI anime API image generation failed: HTTP 400: request_id=req-123; ' +
      'body={"error":{"message":"Content failed safety review. / 内容未通过安全审核。",' +
      '"type":"content_policy_violation","code":"moderation_blocked"}}';

    expect(taskErrorMessage(task({ error: raw }), t)).toBe(
      "Content failed safety review. / 内容未通过安全审核。",
    );
  });
});
