// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: routeState.pathname } }),
}));

vi.mock("sonner", () => ({
  Toaster: ({
    offset,
    toastOptions,
  }: {
    offset: number;
    toastOptions: { style: Record<string, string> };
  }) => (
    <div
      data-testid="toaster"
      data-offset={offset}
      data-width={toastOptions.style["--width"]}
    />
  ),
}));

import { ThemedToaster } from "@/components/themed-toaster";

describe("ThemedToaster", () => {
  beforeEach(() => {
    routeState.pathname = "/";
  });

  it.each([
    ["/", "60"],
    ["/projects/demo/freezone", "60"],
    ["/projects/demo/characters", "102"],
    ["/login", "24"],
  ])("uses the safe top offset for %s", (pathname, expectedOffset) => {
    routeState.pathname = pathname;
    render(<ThemedToaster />);
    expect(screen.getByTestId("toaster")).toHaveAttribute(
      "data-offset",
      expectedOffset,
    );
  });

  it("uses a stable responsive width so top-center toasts are truly centered", () => {
    render(<ThemedToaster />);
    expect(screen.getByTestId("toaster")).toHaveAttribute(
      "data-width",
      "min(420px, calc(100vw - 32px))",
    );
  });
});
