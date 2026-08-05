// Copyright (c) 2026 AI anime
import {
  EXPORT_RESULT_NODE_MIN_HEIGHT,
  EXPORT_RESULT_NODE_MIN_WIDTH,
  EXPORT_RESULT_NODE_RESIZE_MIN_EDGE,
} from "../domain/imageNodeLayout";
import {
  resolveImageNodeDimension,
  resolveMinEdgeFittedSize,
  resolveResizeMinConstraintsByAspect,
} from "../domain/imageNodeSizing";
import { isVideoFile } from "../domain/videoFileTypes";
import {
  isNodeUsingDefaultDisplayName,
  resolveNodeDisplayName,
} from "../domain/nodeDisplay";
import type { DirectorControlFrameBundle, ThreeDSceneSnapshot } from "@/features/viewer-kit/public";

export const UPLOAD_NODE_TYPE = "uploadNode" as const;

export type UploadMediaKind = "image" | "video" | "audio";

export interface UploadNodeModelData {
  displayName?: unknown;
  label?: unknown;
  imageUrl?: unknown;
  previewImageUrl?: unknown;
  aspectRatio?: unknown;
  sourceFileName?: unknown;
  imageOnly?: boolean;
  __freezone_source?: unknown;
  [key: string]: unknown;
}

export interface UploadDropData {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<Pick<DataTransferItem, "kind" | "type" | "getAsFile">> | null;
}

export interface UploadNodeDirectorSource {
  role: string;
  episode: number | null;
  beat: number | null;
  canOpenDirectorStage: boolean;
}

export function resolveUploadNodeLayout(
  aspectRatio: string | null | undefined,
  width?: number,
  height?: number,
) {
  const resolvedAspectRatio = aspectRatio || "1:1";
  const compactSize = resolveMinEdgeFittedSize(resolvedAspectRatio, {
    minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
    minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
  });
  const resizeConstraints = resolveResizeMinConstraintsByAspect(
    resolvedAspectRatio,
    {
      minWidth: EXPORT_RESULT_NODE_RESIZE_MIN_EDGE,
      minHeight: EXPORT_RESULT_NODE_RESIZE_MIN_EDGE,
    },
  );

  return {
    width: resolveImageNodeDimension(width, compactSize.width),
    height: resolveImageNodeDimension(height, compactSize.height),
    resizeMinWidth: resizeConstraints.minWidth,
    resizeMinHeight: resizeConstraints.minHeight,
  };
}

export function resolveUploadNodeTitle(
  data: UploadNodeModelData,
  useUploadFilenameAsNodeTitle: boolean,
): string {
  const sourceFileName =
    typeof data.sourceFileName === "string" ? data.sourceFileName.trim() : "";
  if (
    useUploadFilenameAsNodeTitle &&
    sourceFileName &&
    isNodeUsingDefaultDisplayName(UPLOAD_NODE_TYPE, data)
  ) {
    return sourceFileName;
  }

  if (
    data.imageOnly &&
    isNodeUsingDefaultDisplayName(UPLOAD_NODE_TYPE, data)
  ) {
    return "上传图片";
  }
  return resolveNodeDisplayName(UPLOAD_NODE_TYPE, data);
}

export function resolveDroppedMediaFile(dataTransfer: UploadDropData): File | null {
  const directFile = dataTransfer.files?.[0];
  if (directFile) {
    return directFile;
  }

  // .mxf 等专业容器可能没有 MIME，文件项仍需交给扩展名规则识别。
  const items = Array.from(dataTransfer.items || []).filter(
    (candidate) => candidate.kind === "file",
  );
  for (const candidate of items) {
    if (
      candidate.type.startsWith("image/") ||
      candidate.type.startsWith("audio/")
    ) {
      return candidate.getAsFile();
    }
    const file = candidate.getAsFile();
    if (file && isVideoFile(file)) return file;
  }
  return null;
}

