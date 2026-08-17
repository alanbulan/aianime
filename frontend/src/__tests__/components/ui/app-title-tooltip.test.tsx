// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppTitleTooltip } from "@/components/ui/app-title-tooltip";

describe("AppTitleTooltip", () => {
  it("renders the application tooltip and accessible name", async () => {
    render(
      <>
        <button type="button" data-ui-tooltip="查看详情">
          <svg aria-hidden="true" />
        </button>
        <AppTitleTooltip />
      </>,
    );

    const button = screen.getByRole("button", { name: "查看详情" });
    await waitFor(() => {
      expect(button).toHaveAttribute("data-ui-tooltip", "查看详情");
      expect(button).toHaveAttribute("aria-label", "查看详情");
    });

    fireEvent.pointerOver(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("查看详情");

    fireEvent.pointerOut(button);
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  it("supports tooltip elements added and updated after initial render", async () => {
    render(<AppTitleTooltip />);
    const button = document.createElement("button");
    button.setAttribute("data-ui-tooltip", "动态提示");
    document.body.append(button);

    await waitFor(() => {
      expect(button).toHaveAttribute("data-ui-tooltip", "动态提示");
      expect(button).toHaveAttribute("aria-label", "动态提示");
    });

    button.setAttribute("data-ui-tooltip", "已更新提示");
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-label", "已更新提示");
    });

    button.removeAttribute("data-ui-tooltip");
    await waitFor(() => {
      expect(button).not.toHaveAttribute("aria-label");
    });

    button.remove();
  });
});
