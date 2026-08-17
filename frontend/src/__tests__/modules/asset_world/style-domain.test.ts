import { describe, expect, it } from "vitest";

import {
  buildStyleSavePayload,
  extractEditableStyleConfig,
  isPresetStyle,
  isSupportedStylePreviewMimeType,
  type Style,
} from "@/modules/asset_world/domain/style";

describe("Asset & World style domain", () => {
  it("reads top-level fields before nested legacy config", () => {
    const style: Style = {
      id: "ink",
      name: "Ink",
      label: "Top label",
      config: {
        label: "Nested label",
        style_instructions: "nested instructions",
      },
    };

    expect(extractEditableStyleConfig(style)).toEqual({
      label: "Top label",
      style_instructions: "nested instructions",
      avoid_instructions: "",
      style_tag: "",
    });
  });

  it("preserves writable config without copying server metadata", () => {
    const style: Style = {
      id: "custom",
      name: "Custom",
      type: "custom",
      config: {
        base: "ink",
        created_by: "alice",
        label: "Old label",
      },
    };

    expect(
      buildStyleSavePayload(
        {
          label: "New label",
          style_instructions: "cinematic",
          avoid_instructions: "",
          style_tag: "",
        },
        style,
      ),
    ).toEqual({
      base: "ink",
      label: "New label",
      style_instructions: "cinematic",
    });
  });

  it("classifies preset and supported preview media", () => {
    expect(isPresetStyle({ id: "ink", name: "Ink", is_preset: true })).toBe(
      true,
    );
    expect(isSupportedStylePreviewMimeType("IMAGE/PNG")).toBe(true);
    expect(isSupportedStylePreviewMimeType("image/avif")).toBe(false);
  });
});
