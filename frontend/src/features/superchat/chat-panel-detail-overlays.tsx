// Copyright (c) 2026 AI anime
import { FormatCheckDetailsDialog } from "@/components/ingest/FormatCheckDetailsDialog";
import { MessageDetailPanel } from "@/features/superchat/message-detail-panel";
import {
  SpecMediaDetailModal,
  type SpecMediaDetail,
} from "@/features/superchat/spec-media-modals";
import type { ChatMessage } from "@/features/superchat/types";
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
