// Copyright (c) 2026 AI anime
import {
  CREDIT_VALUE_CLASS,
  CreditSparkIcon,
  useCreditDisplayHidden,
} from "@/components/credit-visual";
import { isCeRuntime } from "@/lib/runtime-config";
import { cn } from "@/lib/utils";

export function CreditCostInline({
  display,
  className,
  iconClassName,
}: {
  display?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  if (useCreditDisplayHidden()) return null;
  if (isCeRuntime()) return null;
  if (!display) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none ml-1 inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium",
        CREDIT_VALUE_CLASS,
        className,
      )}
    >
      <CreditSparkIcon className={cn("size-3", iconClassName)} />
      {display}
    </span>
  );
}
