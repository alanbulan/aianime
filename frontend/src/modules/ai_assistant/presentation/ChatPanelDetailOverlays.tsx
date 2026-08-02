// Copyright (c) 2026 AI anime
import { FormatCheckDetailsDialog } from "@/components/ingest/FormatCheckDetailsDialog";
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import { MessageDetailPanel } from "@/modules/ai_assistant/presentation/MessageDetailPanel";
import {
  SpecMediaDetailModal,
  type SpecMediaDetail,
} from "@/modules/ai_assistant/presentation/SpecMediaModals";
import type { FormatCheck } from "@/modules/story_intake/public";

export type ChatPanelDetailOverlaysProps = {
  detailMessage: ChatMessage | null;
  formatCheck: FormatCheck | null;
  formatCheckFilename?: string;
  formatCheckOpen: boolean;
  mediaDetail: SpecMediaDetail | null;
  onClearFormatCheckDetails: () => void;
  onCloseDetail: () => void;
  onCloseMedia: () => void;
  onOpenMedia: (detail: SpecMediaDetail) => void;
};

export function ChatPanelDetailOverlays({
  detailMessage,
  formatCheck,
  formatCheckFilename,
  formatCheckOpen,
  mediaDetail,
  onClearFormatCheckDetails,
  onCloseDetail,
  onCloseMedia,
  onOpenMedia,
}: ChatPanelDetailOverlaysProps) {
  return (
    <>
      <MessageDetailPanel
        message={detailMessage}
        onClose={onCloseDetail}
        onOpenMedia={onOpenMedia}
      />
      <SpecMediaDetailModal
        detail={mediaDetail}
        onClose={onCloseMedia}
        onOpenMedia={onOpenMedia}
      />
      <FormatCheckDetailsDialog
        formatCheck={formatCheck}
        filename={formatCheckFilename}
        open={formatCheckOpen}
        onOpenChange={(next) => {
          if (!next) onClearFormatCheckDetails();
        }}
      />
    </>
  );
}
