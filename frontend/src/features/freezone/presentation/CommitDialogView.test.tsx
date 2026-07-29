// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  CommitDialogView,
  type CommitDialogViewProps,
} from "./CommitDialogView";

function createTargetState(
  overrides: Partial<CommitDialogViewProps["targetState"]> = {},
): CommitDialogViewProps["targetState"] {
  return {
    kind: "scene_master",
    setKind: vi.fn(),
    episode: 1,
    setEpisode: vi.fn(),
    beat: 1,
    setBeat: vi.fn(),
    character: null,
    setCharacter: vi.fn(),
    identityId: null,
    setIdentityId: vi.fn(),
    sceneId: "电梯间",
    setSceneId: vi.fn(),
    propId: "",
    setPropId: vi.fn(),
    episodes: [{ number: 1, title: "第一集" }],
    scenes: [{ name: "电梯间" }, { name: "办公室" }],
    scenesLoading: false,
    beatOptions: [1],
    beatsLoading: false,
    characters: [],
    displayedIdentityOptions: [],
    identitiesLoading: false,
    impactBeats: [],
    impactLoading: false,
    markStale: true,
    setMarkStale: vi.fn(),
    error: null,
    isBeatStyle: false,
    isIdentityStyle: false,
    needsIdentityId: false,
    isSceneStyle: true,
    isPropStyle: false,
    isGlobalSlot: true,
    noTargetYet: false,
    noModelSourceForSlotCommit: false,
    showTargetKindSelect: true,
    targetKindOptions: [["scene_master", "场景主图"]],
    target: { kind: "scene_master", scene_id: "电梯间" },
    targetLabel: "电梯间 / 场景主图",
    ...overrides,
  };
}

describe("CommitDialogView", () => {
  it("adapts scene selection, submit, and close actions", async () => {
    const user = userEvent.setup();
    const setSceneId = vi.fn();
    const submit = vi.fn(async () => undefined);
    const onClose = vi.fn();

    render(
      <CommitDialogView
        project="demo"
        sourceUrl="/static/source.png"
        mediaType="image"
        targetState={createTargetState({ setSceneId })}
        submission={{ submitting: false, ready: true, submit }}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("提交到主线资产")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "场景" }));
    await user.click(await screen.findByRole("option", { name: "办公室" }));
    await user.click(screen.getByRole("button", { name: "提交" }));
    await user.click(screen.getByRole("button", { name: "关闭" }));

    expect(setSceneId).toHaveBeenCalledWith("办公室");
    expect(submit).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders director world state and adapts stale marking", () => {
    const setMarkStale = vi.fn();

    render(
      <CommitDialogView
        project="demo"
        sourceUrl="/static/world.sog"
        mediaType="model"
        nodeData={{ activeSourceId: "world" }}
        targetState={createTargetState({
          kind: "scene_director_world",
          target: {
            kind: "scene_director_world",
            scene_id: "电梯间",
          },
          targetLabel: "电梯间 / 导演世界",
          showTargetKindSelect: false,
          impactBeats: [{ episode: 1, beat: 3, visual_description: "人物进入电梯" }],
          setMarkStale,
        })}
        submission={{ submitting: false, ready: true, submit: vi.fn() }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("导演世界状态")).toBeInTheDocument();
    expect(screen.getByText("提交当前导演世界 manifest")).toBeInTheDocument();
    expect(screen.getByText("将影响 1 个镜头")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));

    expect(setMarkStale).toHaveBeenCalledWith(false);
  });
});
