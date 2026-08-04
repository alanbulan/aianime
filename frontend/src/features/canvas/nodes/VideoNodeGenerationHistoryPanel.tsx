// Copyright (c) 2026 AI anime
import type { ComponentProps } from "react";

import {
  CANVAS_NODE_OPS_PANEL_CLASS,
  hasCompletedHistoryRecords,
  historyRecordOutputUrl,
  NodeGenerationHistory,
} from "@/modules/creative_canvas/public";
import { NODE_OPS_PANEL_ENTER_CLASS } from "@/features/canvas/ui/OperationPanelShell";

type GenerationHistoryProps = ComponentProps<typeof NodeGenerationHistory>;

export interface VideoNodeGenerationHistoryPanelProps {
  visible: boolean;
  records: GenerationHistoryProps["records"];
  isLoading: boolean;
  activeOutputUrl: string | null;
  topOffsetPx: number;
  horizontalOverhangPx: number;
  resolveMediaUrl: (url: string) => string;
  onRestore: GenerationHistoryProps["onRestore"];
  onRefresh: () => void;
}

export function VideoNodeGenerationHistoryPanel({
  visible,
  records,
  isLoading,
  activeOutputUrl,
  topOffsetPx,
  horizontalOverhangPx,
  resolveMediaUrl,
  onRestore,
  onRefresh,
}: VideoNodeGenerationHistoryPanelProps) {
  if (!visible || !hasCompletedHistoryRecords(records)) return null;

  return (
    <div
      className={`nodrag absolute z-[300] rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS} ${NODE_OPS_PANEL_ENTER_CLASS} px-3 py-2`}
      style={{
        top: `calc(100% + ${topOffsetPx}px)`,
        left: -horizontalOverhangPx,
        right: -horizontalOverhangPx,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <NodeGenerationHistory
        records={records}
        isLoading={isLoading}
        onRestore={onRestore}
        onRefresh={onRefresh}
        resolveMediaUrl={resolveMediaUrl}
        isActive={(record) => {
          const url = historyRecordOutputUrl(record);
          return url !== null && url === activeOutputUrl;
        }}
      />
    </div>
  );
}
