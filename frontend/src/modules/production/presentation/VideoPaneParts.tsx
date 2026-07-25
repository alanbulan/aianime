// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BeatStageState } from "@/types/beat-state";

export function BeatVideoPlayer({
  src,
  beatNum,
}: {
  src: string;
  beatNum: number;
}) {
  return (
    <video
      key={beatNum}
      src={src}
      controls
      playsInline
      preload="metadata"
      disableRemotePlayback
      disablePictureInPicture
      controlsList="nodownload noplaybackrate noremoteplayback"
      className="h-full w-full object-contain"
    />
  );
}

export function Seedance2MediaPreview({
  src,
  state,
}: {
  src: string | null;
  state: BeatStageState;
}) {
  const { t } = useTranslation();
  if (!src) {
    return (
      <span className="px-3 text-center text-xs text-muted-foreground">
        {state === "generating"
          ? t("episode.workbench.video.generating")
          : t("episode.workbench.video.previewMissing.video")}
      </span>
    );
  }
  return <BeatVideoPlayer src={src} beatNum={0} />;
}

export function Seedance2SummaryPill({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center rounded-full border px-2 text-[11px] leading-none",
        active
          ? "border-primary/35 bg-primary/[0.07] text-primary"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "mr-1.5 size-1.5 shrink-0 rounded-full",
          active ? "bg-primary" : "bg-muted-foreground/35",
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function Seedance2Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[10px] text-muted-foreground/78">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function VideoParamField({
  label,
  htmlFor,
  hiddenLabel = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  hiddenLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {hiddenLabel ? (
        <span aria-hidden className="h-3.5 text-[10px] leading-[14px]">
          &nbsp;
        </span>
      ) : (
        <Label
          htmlFor={htmlFor}
          className="h-3.5 text-[10px] leading-[14px] text-muted-foreground/78"
        >
          {label}
        </Label>
      )}
      {children}
    </div>
  );
}

export function Seedance2Checkbox({
  id,
  checked,
  label,
  onChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <label htmlFor={id} className="cursor-pointer">
        {label}
      </label>
    </div>
  );
}
