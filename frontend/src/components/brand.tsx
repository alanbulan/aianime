// Copyright (c) 2026 AI anime
import { cn } from "@/lib/utils";

export const BRAND_NAME = "AI\u00a0anime";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/images/ai-anime-logo-mark.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
