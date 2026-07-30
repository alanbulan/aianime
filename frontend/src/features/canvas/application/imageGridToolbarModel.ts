// Copyright (c) 2026 AI anime
import type {
  GridActionKey,
  GridActionRequest,
} from "@/features/canvas/domain/gridAction";

interface ImageGridActionDefinition {
  key: GridActionKey;
  labelKey: string;
  promptKey: string;
  cost: number;
}

const IMAGE_GRID_ACTION_DEFINITIONS: readonly ImageGridActionDefinition[] = [
  {
    key: "multiCameraGrid",
    labelKey: "nodeToolbar.gridMenu.multiCameraGrid",
    promptKey: "nodeToolbar.gridMenu.multiCameraGridPrompt",
    cost: 14,
  },
  {
    key: "plotFourGrid",
    labelKey: "nodeToolbar.gridMenu.plotFourGrid",
    promptKey: "nodeToolbar.gridMenu.plotFourGridPrompt",
    cost: 8,
  },
  {
    key: "faceThreeView",
    labelKey: "nodeToolbar.gridMenu.faceThreeView",
    promptKey: "nodeToolbar.gridMenu.faceThreeViewPrompt",
    cost: 6,
  },
  {
    key: "productThreeView",
    labelKey: "nodeToolbar.gridMenu.productThreeView",
    promptKey: "nodeToolbar.gridMenu.productThreeViewPrompt",
    cost: 6,
  },
  {
    key: "serialStoryboard25",
    labelKey: "nodeToolbar.gridMenu.serialStoryboard25",
    promptKey: "nodeToolbar.gridMenu.serialStoryboard25Prompt",
    cost: 32,
  },
  {
    key: "cinematicLightCorrection",
    labelKey: "nodeToolbar.gridMenu.cinematicLightCorrection",
    promptKey: "nodeToolbar.gridMenu.cinematicLightCorrectionPrompt",
    cost: 4,
  },
  {
    key: "characterThreeView",
    labelKey: "nodeToolbar.gridMenu.characterThreeView",
    promptKey: "nodeToolbar.gridMenu.characterThreeViewPrompt",
    cost: 6,
  },
  {
    key: "frameProjection3sLater",
    labelKey: "nodeToolbar.gridMenu.frameProjection3sLater",
    promptKey: "nodeToolbar.gridMenu.frameProjection3sLaterPrompt",
    cost: 4,
  },
  {
    key: "frameProjection5sEarlier",
    labelKey: "nodeToolbar.gridMenu.frameProjection5sEarlier",
    promptKey: "nodeToolbar.gridMenu.frameProjection5sEarlierPrompt",
    cost: 4,
  },
];

export function projectImageGridToolbarActions(
  nodeId: string,
  resolveText: (key: string) => string,
): readonly GridActionRequest[] {
  return IMAGE_GRID_ACTION_DEFINITIONS.map((action) => ({
    nodeId,
    key: action.key,
    label: resolveText(action.labelKey),
    prompt: resolveText(action.promptKey),
    cost: action.cost,
  }));
}
