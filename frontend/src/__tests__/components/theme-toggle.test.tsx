import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/theme-toggle";
import { useAppStore } from "@/stores/app-store";

describe("ThemeToggle", () => {
  beforeEach(() => {
    useAppStore.setState({ theme: "system" });
  });

  it("cycles system, light, and dark without opening a menu", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(useAppStore.getState().theme).toBe("light");

    fireEvent.click(button);
    expect(useAppStore.getState().theme).toBe("dark");

    fireEvent.click(button);
    expect(useAppStore.getState().theme).toBe("system");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
