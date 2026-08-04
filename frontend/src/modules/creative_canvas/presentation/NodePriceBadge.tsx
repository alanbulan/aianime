// Copyright (c) 2026 AI anime
export interface NodePriceBadgeProps {
  label: string;
  title?: string;
}

export function NodePriceBadge({ label, title }: NodePriceBadgeProps) {
  return (
    <span
      title={title}
      className="mr-2 shrink-0 text-[14px] font-normal leading-none text-muted-foreground"
    >
      {label}
    </span>
  );
}
