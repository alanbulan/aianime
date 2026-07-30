// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from "react";

const HOVER_MENU_CLOSE_DELAY_MS = 160;

export function useHoverMenuController() {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openNow = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(
      () => setOpen(false),
      HOVER_MENU_CLOSE_DELAY_MS,
    );
  }, [cancelClose]);

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      cancelClose();
      setOpen(nextOpen);
    },
    [cancelClose],
  );

  useEffect(() => cancelClose, [cancelClose]);

  return {
    rootProps: { open, onOpenChange, modal: false } as const,
    hoverProps: { onMouseEnter: openNow, onMouseLeave: scheduleClose },
  };
}
