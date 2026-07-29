// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SuperChatPanel } from "@/features/superchat/superchat-panel";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const FREEZONE_CHAT_WIDTH = "clamp(500px, 34vw, 540px)";

/**
 * AI anime 助手入口的位置（相对容器右下角的 right/bottom 偏移，px）。
 * 注意 key 不用 `ai-anime-` 前缀——那个前缀会被 reset-region-state 的
 * localStorage 清扫误删；这只是个 UI 位置偏好，跨区域保留没问题。
 */
const CHAT_LAUNCHER_POS_STORAGE_KEY = "st.freezone.chatLauncherPos";
const CHAT_LAUNCHER_SIZE = 58;
const CHAT_LAUNCHER_MARGIN = 8;
/** 默认抬到 MiniMap（约 150px 高 + 15px 边距）上方，避免挡住画布缩略图。 */
const CHAT_LAUNCHER_DEFAULT_POS = { right: 16, bottom: 180 };
const CHAT_LAUNCHER_DRAG_THRESHOLD = 4;

export interface FreezoneChatDockProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  toggleLabel: string;
}

export function FreezoneChatDock({
  open,
  onOpenChange,
  title,
  description,
  toggleLabel,
}: FreezoneChatDockProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [shouldRenderPanel, setShouldRenderPanel] = useState(open);
  const [panelVisible, setPanelVisible] = useState(open);

  useEffect(() => {
    if (!isDesktop) {
      setShouldRenderPanel(open);
      setPanelVisible(open);
      return;
    }
    if (open) {
      setShouldRenderPanel(true);
      const frame = window.requestAnimationFrame(() => setPanelVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setPanelVisible(false);
    const timeout = window.setTimeout(() => setShouldRenderPanel(false), 320);
    return () => window.clearTimeout(timeout);
  }, [isDesktop, open]);

  if (!isDesktop) {
    return (
      <>
        <FreezoneChatToggleButton
          label={toggleLabel}
          expanded={open}
          onClick={() => onOpenChange(true)}
        />
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:!max-w-[560px]">
            <SheetHeader className="sr-only">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            <SuperChatPanel variant="freezone" onRequestClose={() => onOpenChange(false)} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  if (!shouldRenderPanel) {
    return (
      <FreezoneChatToggleButton
        label={toggleLabel}
        expanded={false}
        onClick={() => onOpenChange(true)}
      />
    );
  }

  return (
    <>
      {!open && (
        <FreezoneChatToggleButton
          label={toggleLabel}
          expanded={false}
          onClick={() => onOpenChange(true)}
        />
      )}
      <aside
        className={cn(
          "absolute bottom-4 right-4 top-4 z-40 hidden origin-right flex-col overflow-hidden rounded-[14px] border border-border bg-popover/90 shadow-xl backdrop-blur-2xl transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
          panelVisible ? "translate-x-0 scale-100 opacity-100" : "translate-x-10 scale-[0.985] opacity-0",
        )}
        style={{
          width: FREEZONE_CHAT_WIDTH,
          maxWidth: "calc(100vw - 360px)",
        }}
        aria-label={title}
      >
        <SuperChatPanel variant="freezone" onRequestClose={() => onOpenChange(false)} />
      </aside>
    </>
  );
}

function loadChatLauncherPos(): { right: number; bottom: number } {
  try {
    const raw = window.localStorage.getItem(CHAT_LAUNCHER_POS_STORAGE_KEY);
    if (!raw) return CHAT_LAUNCHER_DEFAULT_POS;
    const parsed = JSON.parse(raw) as { right?: unknown; bottom?: unknown };
    if (typeof parsed.right === "number" && typeof parsed.bottom === "number") {
      return { right: parsed.right, bottom: parsed.bottom };
    }
  } catch {
    // ignore malformed storage
  }
  return CHAT_LAUNCHER_DEFAULT_POS;
}

function FreezoneChatToggleButton({
  label,
  expanded,
  onClick,
}: {
  label: string;
  expanded: boolean;
  onClick: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [motionActive, setMotionActive] = useState(false);
  const [entered, setEntered] = useState(false);
  const [pos, setPos] = useState(loadChatLauncherPos);
  // 拖拽后抑制紧随 pointerup 的 click，避免拖完顺手把面板打开。
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // 挂载时把存下来的位置钳回容器内——窗口缩小后旧坐标可能在可视区外，
  // 按钮一旦飞出去就再也拖不回来了。
  useEffect(() => {
    const parent = buttonRef.current?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const maxRight = rect.width - CHAT_LAUNCHER_SIZE - CHAT_LAUNCHER_MARGIN;
    const maxBottom = rect.height - CHAT_LAUNCHER_SIZE - CHAT_LAUNCHER_MARGIN;
    setPos((current) => {
      const clamped = {
        right: Math.min(Math.max(current.right, CHAT_LAUNCHER_MARGIN), maxRight),
        bottom: Math.min(Math.max(current.bottom, CHAT_LAUNCHER_MARGIN), maxBottom),
      };
      return clamped.right === current.right && clamped.bottom === current.bottom
        ? current
        : clamped;
    });
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      const parent = buttonRef.current?.offsetParent as HTMLElement | null;
      const parentRect = parent?.getBoundingClientRect();
      const start = {
        x: event.clientX,
        y: event.clientY,
        right: pos.right,
        bottom: pos.bottom,
      };
      let dragged = false;
      let latest = { right: pos.right, bottom: pos.bottom };

      const clamp = (value: number, max: number) =>
        Math.min(Math.max(value, CHAT_LAUNCHER_MARGIN), max);

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!dragged && Math.hypot(dx, dy) < CHAT_LAUNCHER_DRAG_THRESHOLD) return;
        dragged = true;
        const maxRight = parentRect
          ? parentRect.width - CHAT_LAUNCHER_SIZE - CHAT_LAUNCHER_MARGIN
          : Number.MAX_SAFE_INTEGER;
        const maxBottom = parentRect
          ? parentRect.height - CHAT_LAUNCHER_SIZE - CHAT_LAUNCHER_MARGIN
          : Number.MAX_SAFE_INTEGER;
        latest = {
          right: clamp(start.right - dx, maxRight),
          bottom: clamp(start.bottom - dy, maxBottom),
        };
        setPos(latest);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (dragged) {
          suppressClickRef.current = true;
          try {
            window.localStorage.setItem(
              CHAT_LAUNCHER_POS_STORAGE_KEY,
              JSON.stringify(latest),
            );
          } catch {
            // storage full / unavailable — position just won't persist
          }
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [pos.bottom, pos.right],
  );

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onClick();
  }, [onClick]);

  const playMotion = useCallback(() => {
    const video = videoRef.current;
    setMotionActive(true);
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }, []);

  const stopMotion = useCallback(() => {
    const video = videoRef.current;
    setMotionActive(false);
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }, []);

  return (
    <Button
      ref={buttonRef}
      type="button"
      size="icon-lg"
      variant="secondary"
      className={cn(
        "absolute z-50 size-[58px] cursor-grab touch-none overflow-hidden rounded-full border-0 bg-transparent p-0 shadow-lg brightness-110 transition-[opacity,transform] duration-200 ease-out hover:scale-[1.03] active:cursor-grabbing",
        entered ? "opacity-100" : "opacity-0",
      )}
      style={{ right: pos.right, bottom: pos.bottom }}
      aria-label={label}
      aria-expanded={expanded}
      onMouseEnter={playMotion}
      onMouseLeave={stopMotion}
      onFocus={playMotion}
      onBlur={stopMotion}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <img
        src="/images/avatar-ai-anime.png"
        alt=""
        className={cn(
          "absolute inset-0 size-full rounded-full object-cover transition-opacity duration-[350ms] ease-out",
          motionActive ? "opacity-0" : "opacity-100",
        )}
        aria-hidden="true"
      />
      <video
        ref={videoRef}
        src="/images/avatar-motion.mp4"
        muted
        loop
        playsInline
        preload="metadata"
        className={cn(
          "absolute inset-0 size-full rounded-full object-cover brightness-90 saturate-95 transition-opacity duration-[350ms] ease-out",
          motionActive ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
    </Button>
  );
}
