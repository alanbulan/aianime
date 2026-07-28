// Copyright (c) 2026 AI anime
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  PropsWithChildren,
} from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    onOpenChange,
    open,
  }: PropsWithChildren<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }>) =>
    open ? (
      <div data-testid="dialog">
        <button
          type="button"
          aria-label="dialog-dismiss"
          onClick={() => onOpenChange(false)}
        />
        {children}
      </div>
    ) : null,
  DialogClose: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  DialogContent: ({
    children,
    showCloseButton: _showCloseButton,
    ...props
  }: PropsWithChildren<
    HTMLAttributes<HTMLDivElement> & { showCloseButton?: boolean }
  >) => <div {...props}>{children}</div>,
  DialogTitle: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
}));

import {
  SpecMediaDetailModal,
  VideoDetailModal,
} from "@/features/superchat/spec-media-modals";

describe("SuperChat spec media modals", () => {
  const anchorClick = vi.fn();

  beforeEach(() => {
    anchorClick.mockReset();
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: true,
      value: anchorClick,
    });
  });

  it("renders a playable video preview and forwards root close changes", () => {
    const setOpen = vi.fn();
    render(
      <VideoDetailModal
        src="/video.mp4"
        poster="/poster.jpg"
        title="Trailer"
        description="Episode preview"
        open
        setOpen={setOpen}
      />,
    );

    const video = document.querySelector("video");
    expect(video).toHaveAttribute("src", "/video.mp4");
    expect(video).toHaveAttribute("poster", "/poster.jpg");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("autoplay");
    expect(screen.getAllByText("Trailer")).toHaveLength(2);
    expect(screen.getByText("Episode preview")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "dialog-dismiss" }));
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("renders image metadata, downloads the source, and opens a candidate", () => {
    const onClose = vi.fn();
    const onOpenMedia = vi.fn();
    render(
      <SpecMediaDetailModal
        detail={{
          kind: "image",
          src: "/hero.png",
          title: "Hero",
          description: "Main character",
          tags: [{ label: "draft", color: "rgb(255, 0, 0)" }],
          candidates: [
            { id: "variant-1", src: "/variant.png", label: "Variant" },
          ],
        }}
        onClose={onClose}
        onOpenMedia={onOpenMedia}
      />,
    );

    expect(screen.getByRole("img", { name: "Hero" })).toHaveAttribute(
      "src",
      "/hero.png",
    );
    expect(screen.getByText("aiAssistant.mediaDescription")).toBeInTheDocument();
    expect(screen.getByText("Main character")).toBeInTheDocument();
    expect(screen.getByText("draft")).toHaveStyle({
      borderColor: "rgb(255, 0, 0)",
      color: "rgb(255, 0, 0)",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.download" }),
    );
    expect(anchorClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Variant" }));
    expect(onOpenMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "image",
        src: "/variant.png",
        title: "Variant",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "dialog-dismiss" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders explicit sections and video poster metadata", () => {
    render(
      <SpecMediaDetailModal
        detail={{
          kind: "video",
          src: "/scene.mp4",
          poster: "/scene.jpg",
          title: "Scene",
          sections: [
            { title: "Shots", items: ["Wide", "Close-up"] },
            { title: "Notes", body: "Keep pacing steady" },
          ],
        }}
        onClose={vi.fn()}
        onOpenMedia={vi.fn()}
      />,
    );

    const video = document.querySelector("video");
    expect(video).toHaveAttribute("src", "/scene.mp4");
    expect(video).toHaveAttribute("poster", "/scene.jpg");
    expect(screen.getByText("Shots")).toBeInTheDocument();
    expect(screen.getByText("Wide")).toBeInTheDocument();
    expect(screen.getByText("Close-up")).toBeInTheDocument();
    expect(screen.getByText("Keep pacing steady")).toBeInTheDocument();
  });
});
