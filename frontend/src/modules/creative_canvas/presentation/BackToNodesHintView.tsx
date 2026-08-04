// Copyright (c) 2026 AI anime
export interface BackToNodesHintViewProps {
  visible: boolean;
  hint: string;
  buttonLabel: string;
  onBackToNodes: () => void;
}

export function BackToNodesHintView({
  visible,
  hint,
  buttonLabel,
  onBackToNodes,
}: BackToNodesHintViewProps) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-[130] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-popover/95 py-1.5 pl-4 pr-1.5 text-xs text-popover-foreground/85 shadow-xl backdrop-blur">
        <span className="whitespace-nowrap">{hint}</span>
        <button
          type="button"
          className="whitespace-nowrap rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/85"
          onClick={onBackToNodes}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
