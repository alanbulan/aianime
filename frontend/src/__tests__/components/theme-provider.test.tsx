// Copyright (c) 2026 AI anime
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/components/theme-provider";
import { useAppStore } from "@/stores/app-store";

describe("ThemeProvider", () => {
  let systemTheme: ReturnType<typeof installMatchMedia>;

  beforeEach(() => {
    document.documentElement.classList.remove("light", "dark");
    systemTheme = installMatchMedia(false);
    useAppStore.setState({ theme: "light" });
  });

  afterEach(() => {
    document.documentElement.classList.remove("light", "dark");
    Reflect.deleteProperty(window, "matchMedia");
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

  it("tracks system color-scheme changes in system mode", async () => {
    systemTheme.setMatches(true);
    useAppStore.setState({ theme: "system" });

    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>,
    );

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));

    act(() => systemTheme.setMatches(false));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("light");
      expect(document.documentElement).not.toHaveClass("dark");
    });
  });
});

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const media = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  } as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => media),
  });

  return {
    setMatches(next: boolean) {
      matches = next;
      const event = { matches: next, media: media.media } as MediaQueryListEvent;
      for (const listener of listeners) {
        if (typeof listener === "function") listener.call(media, event);
        else listener.handleEvent(event);
      }
    },
  };
}
