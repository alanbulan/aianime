// Copyright (c) 2026 AI anime
import { useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useVideoReferenceMentionController } from "@/modules/production/application/use-video-reference-mention-controller";
import type { VideoReferenceAssetItem } from "@/modules/production/domain/video-reference-panel";
import {
  parseBeatVideoConfig,
  type BeatVideoConfigDraft,
} from "@/modules/production/domain/video-config";

function makeDraft(
  overrides: Partial<BeatVideoConfigDraft> = {},
): BeatVideoConfigDraft {
  return {
    ...parseBeatVideoConfig("", "9:16"),
    ...overrides,
  };
}

function makeAsset(
  label: string,
  key: string,
  path: string,
  overrides: Partial<VideoReferenceAssetItem> = {},
): VideoReferenceAssetItem {
  return {
    key,
    label,
    media_type: "image",
    selected: true,
    exists: true,
    reference_label: label,
    note: "",
    path,
    ...overrides,
  };
}

function renderController(
  draft: BeatVideoConfigDraft,
  initialAssets: VideoReferenceAssetItem[],
) {
  return renderHook(
    ({ assets, beatNumber }) => {
      const [currentDraft, setCurrentDraft] = useState(draft);
      const controller = useVideoReferenceMentionController({
        assets,
        beatNumber,
        changeDraft: setCurrentDraft,
        draft: currentDraft,
        enabled: true,
      });
      return { controller, draft: currentDraft };
    },
    {
      initialProps: { assets: initialAssets, beatNumber: 1 },
    },
  );
}

describe("VideoReference mention controller", () => {
  it("filters usable references and builds image previews", () => {
    const assets = [
      makeAsset("图片1", "image:a", "/static/style-examples/a.png"),
      makeAsset("图片2", "image:b", "/static/style-examples/b.png", {
        exists: false,
      }),
      makeAsset("音频1", "audio:a", "/static/demo/audio/a.wav", {
        media_type: "audio",
      }),
    ];
    const { result } = renderController(
      makeDraft({ final_prompt: "镜头参考 @图" }),
      assets,
    );

    expect(
      result.current.controller.referenceOptions.map(
        (asset) => asset.reference_label,
      ),
    ).toEqual(["图片1", "音频1"]);
    expect(
      result.current.controller.mentionOptions.map(
        (asset) => asset.reference_label,
      ),
    ).toEqual(["图片1"]);
    expect(result.current.controller.mentionPreviews).toEqual({
      图片1: "/static/style-examples/a.png",
    });
  });

  it("inserts a dropped reference at the remembered selection", () => {
    const assets = [
      makeAsset("图片1", "image:a", "/static/style-examples/a.png"),
    ];
    const { result } = renderController(
      makeDraft({ final_prompt: "before after" }),
      assets,
    );

    act(() => {
      result.current.controller.rememberSelection("final_prompt", {
        start: 7,
        end: 7,
      });
      result.current.controller.insertDroppedReference(
        "final_prompt",
        "图片1",
      );
    });

    expect(result.current.draft.final_prompt).toBe("before @图片1 after");
  });

  it("moves through candidates and replaces the trailing query", () => {
    const assets = [
      makeAsset("图片1", "image:a", "/static/style-examples/a.png"),
      makeAsset("图片2", "image:b", "/static/style-examples/b.png"),
    ];
    const { result } = renderController(
      makeDraft({ final_prompt: "镜头 @" }),
      assets,
    );

    act(() => result.current.controller.moveActiveIndex(1));
    act(() => result.current.controller.selectActiveMention("final_prompt"));

    expect(result.current.draft.final_prompt).toBe("镜头 @图片2 ");
    expect(result.current.controller.mentionOpen).toBe(false);
  });

  it("remaps prompt references by asset identity after reordering", async () => {
    const first = makeAsset(
      "图片1",
      "image:a",
      "/static/style-examples/a.png",
    );
    const second = makeAsset(
      "图片2",
      "image:b",
      "/static/style-examples/b.png",
    );
    const { result, rerender } = renderController(
      makeDraft({
        final_prompt: "使用 @图片2",
        prompt_guidance: "保持 @图片2 的身份",
      }),
      [first, second],
    );

    rerender({
      assets: [{ ...second, reference_label: "图片1" }],
      beatNumber: 1,
    });

    await waitFor(() => {
      expect(result.current.draft.final_prompt).toBe("使用 @图片1");
      expect(result.current.draft.prompt_guidance).toBe(
        "保持 @图片1 的身份",
      );
    });
  });

  it("appends each guidance template only once", () => {
    const { result } = renderController(makeDraft(), []);

    act(() => {
      result.current.controller.appendGuidanceTemplate("保持主体一致");
      result.current.controller.appendGuidanceTemplate("保持主体一致");
    });

    expect(result.current.draft.prompt_guidance).toBe("保持主体一致");
  });
});
