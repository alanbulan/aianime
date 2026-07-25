// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type {
  ProductionDataResponse,
  ProductionErrorResponse,
} from "@/modules/production/application/ports";
import {
  addSkeletonToFrame,
  cloneJoints,
  hitTestPoseJoint,
  movePoseDrag,
  removeSkeletonFromFrame,
  resetSkeletonPoses,
  scalePosePresetJoints,
  setActiveSkeleton,
  type PoseDragState,
  type PosePoint,
  type PoseSkeleton,
  type PoseStroke,
  type SaveSketchPoseEditorCommand,
  type SketchPoseEditorData,
  type SketchPoseEditorSaveResult,
} from "@/modules/production/domain/sketch-pose-editor";

export type SketchPoseEditorMode = "pose" | "pencil" | "ink" | "eraser";

interface SketchPoseEditorQuery {
  data?:
    | ProductionDataResponse<SketchPoseEditorData>
    | ProductionErrorResponse;
}

interface SaveSketchPoseEditorMutation {
  isPending: boolean;
  mutateAsync(
    command: SaveSketchPoseEditorCommand,
  ): Promise<
    ProductionDataResponse<SketchPoseEditorSaveResult> | ProductionErrorResponse
  >;
}

export interface SketchPoseEditorDialogControllerQueries {
  useSaveSketchPoseEditor(
    project: string,
    episode: number,
  ): SaveSketchPoseEditorMutation;
  useSketchPoseEditor(
    project: string,
    episode: number,
    beatNum: number,
    enabled: boolean,
  ): SketchPoseEditorQuery;
}

export interface SketchPoseEditorDialogControllerDependencies {
  resolveMediaUrl(value: string): string | null;
}

export interface SketchPoseEditorDialogControllerOptions {
  beatNum: number;
  episode: number;
  open: boolean;
  project: string;
  onOpenChange(open: boolean): void;
}

export interface SketchPoseEditorDialogController {
  activeIdentity: string;
  activeSkeleton: PoseSkeleton | null;
  beatNum: number;
  canvasStrokes: PoseStroke[];
  data: SketchPoseEditorData | null;
  mode: SketchPoseEditorMode;
  open: boolean;
  penWidth: number;
  presetKey: string;
  savePending: boolean;
  skeletons: PoseSkeleton[];
  sketchUrl: string;
  strokes: PoseStroke[];
  onApplyPreset(): void;
  onClearStrokes(): void;
  onFinishCanvasInteraction(): void;
  onModeChange(mode: SketchPoseEditorMode): void;
  onMoveCanvasInteraction(point: PosePoint): void;
  onOpenChange(open: boolean): void;
  onPenWidthChange(width: number): void;
  onPresetChange(key: string): void;
  onResetSkeletons(): void;
  onSave(): Promise<void>;
  onSelectSkeleton(identityId: string): void;
  onSetSkeletonVisible(identityId: string, visible: boolean): void;
  onStartCanvasInteraction(point: PosePoint, strokeColorHex: string): boolean;
  onToggleSkeletonFrame(identityId: string): void;
  onUndo(): void;
}

