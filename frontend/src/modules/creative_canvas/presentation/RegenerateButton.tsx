// Copyright (c) 2026 AI anime
import { Loader2, RotateCcw } from 'lucide-react';

export interface RegenerateButtonProps {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
  title?: string;
  className?: string;
}

export function RegenerateButton({
  onClick,
  busy = false,
  disabled = false,
  label = '重新生成',
  title,
  className = '',
}: RegenerateButtonProps) {
  const isDisabled = busy || disabled;
  return (
    <button
      type="button"
      disabled={isDisabled}
      data-ui-tooltip={title ?? label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (isDisabled) return;
        onClick();
      }}
      className={`nodrag inline-flex items-center justify-center gap-1.5 rounded-full border border-destructive/45 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="h-3.5 w-3.5" />
      )}
      <span>{label}</span>
    </button>
  );
}
