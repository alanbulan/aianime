// Copyright (c) 2026 AI anime
import type {
  PointerEventHandler,
  RefObject,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SuperChatPanel } from "@/modules/ai_assistant/public";
import { cn } from "@/lib/utils";

import type { ChatLauncherPosition } from "./useFreezoneChatDockController";

const FREEZONE_CHAT_WIDTH = "clamp(500px, 34vw, 540px)";

interface FreezoneChatLauncherViewState {
  videoRef: RefObject<HTMLVideoElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  motionActive: boolean;
  entered: boolean;
  position: ChatLauncherPosition;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onClick: () => void;
  onMotionStart: () => void;
  onMotionEnd: () => void;
}

interface FreezoneChatDockViewState {
  isDesktop: boolean;
  shouldRenderPanel: boolean;
  panelVisible: boolean;
  setOpen: (open: boolean) => void;
  close: () => void;
  launcher: FreezoneChatLauncherViewState;
}

export interface FreezoneChatDockViewProps {
  open: boolean;
  title: string;
  description: string;
  toggleLabel: string;
  controller: FreezoneChatDockViewState;
}

export function FreezoneChatDockView({
  open,
  title,
  description,
  toggleLabel,
  controller,
}: FreezoneChatDockViewProps) {
  if (!controller.isDesktop) {
    return (
      <>
        <FreezoneChatToggleButton
          label={toggleLabel}
          expanded={open}
          launcher={controller.launcher}
        />
        <Sheet open={open} onOpenChange={controller.setOpen}>
          <SheetContent
            side="right"
            className="flex w-full flex-col gap-0 p-0 sm:!max-w-[560px]"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            <SuperChatPanel
              variant="freezone"
              onRequestClose={controller.close}
            />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  if (!controller.shouldRenderPanel) {
    return (
      <FreezoneChatToggleButton
        label={toggleLabel}
        expanded={false}
        launcher={controller.launcher}
      />
    );
  }

  return (
    <>
      {!open && (
        <FreezoneChatToggleButton
          label={toggleLabel}
          expanded={false}
          launcher={controller.launcher}
        />
      )}
      <aside
        className={cn(
          "absolute bottom-4 right-4 top-4 z-40 hidden origin-right flex-col overflow-hidden rounded-[14px] border border-border bg-popover/90 shadow-xl backdrop-blur-2xl transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
          controller.panelVisible
            ? "translate-x-0 scale-100 opacity-100"
            : "translate-x-10 scale-[0.985] opacity-0",
        )}
        style={{
          width: FREEZONE_CHAT_WIDTH,
          maxWidth: "calc(100vw - 360px)",
        }}
        aria-label={title}
      >
        <SuperChatPanel
          variant="freezone"
          onRequestClose={controller.close}
        />
      </aside>
    </>
  );
}

function FreezoneChatToggleButton({
  label,
  expanded,
  launcher,
}: {
  label: string;
  expanded: boolean;
  launcher: FreezoneChatLauncherViewState;
}) {
  return (
    <Button
      ref={launcher.buttonRef}
      type="button"
      size="icon-lg"
      variant="secondary"
      className={cn(
        "absolute z-50 size-[58px] cursor-grab touch-none overflow-hidden rounded-full border-0 bg-transparent p-0 shadow-lg brightness-110 transition-[opacity,transform] duration-200 ease-out hover:scale-[1.03] active:cursor-grabbing",
        launcher.entered ? "opacity-100" : "opacity-0",
      )}
      style={{
        right: launcher.position.right,
        bottom: launcher.position.bottom,
      }}
      aria-label={label}
      aria-expanded={expanded}
      onMouseEnter={launcher.onMotionStart}
      onMouseLeave={launcher.onMotionEnd}
      onFocus={launcher.onMotionStart}
      onBlur={launcher.onMotionEnd}
      onPointerDown={launcher.onPointerDown}
      onClick={launcher.onClick}
    >
      <img
        src="/images/avatar-ai-anime.png"
        alt=""
        className={cn(
          "absolute inset-0 size-full rounded-full object-cover transition-opacity duration-[350ms] ease-out",
          launcher.motionActive ? "opacity-0" : "opacity-100",
        )}
        aria-hidden="true"
      />
      <video
        ref={launcher.videoRef}
        src="/images/avatar-motion.mp4"
        muted
        loop
        playsInline
        preload="metadata"
        className={cn(
          "absolute inset-0 size-full rounded-full object-cover brightness-90 saturate-95 transition-opacity duration-[350ms] ease-out",
          launcher.motionActive ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
    </Button>
  );
}
