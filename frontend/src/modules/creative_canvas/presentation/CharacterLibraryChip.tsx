// Copyright (c) 2026 AI anime
import { Library } from "lucide-react";

import {
  NODE_TEXT_CONTROL_ICON_CLASS,
  NODE_TEXT_CONTROL_TRIGGER_CLASS,
} from "./canvasNodeControlStyles";

export interface CharacterLibraryChipProps {
  onOpen: () => void;
}

export function CharacterLibraryChip({ onOpen }: CharacterLibraryChipProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className={`${NODE_TEXT_CONTROL_TRIGGER_CLASS} group/asset px-1.5`}
    >
      <Library
        className={`${NODE_TEXT_CONTROL_ICON_CLASS} group-hover/asset:text-text-dark`}
      />
      <span>资产库</span>
    </button>
  );
}
