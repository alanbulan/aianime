// Copyright (c) 2026 AI anime
import { Download, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

type SpecMediaDetailSection = {
  title: string;
  body?: string;
  items?: string[];
};

export type SpecMediaDetail = {
  kind: "image" | "video";
  src: string;
  poster?: string;
  title?: string;
  description?: string;
  tags?: Array<{ label: string; color?: string }>;
  sections?: SpecMediaDetailSection[];
  candidates?: Array<{ id?: string; src: string; label?: string }>;
};

function triggerDownload(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function VideoDetailModal({
  src,
  poster,
  title,
  description,
  open,
  setOpen,
}: {
  src: string;
  poster?: string;
  title?: string;
  description?: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-5xl border-border/70 bg-background p-3 sm:max-w-5xl">
        <DialogTitle className="sr-only">{title || "Video preview"}</DialogTitle>
        <video
          className="max-h-[78vh] w-full rounded-md bg-media object-contain"
          src={src}
          poster={poster}
          controls
          autoPlay
          playsInline
        />
        {(title || description) && (
          <div className="space-y-1 px-1 pb-1">
            {title && (
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SpecMediaDetailModal({
  detail,
  onClose,
  onOpenMedia,
}: {
  detail: SpecMediaDetail | null;
  onClose: () => void;
  onOpenMedia: (detail: SpecMediaDetail) => void;
}) {
  const { t } = useTranslation();
  const open = Boolean(detail);
  const src = detail?.src ?? "";
  const poster = detail?.poster || src;
  const downloadSrc = detail?.kind === "video" ? src || poster : src;
  const sections =
    detail?.sections && detail.sections.length > 0
      ? detail.sections
      : detail?.description
        ? [{ title: t("aiAssistant.mediaDescription"), body: detail.description }]
        : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 left-0 top-0 flex h-screen w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none border-none bg-media/95 p-0 text-media-foreground backdrop-blur-xl sm:max-w-none"
      >
        <DialogTitle className="sr-only">
          {detail?.title || t("aiAssistant.mediaDetail")}
        </DialogTitle>
        <div className="absolute right-6 top-5 z-50 flex items-center gap-5">
          <button
            type="button"
            className="text-media-foreground/45 transition hover:text-media-foreground"
            onClick={() => {
              if (downloadSrc) triggerDownload(downloadSrc);
            }}
            aria-label={t("aiAssistant.download")}
            data-ui-tooltip={t("aiAssistant.download")}
          >
            <Download className="size-6" />
          </button>
          <DialogClose
            className="text-media-foreground/45 outline-none transition hover:text-media-foreground"
            aria-label={t("aiAssistant.closeDetail")}
          >
            <X className="size-7" />
          </DialogClose>
        </div>

        {detail && (
          <div className="flex h-full w-full max-w-7xl items-center justify-center p-6">
            <div className="grid h-full w-full grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
              <div className="relative mx-auto flex max-h-[82vh] max-w-full items-center justify-center overflow-hidden rounded-[28px] bg-media shadow-2xl">
                {detail.kind === "video" ? (
                  <video
                    className="block max-h-[82vh] max-w-full object-contain"
                    src={src}
                    poster={poster || undefined}
                    controls
                    playsInline
                  />
                ) : (
                  <img
                    className="block max-h-[82vh] max-w-full object-contain"
                    src={src}
                    alt={detail.title || "image"}
                  />
                )}
              </div>

              <div className="flex min-w-0 flex-col justify-center self-center">
                {detail.title && (
                  <h2 className="text-[34px] font-semibold tracking-tight text-media-foreground/95">
                    {detail.title}
                  </h2>
                )}
                {detail.tags && detail.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {detail.tags.map((tag) => (
                      <span
                        key={`${tag.label}:${tag.color ?? ""}`}
                        className="rounded border border-media-foreground/20 px-2 py-1 text-xs text-media-foreground/70"
                        style={
                          tag.color
                            ? { borderColor: tag.color, color: tag.color }
                            : undefined
                        }
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-6 space-y-0">
                  {sections.map((section, index) => (
                    <section
                      key={`${section.title}-${index}`}
                      className="border-t border-media-foreground/10 py-7 first:border-t"
                    >
                      {section.title && (
                        <h3 className="mb-5 text-[15px] font-medium text-media-foreground/55">
                          {section.title}
                        </h3>
                      )}
                      {section.items && section.items.length > 0 && (
                        <ul className="space-y-5 text-[16px] leading-8 text-media-foreground/88">
                          {section.items.map((item, itemIndex) => (
                            <li
                              key={`${section.title}-${itemIndex}`}
                              className="flex gap-3"
                            >
                              <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-media-foreground/65" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {section.body && (
                        <p className="whitespace-pre-wrap text-[16px] leading-8 text-media-foreground/88">
                          {section.body}
                        </p>
                      )}
                    </section>
                  ))}
                </div>

                {detail.candidates && detail.candidates.length > 0 && (
                  <div className="mt-2 border-t border-media-foreground/10 pt-5">
                    <div className="mb-3 text-[15px] font-medium text-media-foreground/55">
                      {t("aiAssistant.mediaCandidates")}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {detail.candidates.map((candidate, index) => (
                        <button
                          key={candidate.id || index}
                          type="button"
                          onClick={() =>
                            onOpenMedia({
                              ...detail,
                              kind: "image",
                              src: candidate.src,
                              title: candidate.label || detail.title,
                            })
                          }
                          className="block w-16 shrink-0 overflow-hidden rounded-lg border border-media-foreground/15 bg-media"
                          data-ui-tooltip={candidate.label}
                        >
                          <img
                            src={candidate.src}
                            alt={candidate.label || "candidate"}
                            className="aspect-[3/4] w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
