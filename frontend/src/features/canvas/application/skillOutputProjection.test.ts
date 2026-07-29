// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { nodeDataForOutput } from "./skillOutputProjection";

describe("skillOutputProjection", () => {
  it("keeps mainline_context on skill output candidates as provenance", () => {
    const mainlineContext = [{ kind: "sketch", episode: 1, beat: 4 }];

    const data = nodeDataForOutput(
      {
        role: "current_sketch_candidate",
        media_type: "image",
        node_type: "imageGenNode",
        pushable: false,
        image_url: "/static/sketch.png",
        mainline_context: mainlineContext,
      },
      "freezone.sketch_from_context",
      "skill_sketch",
    );

    expect(data.mainline_context).toEqual(mainlineContext);
    expect(data.candidate_origin).toEqual({
      skill_id: "freezone.sketch_from_context",
      skill_node_id: "skill_sketch",
    });
  });
});
