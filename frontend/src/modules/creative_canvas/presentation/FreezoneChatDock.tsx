// Copyright (c) 2026 AI anime
import { useFreezoneChatDockController } from "./useFreezoneChatDockController";
import { FreezoneChatDockView } from "./FreezoneChatDockView";

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
  const controller = useFreezoneChatDockController({ open, onOpenChange });

  return (
    <FreezoneChatDockView
      open={open}
      title={title}
      description={description}
      toggleLabel={toggleLabel}
      controller={controller}
    />
  );
}
