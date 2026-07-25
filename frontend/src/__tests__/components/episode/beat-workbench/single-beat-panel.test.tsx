// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { SingleBeatPanel, type SectionId } from "@/components/episode/beat-workbench/single-beat-panel";
import type { Beat } from "@/modules/narrative_planning/public";

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "zh",
    fallbackLng: "zh",
    interpolation: { escapeValue: false },
    resources: {
      zh: {
        translation: {
          common: {
            close: "关闭",
          },
          episode: {
            beat: {
              sectionText: "文案",
              sectionSketch: "草图",
              sectionRender: "渲染图",
              sectionAudio: "音频",
              sectionVideo: "视频",
              edited: "已编辑",
              notEdited: "未编辑",
              selected: "已选择",
              notSelected: "未选择",
              rendered: "已渲染",
              notRendered: "未渲染",
              generated: "已生成",
              notGenerated: "未生成",
              deleteManualShotTitle: "删除手工镜头？",
              deleteManualShotDesc: "删除 Beat #{{n}}？",
            },
            workbench: {
              batch: { videoModel: "视频模型" },
              video: {
                noteDefault: "默认",
                noteDialogue: "对白镜头",
              },
            },
          },
        },
      },
    },
  });
});

vi.mock("@/modules/narrative_planning/public", async () => {
  const { createUseSingleBeatPanelController } = await import(
    "@/modules/narrative_planning/application/use-single-beat-panel-controller"
  );
  const { SingleBeatPanelView } = await import(
    "@/modules/narrative_planning/presentation/SingleBeatPanelView"
  );
  const useSingleBeatPanelController = createUseSingleBeatPanelController(
    {
      useGridsByBeat: () => ({ byBeat: new Map(), assignments: {} }),
      useVideoBackends: () => ({
        data: {
          data: [
            {
              value: "standard",
              label: "Standard",
              is_default: true,
              is_seedance2: false,
              dialogue_only: false,
            },
            {
              value: "huimeng_seedance-2.0-fast",
              label: "Seedance 2.0 Fast",
              is_default: false,
              is_seedance2: true,
              dialogue_only: false,
            },
          ],
        },
      }),
    },
    {
      beatTextScope: () => "beat-text",
      useAssetWorkspaceNavigation: () => vi.fn(),
      useSaveState: () => ({ status: "idle" }),
    },
  );
  return { SingleBeatPanelView, useSingleBeatPanelController };
});

vi.mock("@/modules/production/public", () => ({
  AudioPaneContent: () => <div>AudioPane</div>,
}));

vi.mock("@/hooks/use-escape-to-close", () => ({
  useEscapeToClose: vi.fn(),
}));

vi.mock("@/components/save-status", () => ({
  SaveStatus: () => null,
}));

vi.mock("@/components/episode/beat-workbench/text-pane", () => ({
  TextPane: () => <div>TextPane</div>,
}));

vi.mock("@/components/episode/beat-workbench/sketch-section", () => ({
  SketchSection: ({ onPreview }: { onPreview(url: string): void }) => (
    <button type="button" onClick={() => onPreview("/sketch.png")}>
      打开草图预览
    </button>
  ),
}));

vi.mock("@/components/episode/beat-workbench/render-section", () => ({
  RenderSection: () => <div>RenderSection</div>,
}));

vi.mock("@/components/episode/beat-workbench/video-pane", () => ({
  VideoPane: () => <div>VideoPane</div>,
}));

function makeBeat(overrides: Partial<Beat> = {}): Beat {
  return {
    beat_number: 29,
    narration_segment: "旁白",
    visual_description: "画面",
    audio_type: "narration",
    video_mode: "first_frame",
    detected_identities: [],
    video_prompt: "",
    keyframe_prompt: "",
    audio_url: "",
    frame_url: "",
    video_url: "",
    ...overrides,
  };
}

function renderPanel(
  options: {
    onDefaultBackendChange?: (backend: string) => void;
    onToggleSection?: (id: SectionId) => void;
    spineTemplate?: "drama" | "narrated";
  } = {},
) {
  const openSections = new Set<SectionId>(["text", "sketch", "render", "audio", "video"]);
  return render(
    <I18nextProvider i18n={i18n}>
      <SingleBeatPanel
        beat={makeBeat()}
        project="demo"
        episode={1}
        stages={{ audio: "missing", video: "missing", sketch: "ready", render: "ready" }}
        defaultBackend="huimeng_seedance-2.0-fast"
        onDefaultBackendChange={options.onDefaultBackendChange ?? vi.fn()}
        spineTemplate={options.spineTemplate}
        openSections={openSections}
        onToggleSection={options.onToggleSection ?? vi.fn()}
      />
    </I18nextProvider>,
  );
}

describe("SingleBeatPanel", () => {
  it("shows the audio pane for 解说剧 (narrated) projects", () => {
    renderPanel({ spineTemplate: "narrated" });

    expect(screen.getByText("音频")).toBeInTheDocument();
    expect(screen.getByText("AudioPane")).toBeInTheDocument();
    expect(screen.getByText("VideoPane")).toBeInTheDocument();
  });

  it("hides the audio pane for 精品剧 (drama) projects", () => {
    renderPanel({ spineTemplate: "drama" });

    expect(screen.queryByText("音频")).not.toBeInTheDocument();
    expect(screen.queryByText("AudioPane")).not.toBeInTheDocument();
    expect(screen.getByText("VideoPane")).toBeInTheDocument();
  });

  it("delegates section and video backend changes", async () => {
    const user = userEvent.setup();
    const onDefaultBackendChange = vi.fn();
    const onToggleSection = vi.fn();
    renderPanel({
      onDefaultBackendChange,
      onToggleSection,
      spineTemplate: "narrated",
    });

    await user.click(screen.getByRole("button", { name: "文案" }));
    await user.click(screen.getByRole("combobox", { name: "视频模型" }));
    await user.click(screen.getByRole("option", { name: /Standard/ }));

    expect(onToggleSection).toHaveBeenCalledWith("text");
    expect(onDefaultBackendChange).toHaveBeenCalledWith("standard");
  });

  it("opens and closes the shared image preview", async () => {
    const user = userEvent.setup();
    renderPanel({ spineTemplate: "narrated" });

    await user.click(screen.getByRole("button", { name: "打开草图预览" }));
    expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute(
      "src",
      "/sketch.png",
    );

    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("img", { name: "Preview" })).not.toBeInTheDocument();
  });
});
