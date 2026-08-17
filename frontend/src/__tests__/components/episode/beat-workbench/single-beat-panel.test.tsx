// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { SingleBeatPanel } from "@/modules/narrative_planning/action-panel-composition";
import type { SectionId } from "@/modules/narrative_planning/application/use-single-beat-panel-controller";
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

vi.mock("@/modules/narrative_planning/composition", async () => {
  const { createUseSingleBeatPanelController } = await import(
    "@/modules/narrative_planning/application/use-single-beat-panel-controller"
  );
  const useSingleBeatPanelController = createUseSingleBeatPanelController(
    {
      useGridsByBeat: () => ({ byBeat: new Map(), assignments: {} }),
      useVideoModels: () => ({
        data: [
          {
            value: "standard",
            label: "Standard",
            profile: "standard" as const,
            supportsAdvancedConfig: false,
            supportsNativeAudio: false,
            dialogueOnly: false,
          },
          {
            value: "seedance-2.0-fast",
            label: "Seedance 2.0 Fast",
            profile: "seedance2" as const,
            supportsAdvancedConfig: true,
            supportsNativeAudio: true,
            dialogueOnly: false,
          },
        ],
      }),
    },
    {
      beatTextScope: () => "beat-text",
      useAssetWorkspaceNavigation: () => vi.fn(),
      useSaveState: () => ({ status: "idle" }),
    },
  );
  return {
    useActionPanelController: vi.fn(),
    useSingleBeatPanelController,
  };
});

vi.mock("@/modules/narrative_planning/text-pane-composition", () => ({
  TextPane: () => <div>TextPane</div>,
}));

vi.mock("@/modules/production/public", () => ({
  AudioPaneContent: () => <div>AudioPane</div>,
  RenderSection: () => <div>RenderSection</div>,
  SketchSection: ({ onPreview }: { onPreview(url: string): void }) => (
    <button type="button" onClick={() => onPreview("/sketch.png")}>
      打开草图预览
    </button>
  ),
  VideoPane: () => <div>VideoPane</div>,
}));

vi.mock("@/shared/hooks/use-escape-to-close", () => ({
  useEscapeToClose: vi.fn(),
}));

vi.mock("@/components/save-status", () => ({
  SaveStatus: () => null,
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
    onDefaultModelChange?: (model: string) => void;
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
        defaultModel="seedance-2.0-fast"
        onDefaultModelChange={options.onDefaultModelChange ?? vi.fn()}
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
    const onDefaultModelChange = vi.fn();
    const onToggleSection = vi.fn();
    renderPanel({
      onDefaultModelChange,
      onToggleSection,
      spineTemplate: "narrated",
    });

    await user.click(screen.getByRole("button", { name: "文案" }));
    await user.click(screen.getByRole("combobox", { name: "视频模型" }));
    await user.click(screen.getByRole("option", { name: /Standard/ }));

    expect(onToggleSection).toHaveBeenCalledWith("text");
    expect(onDefaultModelChange).toHaveBeenCalledWith("standard");
  });

  it("opens and closes the shared image preview", async () => {
    const user = userEvent.setup();
    renderPanel({ spineTemplate: "narrated" });

    await user.click(screen.getByRole("button", { name: "打开草图预览" }));
    expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute(
      "src",
      "/sketch.png",
    );
    expect(screen.getByRole("img", { name: "Preview" }).parentElement).toHaveClass(
      "top-[var(--desktop-title-bar-height,0px)]",
      "bottom-9",
    );

    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("img", { name: "Preview" })).not.toBeInTheDocument();
  });
});
