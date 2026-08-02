// Copyright (c) 2026 AI anime
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Beat } from "@/modules/narrative_planning/public";
import { createUseBeatStates } from "@/modules/production/application/use-beat-states";
import type { TaskState } from "@/modules/task_execution/public";

function createHook(spineTemplate: "drama" | "narrated") {
  return createUseBeatStates({
    useEpisodeBeats: () => ({
      data: {
        ok: true,
        data: [
          {
            beat_number: 1,
            visual_description: "镜头一",
            audio_url: null,
            video_url: "/1.mp4",
          } as Beat,
        ],
      },
      isLoading: false,
    }),
    useProject: () => ({ data: { spine_template: spineTemplate } }),
    useTasks: () => ({
      data: { data: [] as TaskState[] },
      isLoading: false,
    }),
  });
}

describe("Production Beat state query", () => {
  it("projects query data into narrated compose blockers", () => {
    const useBeatStates = createHook("narrated");
    const { result } = renderHook(() => useBeatStates("demo", 1));

    expect(result.current.loading).toBe(false);
    expect(result.current.states[1].script).toBe("ready");
    expect(result.current.counts.compose).toEqual({
      ready: false,
      missing: [{ beatNum: 1, stages: ["audio"] }],
    });
  });

  it("projects drama video narration without a separate audio blocker", () => {
    const useBeatStates = createHook("drama");
    const { result } = renderHook(() => useBeatStates("demo", 1));

    expect(result.current.counts.compose).toEqual({
      ready: true,
      missing: [],
    });
  });
});
