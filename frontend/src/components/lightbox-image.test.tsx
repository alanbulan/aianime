// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LightboxImage } from "./lightbox-image";

describe("LightboxImage", () => {
  it("uses a thumbnail on the card and keeps the original for preview/download", () => {
    render(
      <LightboxImage
        src="/static/projects/project-a/images/original.png"
        previewSrc="/static/projects/project-a/images/original.png?st_thumb=thumb2x"
        alt="角色原画"
      />,
    );

    const cardImage = screen.getByAltText("角色原画");
    expect(cardImage).toHaveAttribute(
      "src",
      "/static/projects/project-a/images/original.png?st_thumb=thumb2x",
    );

    fireEvent.click(cardImage);

    expect(screen.getByRole("link", { name: "Download image" })).toHaveAttribute(
      "href",
      "/static/projects/project-a/images/original.png",
    );
    const previewImages = screen.getAllByAltText("角色原画");
    expect(previewImages[previewImages.length - 1]).toHaveAttribute(
      "src",
      "/static/projects/project-a/images/original.png",
    );
  });
});
