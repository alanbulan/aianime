// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUseVideoReferenceAssetOperationsController } from "@/modules/production/application/use-video-reference-asset-operations-controller";
import type { VideoReferenceAssetItem } from "@/modules/production/domain/video-reference-panel";

const upload = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const crop = vi.hoisted(() => vi.fn());
const trim = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const useController = createUseVideoReferenceAssetOperationsController({
  useUploadVideoReferenceAsset: () => ({
    isPending: false,
    mutateAsync: async (command) => upload(command),
  }),
  useDeleteVideoReferenceAsset: () => ({
    isPending: false,
    mutateAsync: async (command) => remove(command),
  }),
  useCropVideoReferenceAsset: () => ({
    isPending: false,
    mutateAsync: async (command) => crop(command),
  }),
  useTrimVideoReferenceAsset: () => ({
    isPending: false,
    mutateAsync: async (command) => trim(command),
  }),
});

const imageAsset: VideoReferenceAssetItem = {
  key: "first_frame",
  label: "首帧",
  media_type: "image",
  selected: true,
  exists: true,
  reference_label: "图片1",
  note: "",
  path: "derived.png",
  abs_path: "C:/derived.png",
  crop_source_path: "source.png",
  crop_source_abs_path: "C:/source.png",
};

const audioAsset: VideoReferenceAssetItem = {
  ...imageAsset,
  key: "voice:narrator",
  media_type: "audio",
  path: "voice.mp3",
  abs_path: "C:/voice.mp3",
};

describe("Production VideoReference asset operations controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const command of [upload, remove, crop, trim]) {
      command.mockResolvedValue({ ok: true, data: {} });
    }
  });

  it("uploads and deletes assets with the current beat scope", async () => {
    const { result } = renderHook(() =>
      useController({ beatNumber: 3, episode: 2, project: "demo" }),
    );
    const file = new File(["image"], "reference.png", { type: "image/png" });

    await act(() => result.current.uploadAsset(file));
    await act(() => result.current.deleteAsset(audioAsset));

    expect(upload).toHaveBeenCalledWith({ beatNum: 3, file });
    expect(remove).toHaveBeenCalledWith({
      beatNum: 3,
      mediaKind: "audios",
      path: "C:/voice.mp3",
    });
  });

  it("uses the original crop source and closes after saving", async () => {
    const { result } = renderHook(() =>
      useController({ beatNumber: 3, episode: 2, project: "demo" }),
    );
    act(() =>
      result.current.openCrop({ asset: imageAsset, target: "first_frame" }),
    );

    await act(() =>
      result.current.saveCrop(imageAsset, "first_frame", {
        x: 10,
        y: 20,
        width: 300,
        height: 500,
      }),
    );

    expect(crop).toHaveBeenCalledWith({
      beatNum: 3,
      assetKey: "first_frame",
      sourcePath: "C:/source.png",
      target: "first_frame",
      crop: { x: 10, y: 20, width: 300, height: 500 },
    });
    expect(result.current.cropIntent).toBeNull();
  });

  it("validates trim input and closes after a successful trim", async () => {
    const { result } = renderHook(() =>
      useController({ beatNumber: 3, episode: 2, project: "demo" }),
    );
    act(() => result.current.openTrim(audioAsset));
    act(() => result.current.setTrimDuration("0"));
    await act(() => result.current.saveTrim());
    expect(trim).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "episode.workbench.video.videoReferenceAssetAudioTrimInvalid",
    );

    act(() => {
      result.current.setTrimStart("1.5");
      result.current.setTrimDuration("4");
    });
    await act(() => result.current.saveTrim());

    expect(trim).toHaveBeenCalledWith({
      beatNum: 3,
      assetKey: "voice:narrator",
      sourcePath: "C:/voice.mp3",
      startSeconds: 1.5,
      durationSeconds: 4,
    });
    expect(result.current.trimAsset).toBeNull();
  });

  it("keeps dialogs open when the backend returns an error", async () => {
    crop.mockResolvedValueOnce({ ok: false, error: "crop failed" });
    const { result } = renderHook(() =>
      useController({ beatNumber: 3, episode: 2, project: "demo" }),
    );
    act(() =>
      result.current.openCrop({ asset: imageAsset, target: "first_frame" }),
    );

    await act(() =>
      result.current.saveCrop(imageAsset, "first_frame", {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }),
    );

    expect(result.current.cropIntent).not.toBeNull();
    expect(toastError).toHaveBeenCalledWith("crop failed");
  });
});
