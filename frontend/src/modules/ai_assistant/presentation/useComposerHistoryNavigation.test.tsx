// Copyright (c) 2026 AI anime
import { act, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useComposerHistoryNavigation } from "@/modules/ai_assistant/public";

function useHistoryHarness({
  history,
  project,
}: {
  history: string[];
  project: string;
}) {
  const [draft, setDraft] = useState("");
  const controller = useComposerHistoryNavigation({
    draft,
    history,
    onDraftChange: setDraft,
    project,
  });
  return { draft, ...controller };
}

let latestController: ReturnType<typeof useComposerHistoryNavigation> | null = null;

function FocusHarness() {
  const [draft, setDraft] = useState("");
  const controller = useComposerHistoryNavigation({
    draft,
    history: ["历史输入"],
    onDraftChange: setDraft,
    project: "project-a",
  });
  latestController = controller;
  return <textarea ref={controller.draftInputRef} value={draft} readOnly />;
}

describe("SuperChat Composer history navigation", () => {
  afterEach(() => {
    latestController = null;
    vi.restoreAllMocks();
  });

  it("moves from newest to oldest and clears after moving past the newest item", () => {
    const { result } = renderHook(() => useHistoryHarness({
      history: ["第一条", "第二条", "第三条"],
      project: "project-a",
    }));

    act(() => result.current.selectHistoryMessage("older"));
    expect(result.current.draft).toBe("第三条");
    expect(result.current.selectedHistoryMessageIndex).toBe(2);

    act(() => result.current.selectHistoryMessage("older"));
    expect(result.current.draft).toBe("第二条");
    expect(result.current.selectedHistoryMessageIndex).toBe(1);

    act(() => result.current.selectHistoryMessage("newer"));
    act(() => result.current.selectHistoryMessage("newer"));
    expect(result.current.draft).toBe("");
    expect(result.current.selectedHistoryMessageIndex).toBeNull();
  });

  it("resets only the selection on explicit edits and project changes", () => {
    const { result, rerender } = renderHook(
      ({ project }) => useHistoryHarness({
        history: ["第一条", "第二条"],
        project,
      }),
      { initialProps: { project: "project-a" } },
    );
    act(() => result.current.selectHistoryMessage("older"));
    expect(result.current.draft).toBe("第二条");

    act(() => result.current.resetHistorySelection());
    expect(result.current.selectedHistoryMessageIndex).toBeNull();
    expect(result.current.draft).toBe("第二条");

    act(() => result.current.selectHistoryMessage("older"));
    rerender({ project: "project-b" });
    expect(result.current.selectedHistoryMessageIndex).toBeNull();
    expect(result.current.draft).toBe("第二条");
  });

  it("restores textarea focus and moves the caret after history navigation", () => {
    const focus = vi
      .spyOn(HTMLTextAreaElement.prototype, "focus")
      .mockImplementation(() => undefined);
    const setSelectionRange = vi
      .spyOn(HTMLTextAreaElement.prototype, "setSelectionRange")
      .mockImplementation(() => undefined);
    render(<FocusHarness />);

    act(() => latestController?.selectHistoryMessage("older"));

    expect(screen.getByRole("textbox")).toHaveValue("历史输入");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(setSelectionRange).toHaveBeenCalledWith(4, 4);
  });
});
