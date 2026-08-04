// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CharacterLibraryChip } from "./CharacterLibraryChip";

describe("CharacterLibraryChip", () => {
  it("opens the asset library without bubbling to the canvas node", () => {
    const onOpen = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <CharacterLibraryChip onOpen={onOpen} />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "资产库" }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
