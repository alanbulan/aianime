// Copyright (c) 2026 AI anime
import {
  ChatComposer,
  type ChatComposerProps,
} from "@/modules/ai_assistant/presentation/ChatComposer";
import {
  ChatMessageArea,
  type ChatMessageAreaProps,
} from "@/modules/ai_assistant/presentation/ChatMessageArea";
import {
  ChatPanelActionViews,
  ChatPanelContextViews,
  type ChatPanelContextViewsProps,
} from "@/modules/ai_assistant/presentation/ChatPanelContextViews";
import {
  ChatPanelDetailOverlays,
  type ChatPanelDetailOverlaysProps,
} from "@/modules/ai_assistant/presentation/ChatPanelDetailOverlays";
import {
  ChatPanelHeader,
  type ChatPanelHeaderProps,
} from "@/modules/ai_assistant/presentation/ChatPanelHeader";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type SuperChatPanelViewProps = {
  composer: Omit<ChatComposerProps, "isFreezoneLayout">;
  conversationDrawer: ReactNode;
  contextViews: ChatPanelContextViewsProps;
  detailOverlays: ChatPanelDetailOverlaysProps;
  header: Omit<ChatPanelHeaderProps, "isFreezoneLayout">;
  isFreezoneLayout: boolean;
  messageArea: Omit<ChatMessageAreaProps, "isFreezoneLayout">;
};

export function SuperChatPanelView({
  composer,
  conversationDrawer,
  contextViews,
  detailOverlays,
  header,
  isFreezoneLayout,
  messageArea,
}: SuperChatPanelViewProps) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 overflow-hidden bg-background",
        isFreezoneLayout && "bg-transparent",
      )}
    >
      <section className="relative z-10 flex min-w-0 flex-1 flex-col">
        <ChatPanelHeader
          {...header}
          isFreezoneLayout={isFreezoneLayout}
        />
        <ChatPanelContextViews {...contextViews} />
        <ChatMessageArea
          {...messageArea}
          isFreezoneLayout={isFreezoneLayout}
        />
        <ChatPanelActionViews
          {...contextViews}
          isFreezoneLayout={isFreezoneLayout}
        />
        <ChatComposer
          {...composer}
          isFreezoneLayout={isFreezoneLayout}
        />
      </section>
      {conversationDrawer}
      <ChatPanelDetailOverlays {...detailOverlays} />
      <img
        src="/images/bg-chat-buttom.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 w-full max-w-none select-none"
      />
    </div>
  );
}
