// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

describe("Select", () => {
  it("在菜单关闭时显示选中项标签而不是内部值", () => {
    render(
      <Select value="1">
        <SelectTrigger aria-label="性别">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">未设置</SelectItem>
          <SelectItem value="1">男</SelectItem>
          <SelectItem value="2">女</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByRole("combobox", { name: "性别" })).toHaveTextContent(
      "男",
    );
    expect(screen.getByRole("combobox", { name: "性别" })).not.toHaveTextContent(
      "1",
    );
  });
});
