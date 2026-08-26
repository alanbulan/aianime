// Copyright (c) 2026 AI anime
import i18next from "i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { CanvasBookmarkContextMenu } from "./CanvasBookmarkContextMenu";

beforeAll(() => {
  i18next.addResourceBundle(
    "zh",
    "translation",
    {
      canvas: {
        bookmarks: {
          setCurrent: "设置当前定位（覆盖）",
          setNew: "设置当前定位",
          deleteCurrent: "删除当前定位",
          clearAll: "清除所有定位",
        },
      },
    },
    true,
    true,
  );
});

describe("CanvasBookmarkContextMenu", () => {
  const baseProps = {
    index: 0,
    filled: true,
    position: { x: 10, y: 10 },
    onSetCurrent: vi.fn(),
    onDelete: vi.fn(),
    onClearAll: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders the available actions", async () => {
    const screen = await render(<CanvasBookmarkContextMenu {...baseProps} />);
    await expect.element(screen.getByText("设置当前定位（覆盖）")).toBeVisible();
    await expect.element(screen.getByText("删除当前定位")).toBeVisible();
    await expect.element(screen.getByText("清除所有定位")).toBeVisible();
  });

  it("runs the selected action and closes", async () => {
    const onSetCurrent = vi.fn();
    const onClose = vi.fn();
    const screen = await render(
      <CanvasBookmarkContextMenu
        {...baseProps}
        onSetCurrent={onSetCurrent}
        onClose={onClose}
      />,
    );

    await screen.getByText("设置当前定位（覆盖）").click();
    expect(onSetCurrent).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hides delete and the overwrite label for an empty slot", async () => {
    const screen = await render(
      <CanvasBookmarkContextMenu {...baseProps} filled={false} />,
    );

    await expect.element(screen.getByText("删除当前定位")).not.toBeInTheDocument();
    await expect.element(screen.getByText("设置当前定位")).toBeVisible();
    await expect
      .element(screen.getByText("设置当前定位（覆盖）"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("清除所有定位")).toBeVisible();
  });
});
