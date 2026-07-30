// Copyright (c) 2026 AI anime

export type ImageEditToolbarActionKey =
  | "repaint"
  | "erase"
  | "matting"
  | "crop"
  | "hd"
  | "outpaint";

export interface ImageEditToolbarActionProjection {
  key: ImageEditToolbarActionKey;
  labelKey: string;
}

export interface ImageEditToolbarProjection {
  actions: readonly ImageEditToolbarActionProjection[];
  activeActionIndex: number;
}

const IMAGE_EDIT_TOOLBAR_ACTIONS: readonly ImageEditToolbarActionProjection[] = [
  { key: "repaint", labelKey: "nodeToolbar.repaint" },
  { key: "erase", labelKey: "nodeToolbar.erase" },
  { key: "matting", labelKey: "nodeToolbar.matting" },
  { key: "crop", labelKey: "tool.crop" },
  { key: "hd", labelKey: "nodeToolbar.hd" },
  { key: "outpaint", labelKey: "nodeToolbar.outpaint" },
];

export function projectImageEditToolbar(
  isPresetLocked: boolean,
  selectedActionKey: ImageEditToolbarActionKey,
): ImageEditToolbarProjection {
  const actions = isPresetLocked
    ? IMAGE_EDIT_TOOLBAR_ACTIONS.filter((action) => action.key !== "hd")
    : IMAGE_EDIT_TOOLBAR_ACTIONS;
  const selectedIndex = actions.findIndex(
    (action) => action.key === selectedActionKey,
  );
  const mattingIndex = actions.findIndex((action) => action.key === "matting");

  return {
    actions,
    activeActionIndex: selectedIndex >= 0 ? selectedIndex : mattingIndex,
  };
}
