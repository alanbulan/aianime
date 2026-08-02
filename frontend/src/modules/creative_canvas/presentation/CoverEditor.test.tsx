// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ComposeTimelineState } from "../domain/videoComposeTimeline";

import { CoverEditor } from "./CoverEditor";

const mocks = vi.hoisted(() => ({
  uploadAsset: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../assetTransferComposition", () => ({
  uploadFreezoneAsset: mocks.uploadAsset,
}));

const timeline: ComposeTimelineState = {
  tracks: [],
  resolution: "1080p",
};
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  "createObjectURL",
);
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  "revokeObjectURL",
);

describe("CoverEditor", () => {
  beforeEach(() => {
    mocks.uploadAsset.mockReset().mockResolvedValue({ url: "/cover.jpg" });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:cover-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("uploads the selected cover through platform object storage", async () => {
    const onApply = vi.fn();
    const { container } = render(
      <CoverEditor
        project="project-a"
        timeline={timeline}
        durationMs={0}
        defaultFrameMs={0}
        cover={null}
        resolveMediaUrl={(url) => `display:${url}`}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    );
    const file = new File(["cover"], "cover.png", { type: "image/png" });
    const input = container.ownerDocument.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "common.confirm" }));

    await waitFor(() => expect(mocks.uploadAsset).toHaveBeenCalledOnce());
    expect(mocks.uploadAsset).toHaveBeenCalledWith(
      "project-a",
      file,
      expect.stringMatching(/^cover_\d+\.jpg$/),
    );
    expect(onApply).toHaveBeenCalledWith({
      source: "upload",
      frameMs: null,
      url: "/cover.jpg",
    });
  });
});
