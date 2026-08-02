// Copyright (c) 2026 AI anime
import {
  validMainlineContexts,
  type CandidateBindingRole,
  type MainlineContext,
} from "@/modules/creative_canvas/domain/mainlineContext";

interface NodeContextBadgesProps {
  contexts?: unknown;
  variant?: "floating" | "subtle";
}

const LABELS: Record<string, string> = {
  identity: "身份",
  voice: "声线",
  narrator_voice: "解说声线",
  bgm: "BGM",
  sfx: "音效",
  ambient_audio: "环境音",
  scene: "场景",
  prop: "道具",
  beat: "Beat",
  sketch: "草图",
  frame: "分镜",
  video: "视频",
  audio: "音频",
  director_combined: "导演合成图",
  selected_background: "当前背景",
};

const BINDING_LABELS: Record<CandidateBindingRole, string> = {
  background_candidate: "背景候选",
  sketch_candidate: "草图候选",
  frame_candidate: "分镜候选",
  selected_background: "当前背景",
  current_sketch: "当前草图",
  current_frame: "当前分镜",
};

function badgeText(ctx: MainlineContext): string {
  if (typeof ctx.episode === "number" && typeof ctx.beat === "number") {
    if (ctx.kind === "beat") return `EP${ctx.episode} / Beat ${ctx.beat}`;
    if (
      ctx.kind === "sketch" ||
      ctx.kind === "frame" ||
      ctx.kind === "video" ||
      ctx.kind === "audio" ||
      ctx.kind === "director_combined" ||
      ctx.kind === "selected_background"
    ) {
      return `${LABELS[ctx.kind]} · EP${ctx.episode}/B${ctx.beat}`;
    }
  }
  if (ctx.kind === "identity") return `身份 · ${ctx.character || ctx.identityId || ctx.label || ""}`;
  if (ctx.kind === "voice") return `声线 · ${ctx.character || ctx.identityId || ctx.label || ""}`;
  if (ctx.kind === "scene") return `场景 · ${ctx.sceneId || ctx.label || ""}`;
  if (ctx.kind === "prop") return `道具 · ${ctx.propId || ctx.label || ""}`;
  return LABELS[ctx.kind] || ctx.kind;
}

function contextKey(ctx: MainlineContext, index: number): string {
  return [
    ctx.kind,
    ctx.episode ?? "",
    ctx.beat ?? "",
    ctx.identityId ?? "",
    ctx.sceneId ?? "",
    ctx.propId ?? "",
    ctx.role ?? "",
    index,
  ].join(":");
}

export function NodeContextBadges({ contexts, variant = "floating" }: NodeContextBadgesProps) {
  const valid = validMainlineContexts(contexts);
  if (!valid.length) return null;

  const primary = valid[0];
  const visible = valid.slice(1, 4);
  const restCount = Math.max(0, valid.length - 1 - visible.length);

  if (variant === "subtle") {
    return (
      <div className="flex max-w-full flex-wrap items-center gap-1">
        <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium leading-none tracking-wide text-warning">
          <LinkIconDot />
          <span className="shrink-0">主线资产</span>
          <span className="min-w-0 truncate text-warning/90">{badgeText(primary)}</span>
        </div>
        {visible.map((ctx, index) => (
          <span
            key={contextKey(ctx, index)}
            className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning"
          >
            {ctx.markerColor && (
              <span
                className="h-2 w-2 rounded-full border border-background"
                style={{ backgroundColor: ctx.markerColor }}
              />
            )}
            <span className="max-w-[180px] truncate">{badgeText(ctx)}</span>
          </span>
        ))}
        {restCount > 0 && (
          <span className="inline-flex items-center rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
            +{restCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute left-2 top-9 z-20 flex max-w-[calc(100%-16px)] flex-col items-start gap-1.5">
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/40 bg-popover/95 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-popover-foreground shadow-sm backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="shrink-0">主线资产</span>
        <span className="min-w-0 truncate text-muted-foreground">{badgeText(primary)}</span>
      </div>
      <div className="flex max-w-full flex-wrap gap-1">
        {visible.map((ctx, index) => (
        <span
          key={contextKey(ctx, index)}
          className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-border bg-popover/95 px-2 py-0.5 text-[10px] font-medium text-popover-foreground shadow-sm backdrop-blur"
        >
          {ctx.markerColor && (
            <span
              className="h-2 w-2 rounded-full border border-background"
              style={{ backgroundColor: ctx.markerColor }}
            />
          )}
          <span className="max-w-[180px] truncate">{badgeText(ctx)}</span>
        </span>
        ))}
        {restCount > 0 && (
          <span className="inline-flex items-center rounded-full border border-border bg-popover/95 px-2 py-0.5 text-[10px] text-muted-foreground">
            +{restCount}
          </span>
        )}
      </div>
    </div>
  );
}

function LinkIconDot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-warning" />;
}

export function CandidateBindingBadges({ roles }: { roles: CandidateBindingRole[] }) {
  if (!roles.length) return null;
  return (
    <div className="pointer-events-none absolute right-2 top-9 z-20 flex max-w-[calc(100%-16px)] flex-col items-end gap-1">
      {roles.slice(0, 3).map((role) => (
        <span
          key={role}
          className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-warning/40 bg-popover/95 px-2 py-0.5 text-[10px] font-semibold text-warning shadow-sm backdrop-blur"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {BINDING_LABELS[role]}
        </span>
      ))}
    </div>
  );
}
