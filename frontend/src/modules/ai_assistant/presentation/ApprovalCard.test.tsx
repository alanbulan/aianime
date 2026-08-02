// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { seconds?: number }) =>
      values?.seconds === undefined ? key : `${key}:${values.seconds}`,
  }),
}));

import { ApprovalCard } from "./ApprovalCard";

describe("SuperChat approval card", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders approval context and a clamped expiry countdown", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(
      <ApprovalCard
        approval={{
          id: "approval-1",
          kind: "exec",
          title: "Run renderer",
          description: "Starts the render command",
          command: "pnpm render",
          cwd: "F:/workspace",
          host: "desktop",
          security: "restricted",
          expiresAtMs: 4_501,
        }}
        onResolve={vi.fn()}
      />,
    );

    expect(screen.getByText("Run renderer")).toBeInTheDocument();
    expect(screen.getByText("exec")).toBeInTheDocument();
    expect(screen.getByText("Starts the render command")).toBeInTheDocument();
    expect(screen.getByText("pnpm render")).toBeInTheDocument();
    expect(screen.getByText("CWD: F:/workspace")).toBeInTheDocument();
    expect(screen.getByText("Host: desktop")).toBeInTheDocument();
    expect(screen.getByText("Security: restricted")).toBeInTheDocument();
    expect(screen.getByText("aiAssistant.approvalExpires:4")).toBeInTheDocument();
  });

  it("forwards all three approval decisions", () => {
    const onResolve = vi.fn();
    render(
      <ApprovalCard
        approval={{ id: "approval-1", kind: "plugin", title: "Install plugin" }}
        onResolve={onResolve}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "aiAssistant.allowOnce" }));
    fireEvent.click(screen.getByRole("button", { name: "aiAssistant.allowAlways" }));
    fireEvent.click(screen.getByRole("button", { name: "aiAssistant.deny" }));

    expect(onResolve.mock.calls).toEqual([
      ["allow-once"],
      ["allow-always"],
      ["deny"],
    ]);
  });

  it("omits absent optional approval metadata", () => {
    render(
      <ApprovalCard
        approval={{ id: "approval-1", kind: "plugin", title: "Plugin access" }}
        onResolve={vi.fn()}
      />,
    );

    expect(screen.queryByText(/^CWD:/)).toBeNull();
    expect(screen.queryByText(/^Host:/)).toBeNull();
    expect(screen.queryByText(/^Security:/)).toBeNull();
    expect(screen.queryByText(/^aiAssistant\.approvalExpires:/)).toBeNull();
  });
});
