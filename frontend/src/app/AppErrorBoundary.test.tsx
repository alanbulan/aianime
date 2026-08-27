import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { AppErrorBoundary } from "@/app/AppErrorBoundary";

function BrokenContent(): never {
  throw new Error("render failed");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

it("shows a localized recovery screen and reload action for root render errors", () => {
  const onReload = vi.fn();

  render(
    <AppErrorBoundary onReload={onReload}>
      <BrokenContent />
    </AppErrorBoundary>,
  );

  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button"));
  expect(onReload).toHaveBeenCalledTimes(1);
});

it("shows the same recovery screen for bootstrap failures", () => {
  render(
    <AppErrorBoundary initialError={new Error("bootstrap failed")}>
      <div>application</div>
    </AppErrorBoundary>,
  );

  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("application")).not.toBeInTheDocument();
});
