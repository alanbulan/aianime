// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { SearchBar } from "./SearchBar";

describe("AI Assistant search bar", () => {
  it("focuses the input and forwards text and Escape changes", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<SearchBar query="" onChange={onChange} onClose={onClose} />);

    const input = screen.getByPlaceholderText("aiAssistant.search");
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "opening shot" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onChange).toHaveBeenCalledWith("opening shot");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clears a populated query and closes from its icon actions", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <SearchBar query="shot" onChange={onChange} onClose={onClose} />,
    );
    const buttons = container.querySelectorAll("button");

    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(onChange).toHaveBeenCalledWith("");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