export function createUseSketchPoseEditorDialogController(
  queries: SketchPoseEditorDialogControllerQueries,
  dependencies: SketchPoseEditorDialogControllerDependencies,
) {
  return function useSketchPoseEditorDialogController({
    beatNum,
    episode,
    open,
    project,
    onOpenChange,
  }: SketchPoseEditorDialogControllerOptions): SketchPoseEditorDialogController {
    const { t } = useTranslation();
    const poseQuery = queries.useSketchPoseEditor(
      project,
      episode,
      beatNum,
      open,
    );
    const savePose = queries.useSaveSketchPoseEditor(project, episode);
    const data = poseQuery.data?.ok ? poseQuery.data.data : null;
    const [skeletons, setSkeletons] = useState<PoseSkeleton[]>([]);
    const [initialSkeletons, setInitialSkeletons] = useState<PoseSkeleton[]>([]);
    const [strokes, setStrokes] = useState<PoseStroke[]>([]);
    const [activeIdentity, setActiveIdentity] = useState("");
    const [mode, setMode] = useState<SketchPoseEditorMode>("pose");
    const [penWidth, setPenWidth] = useState(4);
    const [presetKey, setPresetKey] = useState("");
    const [drawingStroke, setDrawingStroke] = useState<PoseStroke | null>(null);
    const [poseDrag, setPoseDrag] = useState<PoseDragState | null>(null);

    useEffect(() => {
      if (!data || !open) return;
      const loaded = data.skeletons.map((skeleton) => ({
        ...skeleton,
        joints: cloneJoints(skeleton.joints),
      }));
      setSkeletons(loaded);
      setInitialSkeletons(loaded);
      setStrokes([]);
      setActiveIdentity(data.skeletons[0]?.identityId ?? "");
      setPresetKey(Object.keys(data.pose_presets)[0] ?? "");
      setMode("pose");
      setPoseDrag(null);
    }, [data, open]);

    const activeSkeleton = useMemo(
      () =>
        skeletons.find((item) => item.identityId === activeIdentity) ?? null,
      [activeIdentity, skeletons],
    );
    const canvasStrokes = useMemo(
      () => (drawingStroke ? [...strokes, drawingStroke] : strokes),
      [drawingStroke, strokes],
    );

    const onStartCanvasInteraction = (
      point: PosePoint,
      strokeColorHex: string,
    ): boolean => {
      if (mode === "pose") {
        const hit = hitTestPoseJoint(skeletons, point, 18);
        if (!hit) {
          setSkeletons((items) =>
            items.map((item) => ({ ...item, active: false })),
          );
          return false;
        }
        const skeleton = skeletons[hit.skeletonIndex];
        if (!skeleton) return false;
        setActiveIdentity(skeleton.identityId);
        setSkeletons((items) => setActiveSkeleton(items, skeleton.identityId));
        setPoseDrag({
          ...hit,
          bodyDrag: hit.jointKey === "neck" || hit.jointKey === "nose",
          startPoint: point,
          startJoints: cloneJoints(skeleton.joints),
        });
        return true;
      }

      setDrawingStroke({
        points: [point],
        width: penWidth,
        colorHex: strokeColorHex,
        eraser: mode === "eraser",
      });
      return true;
    };

    const onMoveCanvasInteraction = (point: PosePoint) => {
      if (poseDrag && data) {
        setSkeletons((items) =>
          movePoseDrag(items, poseDrag, point, data.width, data.height),
        );
        return;
      }
      if (!drawingStroke) return;
      setDrawingStroke({
        ...drawingStroke,
        points: [...drawingStroke.points, point],
      });
    };

    const onFinishCanvasInteraction = () => {
      if (poseDrag) {
        setPoseDrag(null);
        return;
      }
      if (!drawingStroke) return;
      if (drawingStroke.points.length > 1) {
        setStrokes((items) => [...items, drawingStroke]);
      }
      setDrawingStroke(null);
    };

    const onApplyPreset = () => {
      if (!data || !presetKey || !activeIdentity) return;
      const preset = data.pose_presets[presetKey];
      if (!preset) return;
      setSkeletons((items) =>
        items.map((item) =>
          item.identityId === activeIdentity
            ? {
                ...item,
                visible: true,
                joints: scalePosePresetJoints(
                  preset.joints,
                  data.width,
                  data.height,
                ),
              }
            : item,
        ),
      );
    };

    const onSave = async () => {
      try {
        const response = await savePose.mutateAsync({
          beatNum,
          state: { skeletons, strokes },
        });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        toast.success(t("episode.workbench.sketch.poseSaved"));
        onOpenChange(false);
      } catch {
        toast.error(t("common.error"));
      }
    };

    return {
      activeIdentity,
      activeSkeleton,
      beatNum,
      canvasStrokes,
      data,
      mode,
      open,
      penWidth,
      presetKey,
      savePending: savePose.isPending,
      skeletons,
      sketchUrl: data
        ? dependencies.resolveMediaUrl(data.sketch_url) ?? ""
        : "",
      strokes,
      onApplyPreset,
      onClearStrokes: () => setStrokes([]),
      onFinishCanvasInteraction,
      onModeChange: setMode,
      onMoveCanvasInteraction,
      onOpenChange,
      onPenWidthChange: setPenWidth,
      onPresetChange: setPresetKey,
      onResetSkeletons: () =>
        setSkeletons((items) => resetSkeletonPoses(items, initialSkeletons)),
      onSave,
      onSelectSkeleton: (identityId) => {
        setActiveIdentity(identityId);
        setSkeletons((items) => setActiveSkeleton(items, identityId));
      },
      onSetSkeletonVisible: (identityId, visible) => {
        setSkeletons((items) =>
          items.map((item) =>
            item.identityId === identityId
              ? { ...item, visible, active: visible }
              : item,
          ),
        );
      },
      onStartCanvasInteraction,
      onToggleSkeletonFrame: (identityId) => {
        const skeleton = skeletons.find(
          (item) => item.identityId === identityId,
        );
        if (!skeleton) return;
        if (skeleton.visible) {
          setSkeletons((items) => removeSkeletonFromFrame(items, identityId));
          return;
        }
        setActiveIdentity(identityId);
        setSkeletons((items) => addSkeletonToFrame(items, identityId));
      },
      onUndo: () => {
        if (strokes.length > 0) {
          setStrokes((items) => items.slice(0, -1));
          return;
        }
        setSkeletons((items) => resetSkeletonPoses(items, initialSkeletons));
      },
    };
  };
}
