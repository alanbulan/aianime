// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Eraser,
  Loader2,
  MousePointer2,
  Paintbrush,
  Pencil,
  RotateCcw,
  Save,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GLASS_DIALOG_CONTENT_CLASS,
  GLASS_DIALOG_HEADER_CLASS,
  GLASS_DIALOG_SIDEBAR_CLASS,
  GLASS_DIALOG_TOOLBAR_CLASS,
} from "@/lib/dialog-styles";
import { cn } from "@/lib/utils";
import type { SketchPoseEditorDialogController } from "@/modules/production/application/use-sketch-pose-editor-dialog-controller";
import type {
  PosePoint,
  PoseSkeleton,
  PoseStroke,
} from "@/modules/production/domain/sketch-pose-editor";

export interface SketchPoseEditorDialogViewProps {
  controller: SketchPoseEditorDialogController;
}

interface LoadedSketchImage {
  image: HTMLImageElement;
  url: string;
}

export function SketchPoseEditorDialogView({
  controller,
}: SketchPoseEditorDialogViewProps) {
  const { t } = useTranslation();
  const { data } = controller;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [loadedImage, setLoadedImage] = useState<LoadedSketchImage | null>(null);
  const image =
    loadedImage?.url === controller.sketchUrl ? loadedImage.image : null;

  useEffect(() => {
    if (!data || !controller.open) return;
    const stage = stageRef.current;
    if (!stage) return;
    const compute = () => {
      const containerWidth = stage.clientWidth;
      const containerHeight = stage.clientHeight;
      if (containerWidth <= 0 || containerHeight <= 0) return;
      const scale = Math.min(
        containerWidth / data.width,
        containerHeight / data.height,
      );
      setDisplaySize({
        w: Math.round(data.width * scale),
        h: Math.round(data.height * scale),
      });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [controller.open, data]);

  useEffect(() => {
    if (!controller.open || !controller.sketchUrl) return;
    const nextImage = new Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      setLoadedImage({ image: nextImage, url: controller.sketchUrl });
    };
    nextImage.src = controller.sketchUrl;
    return () => {
      nextImage.onload = null;
    };
  }, [controller.open, controller.sketchUrl]);

  useEffect(() => {
    if (!data || !image) return;
    drawPoseCanvas(
      canvasRef.current,
      image,
      data.skeleton_edges,
      controller.skeletons,
      controller.canvasStrokes,
    );
  }, [controller.canvasStrokes, controller.skeletons, data, image]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = canvasPoint(event, canvas);
    const colorHex =
      controller.mode === "eraser"
        ? canvasThemeColor(canvas, "--background", "white")
        : controller.mode === "ink"
          ? canvasThemeColor(canvas, "--foreground", "black")
          : controller.activeSkeleton?.colorHex ||
            canvasThemeColor(canvas, "--primary", "cyan");
    if (controller.onStartCanvasInteraction(point, colorHex)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    controller.onMoveCanvasInteraction(canvasPoint(event, canvas));
  };

  return (
    <Dialog open={controller.open} onOpenChange={controller.onOpenChange}>
      <DialogContent
        className={cn(
          GLASS_DIALOG_CONTENT_CLASS,
          "h-[min(calc(100vh-2rem),820px)] w-[min(calc(100vw-2rem),1180px)] max-w-none overflow-hidden p-0 sm:max-w-none",
        )}
      >
        <DialogHeader className={cn(GLASS_DIALOG_HEADER_CLASS, "px-4 py-3")}>
          <DialogTitle>
            {t("episode.workbench.sketch.poseTitle", { n: controller.beatNum })}
          </DialogTitle>
        </DialogHeader>
        {!data ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t("common.loading", "Loading")}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] overflow-hidden">
            <aside
              className={cn(
                GLASS_DIALOG_SIDEBAR_CLASS,
                "min-h-0 overflow-y-auto p-3",
              )}
            >
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("episode.workbench.sketch.poseCharacters")}
                </div>
                {controller.skeletons.map((skeleton) => (
                  <div
                    key={skeleton.identityId}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      controller.onSelectSkeleton(skeleton.identityId)
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      controller.onSelectSkeleton(skeleton.identityId);
                    }}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${
                      controller.activeIdentity === skeleton.identityId
                        ? "border-primary bg-primary/10"
                        : "border-border"
                    }`}
                  >
                    <Checkbox
                      checked={skeleton.visible === true}
                      onCheckedChange={(checked) =>
                        controller.onSetSkeletonVisible(
                          skeleton.identityId,
                          checked === true,
                        )
                      }
                      onClick={(event) => event.stopPropagation()}
                    />
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: skeleton.colorHex }}
                    />
                    <span className="min-w-0 truncate">
                      {skeleton.identityId}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-6 px-2 text-[11px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        controller.onToggleSkeletonFrame(skeleton.identityId);
                      }}
                    >
                      {skeleton.visible
                        ? t("episode.workbench.sketch.poseRemoveFromFrame")
                        : t("episode.workbench.sketch.poseAddToFrame")}
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("episode.workbench.sketch.posePreset")}
                </div>
                <Select
                  value={controller.presetKey}
                  onValueChange={(value) => {
                    if (value) controller.onPresetChange(value);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full bg-background text-xs"
                    aria-label={t("episode.workbench.sketch.posePreset")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {Object.entries(data.pose_presets).map(([key, preset]) => (
                      <SelectItem key={key} value={key}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={controller.onApplyPreset}
                  disabled={
                    !controller.activeIdentity || !controller.presetKey
                  }
                  className="w-full"
                >
                  {t("episode.workbench.sketch.poseApplyPreset")}
                </Button>
              </div>
            </aside>

            <div className="flex min-h-0 flex-col overflow-hidden">
              <div
                className={cn(
                  GLASS_DIALOG_TOOLBAR_CLASS,
                  "flex shrink-0 flex-wrap items-center gap-1.5 px-3 py-2.5",
                )}
              >
                <Button
                  size="sm"
                  variant={controller.mode === "pose" ? "default" : "outline"}
                  onClick={() => controller.onModeChange("pose")}
                  className="gap-1"
                >
                  <MousePointer2 className="size-3.5" />
                  {t("episode.workbench.sketch.poseSelect")}
                </Button>
                <Button
                  size="sm"
                  variant={
                    controller.mode === "pencil" ? "default" : "outline"
                  }
                  onClick={() => controller.onModeChange("pencil")}
                  className="gap-1"
                >
                  <Pencil className="size-3.5" />
                  {t("episode.workbench.sketch.poseColorPen")}
                </Button>
                <Button
                  size="sm"
                  variant={controller.mode === "ink" ? "default" : "outline"}
                  onClick={() => controller.onModeChange("ink")}
                  className="gap-1"
                >
                  <Paintbrush className="size-3.5" />
                  {t("episode.workbench.sketch.poseInk")}
                </Button>
                <Button
                  size="sm"
                  variant={
                    controller.mode === "eraser" ? "default" : "outline"
                  }
                  onClick={() => controller.onModeChange("eraser")}
                  className="gap-1"
                >
                  <Eraser className="size-3.5" />
                  {t("episode.workbench.sketch.poseEraser")}
                </Button>
                <label className="ml-2 text-xs text-muted-foreground">
                  {t("episode.workbench.sketch.poseWidth")}
                </label>
                <input
                  type="range"
                  min={2}
                  max={16}
                  value={controller.penWidth}
                  onChange={(event) =>
                    controller.onPenWidthChange(Number(event.currentTarget.value))
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={controller.onUndo}
                  className="gap-1"
                >
                  <RotateCcw className="size-3.5" />
                  {t("episode.workbench.sketch.poseUndo")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={controller.onResetSkeletons}
                >
                  {t("episode.workbench.sketch.poseReset")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={controller.onClearStrokes}
                >
                  {t("episode.workbench.sketch.poseClear")}
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => void controller.onSave()}
                  disabled={controller.savePending}
                  className="ml-auto gap-1"
                >
                  {controller.savePending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  {t("common.save", "Save")}
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden bg-media/10 p-4">
                <div
                  ref={stageRef}
                  className="flex h-full w-full items-center justify-center rounded-lg bg-media/20 ring-1 ring-border"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, color-mix(in srgb, var(--muted-foreground) 20%, transparent) 1px, transparent 1px)",
                    backgroundSize: "18px 18px",
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    width={data.width}
                    height={data.height}
                    className="max-h-full max-w-full rounded-md border border-border bg-background shadow-xl"
                    style={{
                      width: displaySize?.w,
                      height: displaySize?.h,
                      cursor:
                        controller.mode === "pose"
                          ? "grab"
                          : controller.mode === "eraser"
                            ? "cell"
                            : "crosshair",
                    }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={controller.onFinishCanvasInteraction}
                    onPointerCancel={controller.onFinishCanvasInteraction}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function canvasPoint(
  event: PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): PosePoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function drawPoseCanvas(
  canvas: HTMLCanvasElement | null,
  image: HTMLImageElement,
  edges: Array<[string, string]>,
  skeletons: PoseSkeleton[],
  strokes: PoseStroke[],
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const skeleton of skeletons) {
    if (!skeleton.visible) continue;
    const color =
      skeleton.colorHex || canvasThemeColor(canvas, "--primary", "cyan");

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (skeleton.active) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = skeleton.lineWidth ?? 4;
    for (const [aKey, bKey] of edges) {
      const a = skeleton.joints[aKey];
      const b = skeleton.joints[bKey];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const nose = skeleton.joints.nose;
    if (nose) {
      ctx.beginPath();
      ctx.arc(nose.x, nose.y, skeleton.headRadius ?? 10, 0, Math.PI * 2);
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      ctx.stroke();
    }
    ctx.restore();

    for (const joint of Object.values(skeleton.joints)) {
      const radius = skeleton.active ? 5.5 : 4;
      ctx.beginPath();
      ctx.arc(joint.x, joint.y, radius + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = canvasThemeColor(canvas, "--background", "white");
      ctx.fill();
      ctx.beginPath();
      ctx.arc(joint.x, joint.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }
}

function canvasThemeColor(
  canvas: HTMLCanvasElement,
  variable: string,
  fallback: string,
): string {
  return getComputedStyle(canvas).getPropertyValue(variable).trim() || fallback;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: PoseStroke): void {
  if (stroke.points.length < 2) return;
  ctx.strokeStyle = stroke.eraser
    ? canvasThemeColor(ctx.canvas, "--background", "white")
    : stroke.colorHex ||
      canvasThemeColor(ctx.canvas, "--foreground", "black");
  ctx.lineWidth = stroke.width ?? 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (const point of stroke.points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}
