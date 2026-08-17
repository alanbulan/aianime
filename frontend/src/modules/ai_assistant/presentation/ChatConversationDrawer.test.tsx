// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ChatConversationDrawer } from "./ChatConversationDrawer";

describe("ChatConversationDrawer", () => {
  it("stays below the Electron title bar and confirms deletion in the app UI", () => {
    const onDelete = vi.fn();
    render(
      <ChatConversationDrawer
        activeConversationId="main"
        conversations={[
          {
            id: "main",
            title: "模型生成的会话标题",
            updatedAt: "2026-08-14T12:00:00+08:00",
            messageCount: 3,
          },
        ]}
        open
        onCreate={vi.fn()}
        onDelete={onDelete}
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const drawer = document.querySelector('[data-slot="sheet-content"]');
    expect(drawer).toHaveStyle({
      top: "var(--desktop-title-bar-height, 0px)",
      bottom: "auto",
      height: "calc(100dvh - var(--desktop-title-bar-height, 0px))",
    });
    expect(screen.getByText("模型生成的会话标题")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.deleteConversation" }),
    );
    expect(
      screen.getByText("aiAssistant.deleteConversationDescription"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "aiAssistant.deleteConversation",
      }),
    );
    expect(onDelete).toHaveBeenCalledWith("main");
  });
});
