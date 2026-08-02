// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  stringifyParamValue,
  type GenerationCapability,
} from "./contracts";
import {
  composeCapability,
  defaultCapabilityParams,
  getCapability,
  listCapabilities,
} from "./registry";

describe("generation capability registry", () => {
  it("registers each production capability under one unique id", () => {
    const ids = listCapabilities().map((capability) => capability.id);

    expect(ids).toEqual([
      "real_scene_sketch_repair",
      "portrait_from_ref",
      "character_multi_view_candidate",
      "scene_master_candidate",
      "scene_360_candidate",
      "prop_ref_candidate",
      "render_repair_candidate",
      "video_start_frame_candidate",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getCapability("missing")).toBeNull();
  });

  it("builds defaults according to parameter contracts", () => {
    const capability: GenerationCapability = {
      id: "test",
      name: "Test",
      shortName: "Test",
      category: "utility",
      description: "Test",
      outputKind: "image",
      aspectRatio: "1:1",
      imageSize: "1K",
      inputs: [],
      params: [
        { key: "explicit", label: "Explicit", type: "text", defaultValue: "value" },
        { key: "multiple", label: "Multiple", type: "multiselect" },
        { key: "choice", label: "Choice", type: "enum", options: [{ value: "a", label: "A" }] },
        { key: "enabled", label: "Enabled", type: "boolean" },
        { key: "text", label: "Text", type: "text" },
      ],
      compose: () => ({
        prompt: "",
        referenceUrls: [],
        aspectRatio: "1:1",
        imageSize: "1K",
      }),
    };

    expect(defaultCapabilityParams(capability)).toEqual({
      explicit: "value",
      multiple: [],
      choice: "a",
      enabled: false,
      text: "",
    });
  });

  it("composes registered jobs and preserves their input references", () => {
    const job = composeCapability("portrait_from_ref", {
      inputUrls: ["portrait.png"],
      params: { character: "Mira" },
    });

    expect(job).toMatchObject({
      referenceUrls: ["portrait.png"],
      aspectRatio: "3:4",
      imageSize: "2K",
      outputKind: "identity",
    });
    expect(job?.prompt).toContain("Mira");
    expect(composeCapability("missing", { inputUrls: [], params: {} })).toBeNull();
  });

  it("normalizes capability parameter values for prompt composition", () => {
    expect(stringifyParamValue(["one", "", "two"])).toBe("one / two");
    expect(stringifyParamValue("  text  ")).toBe("text");
    expect(stringifyParamValue(12)).toBe("12");
    expect(stringifyParamValue(false)).toBe("false");
    expect(stringifyParamValue({ value: "ignored" })).toBe("");
  });
});
