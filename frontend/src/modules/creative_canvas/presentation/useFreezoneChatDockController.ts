// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useMediaQuery } from "@/shared/hooks/use-media-query";

const CHAT_LAUNCHER_POS_STORAGE_KEY = "st.freezone.chatLauncherPos";
const CHAT_LAUNCHER_SIZE = 58;
const CHAT_LAUNCHER_MARGIN = 8;
const CHAT_LAUNCHER_DEFAULT_POS = { right: 16, bottom: 180 };
const CHAT_LAUNCHER_DRAG_THRESHOLD = 4;

export interface ChatLauncherPosition {
  right: number;
  bottom: number;
}

export interface FreezoneChatDockControllerOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function loadChatLauncherPosition(): ChatLauncherPosition {
  try {
    const raw = window.localStorage.getItem(CHAT_LAUNCHER_POS_STORAGE_KEY);
    if (!raw) return CHAT_LAUNCHER_DEFAULT_POS;
    const parsed = JSON.parse(raw) as { right?: unknown; bottom?: unknown };
    if (typeof parsed.right === "number" && typeof parsed.bottom === "number") {
      return { right: parsed.right, bottom: parsed.bottom };
    }
  } catch {
    // Malformed or unavailable storage falls back to the default position.
  }
  return CHAT_LAUNCHER_DEFAULT_POS;
}

export function useFreezoneChatDockController({
  open,
  onOpenChange,
}: FreezoneChatDockControllerOptions) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [shouldRenderPanel, setShouldRenderPanel] = useState(open);
  const [panelVisible, setPanelVisible] = useState(open);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const suppressClickRef = useRef(false);
  const [motionActive, setMotionActive] = useState(false);
  const [entered, setEntered] = useState(false);
  const [position, setPosition] = useState(loadChatLauncherPosition);
  const launcherActive = !isDesktop || !open;

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

  useEffect(() => {
    if (!launcherActive) {
      setEntered(false);
      setMotionActive(false);
      return;
    }
    setPosition(loadChatLauncherPosition());
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [launcherActive]);

  useEffect(() => {
    if (!launcherActive) return;
    const parent = buttonRef.current?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const maxRight = rect.width - CHAT_LAUNCHER_SIZE - CHAT_LAUNCHER_MARGIN;
    const maxBottom = rect.height - CHAT_LAUNCHER_SIZE - CHAT_LAUNCHER_MARGIN;
    setPosition((current) => {
      const clamped = {
        right: Math.min(
          Math.max(current.right, CHAT_LAUNCHER_MARGIN),
          maxRight,
        ),
        bottom: Math.min(
          Math.max(current.bottom, CHAT_LAUNCHER_MARGIN),
          maxBottom,
        ),
      };
      return clamped.right === current.right &&
        clamped.bottom === current.bottom
        ? current
        : clamped;
    });
  }, [launcherActive]);

  const handleLauncherPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      const parent = buttonRef.current?.offsetParent as HTMLElement | null;
      const parentRect = parent?.getBoundingClientRect();
      const start = {
        x: event.clientX,
        y: event.clientY,
        right: position.right,
        bottom: position.bottom,
      };
      let dragged = false;
      let latest = { right: position.right, bottom: position.bottom };

      const clamp = (value: number, max: number) =>
        Math.min(Math.max(value, CHAT_LAUNCHER_MARGIN), max);

      const onMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;
        if (
          !dragged &&
          Math.hypot(dx, dy) < CHAT_LAUNCHER_DRAG_THRESHOLD
        ) {
          return;
        }
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
        setPosition(latest);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!dragged) return;
        suppressClickRef.current = true;
        try {
          window.localStorage.setItem(
            CHAT_LAUNCHER_POS_STORAGE_KEY,
            JSON.stringify(latest),
          );
        } catch {
          // Position persistence is best effort.
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [position.bottom, position.right],
  );

  const handleLauncherClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpenChange(true);
  }, [onOpenChange]);

  const playLauncherMotion = useCallback(() => {
    const video = videoRef.current;
    setMotionActive(true);
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }, []);

  const stopLauncherMotion = useCallback(() => {
    const video = videoRef.current;
    setMotionActive(false);
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  }, []);

  const setOpen = useCallback(
    (nextOpen: boolean) => onOpenChange(nextOpen),
    [onOpenChange],
  );
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  return {
    isDesktop,
    shouldRenderPanel,
    panelVisible,
    setOpen,
    close,
    launcher: {
      videoRef,
      buttonRef,
      motionActive,
      entered,
      position,
      onPointerDown: handleLauncherPointerDown,
      onClick: handleLauncherClick,
      onMotionStart: playLauncherMotion,
      onMotionEnd: stopLauncherMotion,
    },
  };
}
