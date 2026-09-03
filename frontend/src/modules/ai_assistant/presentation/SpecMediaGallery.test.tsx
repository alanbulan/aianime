// Copyright (c) 2026 AI anime
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTaskCenterStore } from "@/modules/task_execution/public";
import { sampleTask } from "@/__mocks__/msw/handlers/tasks";

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
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useTaskCenterStore.getState().reset();
  });
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

  it("labels historical progress as a snapshot without starting a live progress bar", () => {
    render(
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
    expect(screen.getByText("taskProgress.snapshot")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("follows the linked task clock and reaches 100 only after task completion", () => {
    vi.useFakeTimers();
    const now = new Date("2026-09-03T12:00:00Z");
    vi.setSystemTime(now);
    const task = sampleTask({ progress: 0.37, created_at: now.toISOString(), updated_at: now.toISOString() });
    useTaskCenterStore.getState().hydrate([task]);
    useTaskCenterStore.getState().setHealth("connected");
    render(<UiSpecRenderer spec={{
      type: "keyframe_video",
      root: "root",
      metadata: { task_key: task.task_key, task_id: task.task_id },
      elements: {
        root: { type: "Card", props: { title: "Episode 1" } },
        progress: { type: "Progress", props: { value: 37 } },
      },
    }} />);
    const bar = screen.getByRole("progressbar");
    expect(Number(bar.getAttribute("aria-valuenow"))).toBe(37);
    act(() => vi.advanceTimersByTime(1000));
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeGreaterThan(37);
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeLessThan(100);
    act(() => useTaskCenterStore.getState().upsert({ ...task, status: "completed", progress: 1, updated_at: new Date().toISOString() }));
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).not.toHaveAttribute("data-active");
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
