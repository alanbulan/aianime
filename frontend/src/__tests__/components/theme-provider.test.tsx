// Copyright (c) 2026 AI anime
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@/components/theme-provider";
import { useAppStore } from "@/stores/app-store";

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("light", "dark");
    useAppStore.setState({ theme: "light" });
  });

  afterEach(() => {
    document.documentElement.classList.remove("light", "dark");
  });

  it("keeps the document theme in sync with the persisted app preference", async () => {
    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("light");
    });

    act(() => useAppStore.getState().setTheme("dark"));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
      expect(document.documentElement).not.toHaveClass("light");
    });
  });
});