export function resolveUploadMediaKind(file: File): UploadMediaKind | null {
  if (isVideoFile(file)) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

export function resolveUploadNodeDirectorSource(
  data: UploadNodeModelData,
): UploadNodeDirectorSource {
  const freezoneSource =
    (data.__freezone_source as
      | {
          role?: string;
          meta?: Record<string, unknown>;
          episode?: number;
          beat?: number;
        }
      | undefined) ?? undefined;
  const role =
    typeof freezoneSource?.role === "string" ? freezoneSource.role : "";
  const sourceMeta = (freezoneSource?.meta ?? {}) as Record<string, unknown>;
  const episode =
    typeof sourceMeta.episode === "number"
      ? sourceMeta.episode
      : typeof freezoneSource?.episode === "number"
        ? freezoneSource.episode
        : null;
  const beat =
    typeof sourceMeta.beat === "number"
      ? sourceMeta.beat
      : typeof freezoneSource?.beat === "number"
        ? freezoneSource.beat
        : null;

  return {
    role,
    episode,
    beat,
    canOpenDirectorStage:
      role === "director_combined" && episode !== null && beat !== null,
  };
}

export function directorControlBundleFromData(
  value: unknown,
): DirectorControlFrameBundle | null {
  if (!value || typeof value !== "object") return null;
  const bundle = value as Partial<DirectorControlFrameBundle>;
  if (bundle.schema_version !== "director_control_bundle_v1") return null;
  return bundle as DirectorControlFrameBundle;
}

export function resolveDirectorControlBundleSourceId(
  bundle: DirectorControlFrameBundle | null,
): string | null {
  const sourceId =
    bundle?.frame_meta?.source?.source_id ?? bundle?.source?.source_id;
  return typeof sourceId === "string" && sourceId.trim() ? sourceId : null;
}

function numberTuple3(
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  const next = value.slice(0, 3).map((item) => Number(item));
  return next.every((item) => Number.isFinite(item))
    ? [next[0], next[1], next[2]]
    : fallback;
}

function snapshotMarkerFromDirectorLayerItem(
  item: unknown,
): ThreeDSceneSnapshot["actors"][number] {
  const data =
    item && typeof item === "object"
      ? (item as Record<string, unknown>)
      : {};
  const placementData =
    data.placement && typeof data.placement === "object"
      ? (data.placement as Record<string, unknown>)
      : {};
  const placement =
    placementData.space === "pano_view"
      ? {
          space: "pano_view" as const,
          yawDeg: Number(placementData.yaw_deg ?? 0),
          pitchDeg: Number(placementData.pitch_deg ?? 0),
          distance: Number(placementData.distance ?? 6),
        }
      : {
          space: "world" as const,
          position: numberTuple3(placementData.position, [0, 0, 0]),
          yawDeg: Number(placementData.yaw_deg ?? 0),
        };
  const position =
    placement.space === "world"
      ? placement.position
      : ([0, 0, 0] as [number, number, number]);

  return {
    label: typeof data.label === "string" ? data.label : "导演元素",
    color: typeof data.color === "string" ? data.color : "#38bdf8",
    placement,
    position,
    yawDeg: placement.yawDeg,
    scale: numberTuple3(data.scale, [1, 1, 1]),
    ...(typeof data.pose === "string" ? { pose: data.pose as never } : {}),
    ...(typeof data.action_playing === "boolean"
      ? { actionPlaying: data.action_playing }
      : {}),
    ...(typeof data.shape_hint === "string"
      ? { shapeHint: data.shape_hint as never }
      : {}),
  };
}

export function sceneSnapshotFromDirectorControlBundle(
  bundle: DirectorControlFrameBundle | null,
  savedAt = Date.now(),
): ThreeDSceneSnapshot | null {
  const frameMeta = bundle?.frame_meta;
  if (!frameMeta?.layer) return null;
  return {
    schemaVersion: 1,
    savedAt,
    actors: (frameMeta.layer.actors ?? []).map(
      snapshotMarkerFromDirectorLayerItem,
    ),
    props: (frameMeta.layer.props ?? []).map(snapshotMarkerFromDirectorLayerItem),
    stagings: (frameMeta.layer.stagings ?? []).map(
      snapshotMarkerFromDirectorLayerItem,
    ),
    world: {
      activeSourceId: resolveDirectorControlBundleSourceId(bundle) ?? undefined,
    },
    camera: frameMeta.camera?.state as ThreeDSceneSnapshot["camera"],
  };
}
