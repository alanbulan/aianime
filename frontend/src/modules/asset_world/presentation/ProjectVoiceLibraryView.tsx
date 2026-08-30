// Copyright (c) 2026 AI anime
import { useState, type ReactNode } from "react";
import { AlertTriangle, Library, Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PreciseAudioPlayer } from "@/components/media/PreciseAudioPlayer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { resolveMediaUrl } from "@/lib/media-url";

export interface ProjectVoiceLibraryOption {
  voiceId: string;
  label: string;
  previewUrl: string | null;
}

export interface ProjectVoiceLibraryViewProps {
  accountVoices: readonly ProjectVoiceLibraryOption[];
  accountVoicesFailed: boolean;
  accountVoicesLoading: boolean;
  narratorVoiceContent: ReactNode;
  onDeleteAccountVoice(voiceId: string): Promise<void>;
}

function SourceBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-full border border-border bg-muted px-2 text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

export function ProjectVoiceLibraryView({
  accountVoices,
  accountVoicesFailed,
  accountVoicesLoading,
  narratorVoiceContent,
  onDeleteAccountVoice,
}: ProjectVoiceLibraryViewProps) {
  const { t } = useTranslation();
  const [deleteTarget, setDeleteTarget] =
    useState<ProjectVoiceLibraryOption | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await onDeleteAccountVoice(deleteTarget.voiceId);
      setDeleteTarget(null);
    } catch {
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background p-6">
      <div className="mx-auto w-full max-w-6xl space-y-7 pb-6">
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t("characters.voices.narratorSectionTitle")}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("characters.voices.narratorSectionDescription")}
            </p>
          </div>
          <div className="w-full max-w-3xl">{narratorVoiceContent}</div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Library className="size-4 text-muted-foreground" />
              {t("characters.voices.accountSectionTitle")}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("characters.voices.accountSectionDescription")}
            </p>
          </div>

          {accountVoicesLoading ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card p-4 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("characters.voices.accountLoading")}
            </div>
          ) : accountVoicesFailed ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-destructive/25 bg-destructive/[0.04] p-4 text-xs text-destructive">
              <AlertTriangle className="size-4" />
              {t("characters.voices.accountLoadFailed")}
            </div>
          ) : accountVoices.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-border bg-muted/35 p-4 text-xs leading-5 text-muted-foreground">
              {t("characters.voices.accountEmpty")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {accountVoices.map((voice) => {
                const audioSrc = resolveMediaUrl(voice.previewUrl);
                return (
                  <article
                    key={voice.voiceId}
                    className="rounded-[10px] border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {voice.label}
                      </h3>
                      <SourceBadge>
                        {t("characters.voices.accountSource")}
                      </SourceBadge>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="destructive"
                        aria-label={t("characters.voices.deleteFor", {
                          name: voice.label,
                        })}
                        data-ui-tooltip={t("characters.voices.delete")}
                        onClick={() => {
                          setDeleteFailed(false);
                          setDeleteTarget(voice);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    {audioSrc ? (
                      <PreciseAudioPlayer
                        src={audioSrc}
                        preload="metadata"
                        ariaLabel={t("characters.voices.previewFor", {
                          name: voice.label,
                        })}
                        className="mt-4 w-full"
                      />
                    ) : (
                      <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        {t("characters.voices.previewUnavailable")}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteFailed(false);
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("characters.voices.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("characters.voices.deleteDescription", {
                name: deleteTarget?.label ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteFailed && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {t("characters.voices.deleteFailed")}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting && <Loader2 className="size-3.5 animate-spin" />}
              {t("characters.voices.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
