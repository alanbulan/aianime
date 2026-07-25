// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createUseSketchStudioController } from "@/modules/narrative_planning/application/use-sketch-studio-controller";
import type {
  Beat,
  EpisodePropMenuItem,
} from "@/modules/narrative_planning/domain/types";
import {
  SketchColorLegendView,
  SketchStudioActionsView,
  type SketchStudioActionsViewProps,
} from "@/modules/narrative_planning/presentation/SketchStudioActionsView";

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "zh",
    fallbackLng: "zh",
    interpolation: { escapeValue: false },
    resources: {
      zh: {
        translation: {
          episode: {
            workbench: {
              batch: {
                aiDetect: "AI 检测",
                reassignColors: "重新配色",
              },
              sketch: {
                identityColors: "身份",
                propColors: "道具",
                aiDetectResults: "AI检测结果",
                aiDetectResultCounts:
                  "{{beats}} beat / {{identities}} 身份 / {{props}} 道具",
                openGridGallery: "草图网格",
              },
              renderGrid: {
                title: "渲染网格",
              },
            },
          },
        },
      },
    },
  });
});

const beats: Beat[] = [
  {
    beat_number: 1,
    narration_segment: "n1",
    visual_description: "v1",
    detected_identities: ["Hero_Main"],
    detected_props: ["jade_sword"],
  },
  {
    beat_number: 2,
    narration_segment: "n2",
    visual_description: "v2",
    detected_identities: ["Hero_Main", "Villain_Main"],
    detected_props: [],
  },
];
const propMenu: EpisodePropMenuItem[] = [
  {
    prop_id: "jade_sword",
    marker_color: "#00ff00 GREEN",
    description: "Jade sword",
  },
];

const useSketchStudioController = createUseSketchStudioController(
  {
    useScript: () => ({
      data: {
        data: {
          beats: [],
          sketch_colors: { Hero_Main: "#ff0000 RED" },
        },
      },
    }),
  },
  {
    useCharacters: () => ({
      data: { data: [{ name: "Hero" }] },
    }),
  },
);

function Subject({
  legendOnly = false,
  ...props
}: Omit<SketchStudioActionsViewProps, "controller"> & {
  legendOnly?: boolean;
}) {
  const controller = useSketchStudioController({
    beats,
    episode: 1,
    project: "demo",
    propMenu,
  });
  return (
    <I18nextProvider i18n={i18n}>
      {legendOnly ? (
        <SketchColorLegendView controller={controller} />
      ) : (
        <SketchStudioActionsView controller={controller} {...props} />
      )}
    </I18nextProvider>
  );
}

describe("Sketch studio controller and views", () => {
  it("does not expose the removed scene sketch gallery command", async () => {
    const user = userEvent.setup();
    const openGridGallery = vi.fn();

    render(<Subject onOpenGridGallery={openGridGallery} />);

    expect(
      screen.queryByRole("button", { name: /场景草图画廊|openSceneGallery/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "草图网格" }));
    expect(openGridGallery).toHaveBeenCalledTimes(1);
  });

  it("hides grid gallery actions when they are disabled", () => {
    render(
      <Subject
        onOpenGridGallery={vi.fn()}
        onOpenRenderGridGallery={vi.fn()}
        showGridGalleryActions={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "草图网格" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "渲染网格" })).not.toBeInTheDocument();
  });

  it("projects identity and prop colors into the dedicated legend", () => {
    render(<Subject legendOnly />);

    expect(screen.getByText(/Hero/)).toBeInTheDocument();
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("jade_sword")).toBeInTheDocument();
  });

  it("deduplicates beat detection counts for the visible summary", () => {
    render(<Subject />);

    expect(screen.getByText("AI检测结果")).toBeInTheDocument();
    expect(screen.getByText("2 beat / 2 身份 / 1 道具")).toBeInTheDocument();
  });

  it("keeps AI mutation actions in the top batch toolbar", () => {
    render(<Subject />);

    expect(screen.queryByRole("button", { name: "AI 检测" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新配色" })).not.toBeInTheDocument();
  });
});
