// Copyright (c) 2026 AI anime
import { Loader2 } from "lucide-react";

import { PreciseAudioPlayer } from "@/components/media/PreciseAudioPlayer";
import { Button } from "@/components/ui/button";
import { resolveMediaUrl } from "@/lib/media-url";
import type { AccountVoiceOption } from "@/shared/voice-source/voice-source";

interface AccountVoiceLibraryListProps {
  loading: boolean;
  failed: boolean;
  options: readonly AccountVoiceOption[];
  pending: boolean;
  loadingText: string;
  failedText: string;
  emptyText: string;
  bindText: string;
  onBind: (voiceId: string) => void | Promise<unknown>;
}

export function AccountVoiceLibraryList({
  loading,
  failed,
  options,
  pending,
  loadingText,
  failedText,
  emptyText,
  bindText,
  onBind,
}: AccountVoiceLibraryListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {loadingText}
      </div>
    );
  }
  if (failed) {
    return (
      <p className="rounded-[8px] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        {failedText}
      </p>
    );
  }
  if (options.length === 0) {
    return (
      <p className="rounded-[8px] border border-border bg-muted p-3 text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }
  return (
    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
      {options.map((option) => {
        const previewSrc = resolveMediaUrl(option.previewUrl);
        return (
          <div
            key={option.voiceId}
            className="flex flex-wrap items-center gap-3 rounded-[9px] border border-border bg-muted p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {option.label}
              </p>
              {previewSrc && (
                <PreciseAudioPlayer
                  src={previewSrc}
                  className="mt-2 h-7 w-full max-w-[340px]"
                />
              )}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => void onBind(option.voiceId)}
              className="h-8 rounded-md px-3 text-xs"
            >
              {bindText}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
