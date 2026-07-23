// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  mergeEpisodeCatalog,
  resolveSelectedEpisode,
} from "@/modules/narrative_planning/domain/episode";
import type { PipelineEpisodeStatus } from "@/modules/narrative_planning/domain/types";

const pipelineEpisode = (episode: number): PipelineEpisodeStatus => ({
  episode,
  script: false,
  sketch: false,
  audio: false,
  video: false,
  compose: false,
});

describe("narrative planning episode catalog", () => {
  it("keeps episodes that only exist in pipeline status", () => {
    expect(
      mergeEpisodeCatalog(
        [{ number: 2, title: "Existing" }],
        [pipelineEpisode(1), pipelineEpisode(2)],
        (episode) => `Episode ${episode}`,
      ),
    ).toEqual([
      { number: 1, title: "Episode 1" },
      { number: 2, title: "Existing" },
    ]);
  });

  it("returns a stable fallback for a URL-selected episode not in the list", () => {
    expect(
      resolveSelectedEpisode([], 3, (episode) => `Episode ${episode}`),
    ).toEqual({ number: 3, title: "Episode 3" });
    expect(resolveSelectedEpisode([], null, () => "unused")).toBeNull();
  });
});
