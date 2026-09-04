// Copyright (c) 2026 AI anime
import type { DirectorWorldSourceDescriptor } from "@/modules/asset_world/public";

export const CANVAS_IMAGE_TO_3D_SOURCE_KINDS = [
  "master",
  "reverse",
  "pano",
] as const;
export type CanvasImageTo3dSourceKind =
  (typeof CANVAS_IMAGE_TO_3D_SOURCE_KINDS)[number];
export type CanvasImageTo3dVisibleSourceKind = Exclude<
  CanvasImageTo3dSourceKind,
  "reverse"
>;

export interface CanvasImageTo3dSourceNode {
  readonly data?: unknown;
}

export type CanvasImageTo3dWorldSource = DirectorWorldSourceDescriptor & {
  readonly id: string;
  readonly source_type: "sog";
  readonly source_kind: CanvasImageTo3dSourceKind;
  readonly label: string;
  readonly ply_url: string;
  readonly url: string;
  readonly current: true;
};

export function resolveCanvasImageTo3dSourceKind(
  sourceNode: CanvasImageTo3dSourceNode | null,
  visibleSourceKind: CanvasImageTo3dVisibleSourceKind,
): CanvasImageTo3dSourceKind {
  if (visibleSourceKind === "pano") return "pano";
  const data = sourceNode?.data as
    | { output_role?: unknown; __freezone_source?: unknown }
    | undefined;
  const outputRole =
    typeof data?.output_role === "string" ? data.output_role : "";
  const freezoneSource = data?.__freezone_source as
    | { role?: unknown }
    | undefined;
  const sourceRole =
    typeof freezoneSource?.role === "string" ? freezoneSource.role : "";
  return outputRole === "scene_reverse_master" ||
    sourceRole === "scene_reverse_master"
    ? "reverse"
    : "master";
}

const THREE_GS_EXT_RE = /\.(ply|sog|splat|ksplat|spz)(\?|#|$)/i;

function isThreeGsCandidate(value: string): boolean {
  return THREE_GS_EXT_RE.test(value) || /scene_3gs|ply_fs|splat/i.test(value);
}

function collect3gsCandidates(
  value: unknown,
  depth: number,
  candidates: string[],
  allowNamedFallback: boolean,
): void {
  if (depth > 4) return;
  if (typeof value === "string") {
    if (isThreeGsCandidate(value)) {
      candidates.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collect3gsCandidates(item, depth + 1, candidates, allowNamedFallback);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  const result = value as Record<string, unknown>;
  const preferredKeys = [
    "sog_url",
    "sogUrl",
    "sog_path",
    "sogPath",
    "splat_url",
    "splatUrl",
    "ply_url",
    "plyUrl",
    "master_ply_url",
    "masterPlyUrl",
    "scene_3gs_ply_fs",
    "scene_3gs_master_ply_fs",
    "output_url",
    "asset_url",
    "static_url",
    "url",
  ];
  for (const key of preferredKeys) {
    const candidate = result[key];
    if (
      typeof candidate === "string"
      && candidate.length > 0
      && (allowNamedFallback || isThreeGsCandidate(candidate))
    ) {
      candidates.push(candidate);
    }
  }
  for (const key in result) {
    if (!preferredKeys.includes(key)) {
      collect3gsCandidates(
        result[key],
        depth + 1,
        candidates,
        allowNamedFallback,
      );
    }
  }
}

export function pickCanvasImageTo3dResultUrl(result: unknown): string | null {
  const candidates: string[] = [];
  collect3gsCandidates(result, 0, candidates, true);
  return pickPreferred3gsCandidate(candidates);
}

export function pickStrictCanvasImageTo3dResultUrl(
  result: unknown,
): string | null {
  const candidates: string[] = [];
  collect3gsCandidates(result, 0, candidates, false);
  return pickPreferred3gsCandidate(candidates);
}

function pickPreferred3gsCandidate(
  candidates: readonly string[],
): string | null {
  return (
    candidates.find((candidate) => /\.sog(\?|#|$)/i.test(candidate)) ??
    candidates.find((candidate) =>
      /\.(ksplat|splat|spz)(\?|#|$)/i.test(candidate),
    ) ??
    candidates.find((candidate) => /\.ply(\?|#|$)/i.test(candidate)) ??
    candidates[0] ??
    null
  );
}

export function sourceFromImageTo3gsResult(
  result: unknown,
  input: {
    readonly id: string;
    readonly sourceKind: CanvasImageTo3dSourceKind;
    readonly label: string;
    readonly collisionGlbUrl?: string | null;
  },
): CanvasImageTo3dWorldSource | null {
  const url = pickCanvasImageTo3dResultUrl(result);
  if (!url) return null;
  return {
    id: input.id,
    source_type: "sog",
    source_kind: input.sourceKind,
    label: input.label,
    ply_url: url,
    url,
    collision_glb_url: input.collisionGlbUrl ?? undefined,
    current: true,
  };
}
