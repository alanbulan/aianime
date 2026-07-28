// Copyright (c) 2026 AI anime
import type { UiSpec } from "@/features/superchat/spec-extract";

export type KeyframeVideoPreviewItem = {
  id: string;
  title: string;
  description?: string;
  poster?: string;
  videoSrc?: string;
  status?: string;
  progress?: number;
};

type UnifiedMediaKind = "image" | "video" | "audio";

export type UnifiedMediaItem = {
  id: string;
  kind: UnifiedMediaKind;
  title: string;
  description?: string;
  src: string;
  poster?: string;
};

function elementProps(element: unknown): Record<string, unknown> {
  if (!element || typeof element !== "object") return {};
  const props = (element as Record<string, unknown>).props;
  return props && typeof props === "object" && !Array.isArray(props)
    ? (props as Record<string, unknown>)
    : {};
}

function textProp(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberProp(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 0), 100)
    : undefined;
}

function specElementOrder(spec: UiSpec): string[] {
  const root = spec.elements[spec.root];
  const children =
    root && typeof root === "object"
      ? (root as Record<string, unknown>).children
      : undefined;
  const ordered = Array.isArray(children)
    ? children.filter((child): child is string => typeof child === "string")
    : [];
  const orderedSet = new Set(ordered);
  return [
    ...ordered,
    ...Object.keys(spec.elements).filter(
      (key) => key !== spec.root && !orderedSet.has(key),
    ),
  ];
}

export function extractUnifiedMediaItems(spec: UiSpec): UnifiedMediaItem[] {
  const mediaSpecTypes = new Set([
    "character_showcase",
    "sketch_gallery",
    "keyframe_video",
    "audio_list",
    "media_bundle",
  ]);
  if (spec.type && !mediaSpecTypes.has(spec.type)) return [];

  const items: UnifiedMediaItem[] = [];
  for (const id of specElementOrder(spec)) {
    const element = spec.elements[id];
    if (!element || typeof element !== "object") continue;
    const record = element as Record<string, unknown>;
    const props = elementProps(record);
    const type = typeof record.type === "string" ? record.type : "";
    const src = textProp(props.src, props.url);
    if (!src) continue;

    if (type === "Image") {
      items.push({
        id,
        kind: "image",
        title: textProp(
          props.overlayTitle,
          props.title,
          props.caption,
          props.alt,
          id,
        ),
        description: textProp(
          props.overlayDescription,
          props.description,
        ),
        src,
        poster: textProp(props.poster, props.thumbnail),
      });
      continue;
    }

    if (type === "Video") {
      items.push({
        id,
        kind: "video",
        title: textProp(
          props.overlayTitle,
          props.title,
          props.caption,
          props.alt,
          id,
        ),
        description: textProp(
          props.overlayDescription,
          props.description,
        ),
        src,
        poster: textProp(props.poster, props.thumbnail),
      });
      continue;
    }

    if (type === "Audio") {
      items.push({
        id,
        kind: "audio",
        title: textProp(
          props.overlayTitle,
          props.title,
          props.caption,
          props.alt,
          id,
        ),
        description: textProp(
          props.overlayDescription,
          props.description,
        ),
        src,
        poster: textProp(props.poster, props.thumbnail),
      });
    }
  }
  return items;
}

export function extractKeyframeVideoPreviewItems(
  spec: UiSpec,
): KeyframeVideoPreviewItem[] {
  return Object.entries(spec.elements).flatMap(([id, element]) => {
    if (!element || typeof element !== "object") return [];
    const record = element as Record<string, unknown>;
    if (record.type !== "Video") return [];

    const props = elementProps(record);
    const videoSrc = textProp(props.src, props.url);
    if (!videoSrc) return [];

    return [
      {
        id,
        title: textProp(props.overlayTitle, props.caption, props.alt, id),
        description: textProp(
          props.overlayDescription,
          props.description,
        ),
        poster: textProp(props.poster),
        videoSrc,
      },
    ];
  });
}

export function extractPendingKeyframeVideoItem(
  spec: UiSpec,
): KeyframeVideoPreviewItem | null {
  const root = spec.elements[spec.root];
  const rootProps = elementProps(root);
  const title = textProp(rootProps.title, rootProps.description, spec.type);
  const description = textProp(rootProps.description);
  let status = "";
  let progress: number | undefined;

  for (const element of Object.values(spec.elements)) {
    if (!element || typeof element !== "object") continue;
    const record = element as Record<string, unknown>;
    const props = elementProps(record);
    if (record.type === "Badge" && !status) {
      status = textProp(props.label, props.text);
    }
    if (record.type === "Progress" && progress === undefined) {
      progress = numberProp(props.value);
    }
  }

  if (!title && !status && progress === undefined) return null;

  return {
    id: "pending",
    title,
    description,
    status,
    progress,
  };
}
