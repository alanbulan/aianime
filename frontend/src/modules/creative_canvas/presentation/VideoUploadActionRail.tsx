// Copyright (c) 2026 AI anime
import { Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  NODE_SIDE_ACTION_BUTTON_CLASS,
  NODE_SIDE_ACTION_ICON_CLASS,
  NodeSideActionRail,
} from "./NodeSideActionRail";

export interface VideoUploadActionRailProps {
  nodeId: string;
  selected: boolean;
  nodeHovered: boolean;
  onUpload: () => void;
}

export function VideoUploadActionRail({
  nodeId,
  selected,
  nodeHovered,
  onUpload,
}: VideoUploadActionRailProps) {
  const { t } = useTranslation();

  return (
    <NodeSideActionRail
      nodeId={nodeId}
      autoHide
      selected={selected}
      nodeHovered={nodeHovered}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onUpload();
        }}
        className={NODE_SIDE_ACTION_BUTTON_CLASS}
        data-ui-tooltip={t("node.videoNode.clickToUpload")}
      >
        <Upload className={NODE_SIDE_ACTION_ICON_CLASS} />
        <span>{t("node.videoNode.upload")}</span>
      </button>
    </NodeSideActionRail>
  );
}
