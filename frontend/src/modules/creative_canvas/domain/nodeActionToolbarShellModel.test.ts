// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { projectNodeActionToolbarShell } from "./nodeActionToolbarShellModel";

describe("nodeActionToolbarShellModel", () => {
  it("projects ordinary group and preset-lock branches", () => {
    expect(
      projectNodeActionToolbarShell(
        {
          isGroup: true,
          isProtectedProjectionGroup: false,
          isStoryboardGroup: false,
          isImageEdit: false,
          videoData: null,
          audioData: null,
          groupBackgroundColor: "#123456",
          isPresetLocked: true,
        },
      ),
    ).toEqual({
      isStoryboardGroup: false,
      isImageEdit: false,
      videoData: null,
      audioData: null,
      isUngroupableGroup: true,
      groupBackgroundColor: "#123456",
      isPresetLocked: true,
    });
  });

  it("projects protected storyboard and media branches", () => {
    expect(
      projectNodeActionToolbarShell(
        {
          isGroup: true,
          isProtectedProjectionGroup: true,
          isStoryboardGroup: true,
          isImageEdit: false,
          videoData: null,
          audioData: null,
          isPresetLocked: true,
        },
      ),
    ).toMatchObject({
      isStoryboardGroup: true,
      isUngroupableGroup: false,
      groupBackgroundColor: null,
    });
    expect(
      projectNodeActionToolbarShell(
        {
          isGroup: false,
          isProtectedProjectionGroup: false,
          isStoryboardGroup: false,
          isImageEdit: true,
          videoData: null,
          audioData: null,
          isPresetLocked: false,
        },
      ),
    ).toMatchObject({ isImageEdit: true, videoData: null, audioData: null });
    expect(
      projectNodeActionToolbarShell(
        {
          isGroup: false,
          isProtectedProjectionGroup: false,
          isStoryboardGroup: false,
          isImageEdit: false,
          videoData: { videoUrl: "/clip.mp4" },
          audioData: null,
          isPresetLocked: false,
        },
      ),
    ).toMatchObject({
      isImageEdit: false,
      videoData: { videoUrl: "/clip.mp4" },
      audioData: null,
    });
    expect(
      projectNodeActionToolbarShell(
        {
          isGroup: false,
          isProtectedProjectionGroup: false,
          isStoryboardGroup: false,
          isImageEdit: false,
          videoData: null,
          audioData: { audioUrl: "/voice.mp3" },
          isPresetLocked: false,
        },
      ),
    ).toMatchObject({
      isImageEdit: false,
      videoData: null,
      audioData: { audioUrl: "/voice.mp3" },
    });
  });
});
