// Copyright (c) 2026 AI anime
import { useId } from "react";

import { cn } from "@/lib/utils";

export const QUOTA_VALUE_CLASS = "tabular-nums";

type QuotaSparkIconProps = {
  className?: string;
  muted?: boolean;
  withHoverMotion?: boolean;
};

export function QuotaSparkIcon({
  className,
  muted = false,
  withHoverMotion = false,
}: QuotaSparkIconProps) {
  const gradientId = `quota-spark-gradient-${useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(
        "shrink-0 origin-center",
        muted
          ? "opacity-35 grayscale"
          : "drop-shadow-[0_0_8px_rgba(20,184,255,0.34)]",
        withHoverMotion
          && "transition-[filter] duration-150 ease-[var(--ease-out-quint)] group-hover/quota:brightness-125",
        className,
      )}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="4"
          y1="20"
          x2="20"
          y2="4"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#19e6ff" />
          <stop offset="0.52" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.6l2.16 6.28L20.4 11l-6.24 2.12L12 19.4l-2.16-6.28L3.6 11l6.24-2.12L12 2.6Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M18.1 16.2l.72 1.98 1.98.72-1.98.72-.72 1.98-.72-1.98-1.98-.72 1.98-.72.72-1.98Z"
        fill="#7dd3fc"
        opacity="0.78"
      />
      <path
        d="M7.2 3.3l.44 1.18 1.18.44-1.18.44-.44 1.18-.44-1.18-1.18-.44 1.18-.44.44-1.18Z"
        fill="#22d3ee"
        opacity="0.72"
      />
    </svg>
  );
}
