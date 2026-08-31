// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SketchAspectSelect } from "@/modules/production/presentation/BatchBarView";
import { BatchBarView } from "@/modules/production/presentation/BatchBarView";
import type { BatchBarController } from "@/modules/production/application/use-batch-bar-controller";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "episode.sketchSettings.aspectRatio") return "画幅";
      return key;
    },
  }),
}));

describe("BatchBarView sketch aspect select", () => {
  it("uses explicit 2:3 and 16:9 choices", async () => {
    const user = userEvent.setup();
    const onAspectRatioChange = vi.fn();

    render(
      <SketchAspectSelect
        aspectRatio="16:9"
        onAspectRatioChange={onAspectRatioChange}
      />,
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "画幅" })).toHaveTextContent(
      "16:9",
    );

    await user.click(screen.getByRole("combobox", { name: "画幅" }));
    expect(await screen.findByRole("option", { name: "2:3" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "16:9" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "2:3" }));

    expect(onAspectRatioChange).toHaveBeenCalledWith("2:3");
  });

  it("keeps both model purposes visible while their catalogs are loading", () => {
    const loadingModelControl = {
      isLoading: true,
      isPending: false,
      isVisible: true,
      onChange: vi.fn(),
      options: [],
      value: "",
    };
    const controller: BatchBarController = {
      assignColorsPending: false,
      audioPending: false,
      audioPrerequisiteErrors: [],
      audioUnavailableForVideoModel: false,
      detectIdentitiesPending: false,
      errorDialog: null,
      globalOptimizePending: false,
      productionWorkflowPending: false,
      renderModel: loadingModelControl,
      sketchAspectRatio: "2:3",
      sketchModel: loadingModelControl,
      showEpisodeAudio: false,
      showGlobalOptimize: false,
      onDetectIdentities: vi.fn(),
      onDismissError: vi.fn(),
      onGenerateAudio: vi.fn(),
      onGlobalOptimize: vi.fn(),
      onRunProductionWorkflow: vi.fn(),
      onReassignColors: vi.fn(),
      onSketchAspectRatioChange: vi.fn(),
    };

    render(<BatchBarView controller={controller} />);

    expect(screen.getByText("episode.sketchSettings.model")).toBeInTheDocument();
    expect(screen.getByText("episode.renderSettings.model")).toBeInTheDocument();
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(2);
  });

  it("routes complete generation through the controller's canonical workflow action", async () => {
    const user = userEvent.setup();
    const onRunProductionWorkflow = vi.fn();
    const modelControl = {
      isLoading: false,
      isPending: false,
      isVisible: false,
      onChange: vi.fn(),
      options: [],
      value: "",
    };
    const controller: BatchBarController = {
      assignColorsPending: false,
      audioPending: false,
      audioPrerequisiteErrors: [],
      audioUnavailableForVideoModel: false,
      detectIdentitiesPending: false,
      errorDialog: null,
      globalOptimizePending: false,
      productionWorkflowPending: false,
      renderModel: modelControl,
      sketchAspectRatio: "2:3",
      sketchModel: modelControl,
      showEpisodeAudio: false,
      showGlobalOptimize: false,
      onDetectIdentities: vi.fn(),
      onDismissError: vi.fn(),
      onGenerateAudio: vi.fn(),
      onGlobalOptimize: vi.fn(),
      onRunProductionWorkflow,
      onReassignColors: vi.fn(),
      onSketchAspectRatioChange: vi.fn(),
    };

    render(<BatchBarView controller={controller} />);

    await user.click(
      screen.getByRole("button", {
        name: "episode.workbench.batch.productionWorkflow",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "common.confirmExecute" }),
    );

    expect(onRunProductionWorkflow).toHaveBeenCalledTimes(1);
  });
});
