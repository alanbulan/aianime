// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { PinnedPanel } from "./PinnedPanel";

function message(id: string, text: string): ChatMessage {
  return { id, role: "assistant", text, timestamp: 1 };
}

describe("AI Assistant pinned messages panel", () => {
  it("hides its empty state and forwards clear and unpin actions", () => {
    const onClear = vi.fn();
    const onTogglePin = vi.fn();
    const { container, rerender } = render(
      <PinnedPanel messages={[]} onClear={onClear} onTogglePin={onTogglePin} />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <PinnedPanel
        messages={[
          message("message-1", "First result"),
          message("message-2", "Second result"),
        ]}
        onClear={onClear}
        onTogglePin={onTogglePin}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "First result" }));
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.clearPinned" }),
    );

    expect(onTogglePin).toHaveBeenCalledWith("message-1");
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
