// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ai_assistant/presentation/SpecMediaModals", () => ({
  VideoDetailModal: ({
    open,
    src,
    title,
  }: {
    open: boolean;
    src: string;
    title: string;
  }) =>
    open ? (
      <div data-testid="video-detail" data-src={src}>
        {title}
      </div>
    ) : null,
}));

vi.mock("@/lib/media-url", () => ({
  resolveMediaUrl: (src: string) => `resolved:${src}`,
}));

import type { UiSpec } from "@/modules/ai_assistant/domain/structuredContent";
import { UiSpecRenderer } from "./SpecMediaGallery";

describe("SuperChat spec media gallery", () => {
  it("falls back to structured JSON for non-media specs", () => {
    render(
      <UiSpecRenderer
        spec={{
          type: "form",
          root: "root",
          elements: {
            root: { type: "Card", props: { title: "Fallback form" } },
          },
        }}
      />,
    );

    expect(screen.getByText("form")).toBeInTheDocument();
    expect(screen.getAllByText("Fallback form")).toHaveLength(2);
    expect(document.querySelector(".ai-anime-unified-media-grid")).toBeNull();
  });

  it("renders image and audio items with resolved media URLs", async () => {
    const spec: UiSpec = {
      type: "media_bundle",
      root: "root",
      elements: {
        root: { type: "Grid", children: ["image", "audio"] },
        image: {
          type: "Image",
          props: { src: "/hero.png", title: "Hero" },
        },
        audio: {
          type: "Audio",
          props: { src: "/theme.mp3", title: "Theme" },
        },
      },
    };

    const { container } = render(<UiSpecRenderer spec={spec} />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Hero" })).toHaveAttribute(
        "src",
        "resolved:/hero.png",
      );
      expect(container.querySelector("audio")).toHaveAttribute(
        "src",
        "resolved:/theme.mp3",
      );
    });
  });

  it("opens a resolved image through the parent media-detail callback", async () => {
    const onOpenMedia = vi.fn();
    render(
      <UiSpecRenderer
        spec={{
          type: "media_bundle",
          root: "root",
          elements: {
            root: { type: "Grid", children: ["image"] },
            image: {
              type: "Image",
              props: {
                src: "/hero.png",
                poster: "/hero-poster.png",
                title: "Hero",
                description: "Lead character",
              },
            },
          },
        }}
        onOpenMedia={onOpenMedia}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Hero" })).toHaveAttribute(
        "src",
        "resolved:/hero.png",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Hero" }));

    expect(onOpenMedia).toHaveBeenCalledWith({
      kind: "image",
      src: "resolved:/hero.png",
      poster: "resolved:/hero-poster.png",
      title: "Hero",
      description: "Lead character",
    });
  });

  it("renders pending keyframe status and progress", () => {
    const { container } = render(
      <UiSpecRenderer
        spec={{
          type: "keyframe_video",
          root: "root",
          elements: {
            root: {
              type: "Card",
              props: { title: "Episode 1", description: "Rendering" },
            },
            status: { type: "Badge", props: { label: "Queued" } },
            progress: { type: "Progress", props: { value: 37 } },
          },
        }}
      />,
    );

    expect(screen.getByText("Episode 1")).toBeInTheDocument();
    expect(screen.getByText("Rendering")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(
      container.querySelector(".ai-anime-keyframe-video-progress > span"),
    ).toHaveStyle({ width: "37%" });
  });

  it("opens playable keyframe video details", async () => {
    render(
      <UiSpecRenderer
        spec={{
          type: "keyframe_video",
          root: "root",
          elements: {
            root: { type: "Grid", children: ["video"] },
            video: {
              type: "Video",
              props: {
                src: "/scene.mp4",
                poster: "/scene.jpg",
                title: "Opening scene",
              },
            },
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Opening scene" })).toHaveAttribute(
        "src",
        "resolved:/scene.jpg",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Opening scene" }));

    expect(screen.getByTestId("video-detail")).toHaveAttribute(
      "data-src",
      "resolved:/scene.mp4",
    );
  });
});
