// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useBeatSelection } from "@/modules/narrative_planning/infrastructure/use-beat-selection";
import { useBeatsViewToggles } from "@/modules/narrative_planning/infrastructure/use-beats-view-toggles";
import { useEpisodeWorkbenchStore } from "@/shared/stores/episode-workbench-store";

describe("useBeatSelection", () => {
  beforeEach(() => {
    useEpisodeWorkbenchStore.getState().reset();
  });

  it("starts in none mode with no active beat", () => {
    const { result } = renderHook(() => useBeatSelection());
    expect(result.current.state.mode).toBe("none");
    expect(result.current.activeBeat).toBeNull();
  });

  it("selectSingle transitions to single mode and sets active beat", () => {
    const { result } = renderHook(() => useBeatSelection());
    act(() => result.current.selectSingle(3));
    expect(result.current.state).toEqual({ mode: "single", beatNum: 3 });
    expect(result.current.activeBeat).toBe(3);
  });

  it("toggleCheck enters multi mode", () => {
    const { result } = renderHook(() => useBeatSelection());
    act(() => result.current.toggleCheck(5));
    expect(result.current.state.mode).toBe("multi");
    expect(
      (result.current.state as { checked: Set<number> }).checked.has(5),
    ).toBe(true);
  });

  it("toggleCheck in multi mode toggles beat", () => {
    const { result } = renderHook(() => useBeatSelection());
    act(() => result.current.toggleCheck(1));
    act(() => result.current.toggleCheck(2));
    expect(
      (result.current.state as { checked: Set<number> }).checked.size,
    ).toBe(2);
    act(() => result.current.toggleCheck(1));
    expect(
      (result.current.state as { checked: Set<number> }).checked.size,
    ).toBe(1);
  });

  it("unchecking last beat returns to none", () => {
    const { result } = renderHook(() => useBeatSelection());
    act(() => result.current.toggleCheck(1));
    act(() => result.current.toggleCheck(1));
    expect(result.current.state.mode).toBe("none");
  });

  it("clearSelection returns to none and clears activeBeat", () => {
    const { result } = renderHook(() => useBeatSelection());
    act(() => result.current.handleCardClick(5));
    act(() => result.current.toggleCheck(1));
    act(() => result.current.toggleCheck(2));
    act(() => result.current.clearSelection());
    expect(result.current.state.mode).toBe("none");
    expect(result.current.activeBeat).toBeNull();
  });

  it("card body click sets activeBeat and single mode", () => {
    const { result } = renderHook(() => useBeatSelection());
    act(() => result.current.handleCardClick(3));
    expect(result.current.activeBeat).toBe(3);
    expect(result.current.state).toEqual({ mode: "single", beatNum: 3 });
  });

  it("card body click overrides any existing multi selection", () => {
    const { result } = renderHook(() => useBeatSelection());
    act(() => result.current.toggleCheck(1));
    act(() => result.current.toggleCheck(2));
    act(() => result.current.handleCardClick(3));
    expect(result.current.activeBeat).toBe(3);
    expect(result.current.state).toEqual({ mode: "single", beatNum: 3 });
  });

  it("checkbox toggle enters multi mode and clears activeBeat", () => {
    const { result } = renderHook(() => useBeatSelection());
    act(() => result.current.handleCardClick(5));
    expect(result.current.activeBeat).toBe(5);
    act(() => result.current.toggleCheck(1));
    act(() => result.current.toggleCheck(2));
    expect(result.current.activeBeat).toBeNull();
    expect(result.current.state.mode).toBe("multi");
  });

  it("restores scoped selection after the beat route remounts", () => {
    const scope = { project: "demo", episode: 1 };
    const { result, unmount } = renderHook(() => useBeatSelection(scope));

    act(() => result.current.handleCardClick(5));
    act(() => result.current.toggleCheck(1));
    act(() => result.current.toggleCheck(2));

    unmount();

    const restored = renderHook(() => useBeatSelection(scope));
    expect(restored.result.current.activeBeat).toBeNull();
    expect(restored.result.current.state.mode).toBe("multi");
    expect(
      (restored.result.current.state as { checked: Set<number> }).checked,
    ).toEqual(new Set([1, 2]));
  });

  it("keeps scoped selection isolated by episode", () => {
    const episodeOne = { project: "demo", episode: 1 };
    const episodeTwo = { project: "demo", episode: 2 };

    const first = renderHook(() => useBeatSelection(episodeOne));
    act(() => first.result.current.handleCardClick(3));

    const second = renderHook(() => useBeatSelection(episodeTwo));
    expect(second.result.current.activeBeat).toBeNull();
    expect(second.result.current.state.mode).toBe("none");
  });
});

describe("useBeatsViewToggles", () => {
  beforeEach(() => {
    useEpisodeWorkbenchStore.getState().reset();
  });

  it("persists toggles while keeping at least one view visible", () => {
    const { result } = renderHook(() => useBeatsViewToggles("demo", 1));

    act(() => result.current.toggle("sketch"));
    act(() => result.current.toggle("render"));
    expect(result.current.toggles).toEqual(new Set(["text"]));

    act(() => result.current.toggle("text"));
    expect(result.current.toggles).toEqual(new Set(["text"]));
  });
});
