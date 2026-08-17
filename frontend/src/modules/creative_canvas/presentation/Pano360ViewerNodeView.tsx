// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import {
  Handle,
  NodeToolbar as ReactFlowNodeToolbar,
  Position,
} from '@xyflow/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  ChevronLeft,
  ChevronRight,
  Globe,
  Grid2x2,
  Grid3x3,
  ImageDown,
  Loader2,
  Lock,
  Maximize2,
  RotateCcw,
  Save,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import '@photo-sphere-viewer/core/index.css';

import type { Pano360ViewerNodeController } from './usePano360ViewerNodeController';
import {
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  canvasNodeFrameClass,
} from './canvasNodeFrameStyles';
import { NODE_INLINE_ERROR_MESSAGE_CLASS } from './canvasNodeControlStyles';
import { NodeResizeHandle } from './NodeResizeHandle';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from './NodeHeader';
import { PANO_VIEWER_SIZE_LIMITS } from '../application/pano360ViewerNodeModel';
import {
  PANO_FOV_MAX,
  PANO_FOV_MIN,
} from '@/features/viewer-kit/public';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange(next: number): void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '°',
  onChange,
}: SliderRowProps) {
  const handleNumber = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.max(min, Math.min(max, parsed)));
  };
  return (
    <div className="flex w-full items-center gap-2 text-[11px] text-foreground/78">
      <span className="w-12 shrink-0 text-left tabular-nums text-foreground/72">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => handleNumber(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        className="pano360-slider nodrag min-w-0 flex-1"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
        onChange={(event) => handleNumber(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        className="nodrag h-7 w-[58px] rounded-[7px] border border-border bg-background px-1.5 text-right text-[11px] tabular-nums text-foreground/92 outline-none transition-colors hover:border-foreground/25 focus:border-primary/45"
      />
      <span className="w-3 text-[11px] text-muted-foreground">{unit}</span>
    </div>
  );
}

interface ChipButtonProps {
  onClick(): void;
  title?: string;
  disabled?: boolean;
  children: ReactNode;
  tone?: 'default' | 'accent';
}

function ChipButton({
  onClick,
  title,
  disabled,
  children,
  tone = 'default',
}: ChipButtonProps) {
  const toneClass =
    tone === 'accent'
      ? 'border-primary/35 bg-primary/15 text-primary hover:bg-primary/20'
      : 'border-border bg-transparent text-muted-foreground hover:border-foreground/25 hover:bg-muted hover:text-foreground';
  return (
    <button
      type="button"
      data-ui-tooltip={title}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={`nodrag inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}

interface PanoToolbarButtonProps {
  onClick(): void;
  title?: string;
  disabled?: boolean;
  children: ReactNode;
}

function PanoToolbarButton({
  onClick,
  title,
  disabled,
  children,
}: PanoToolbarButtonProps) {
  return (
    <button
      type="button"
      data-ui-tooltip={title}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className="nodrag inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function PanoViewportButton({
  onClick,
  title,
  children,
}: PanoToolbarButtonProps) {
  return (
    <button
      type="button"
      data-ui-tooltip={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className="nodrag inline-flex h-7 w-7 items-center justify-center rounded-full text-media-foreground/70 transition-colors hover:text-media-foreground/90 active:text-media-foreground"
    >
      {children}
    </button>
  );
}

export function Pano360ViewerNodeView({
  controller,
}: {
  controller: Pano360ViewerNodeController;
}) {
  const { data } = controller;
  const correction = data.sphereCorrectionDeg;

  return (
    <div
      className={`group relative overflow-visible rounded-[var(--node-radius)] border ${CANVAS_NODE_PANEL_SURFACE_CLASS} p-0 transition-colors duration-150 ${canvasNodeFrameClass({ selected: controller.selected })}`}
      style={{ width: controller.size.width, height: controller.size.height }}
      onClick={controller.select}
    >
      <ReactFlowNodeToolbar
        nodeId={controller.id}
        isVisible={controller.isActive && Boolean(data.imageUrl)}
        position={Position.Top}
        align="center"
        offset={16}
        className="pointer-events-auto"
      >
        <div className="flex items-center gap-1 rounded-full border border-border bg-popover/95 px-1.5 py-1 shadow-xl backdrop-blur-md">
          <PanoToolbarButton
            onClick={controller.snapCurrent}
            disabled={controller.isCapturing}
            title="当前视角截图"
          >
            {controller.isCapturing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </PanoToolbarButton>
          <PanoToolbarButton
            onClick={controller.snap2x2}
            disabled={controller.isCapturing}
            title="4 大视角截图"
          >
            <Grid2x2 className="h-4 w-4" />
          </PanoToolbarButton>
          <PanoToolbarButton
            onClick={controller.snap4x3}
            disabled={controller.isCapturing}
            title="12 大视角截图"
          >
            <Grid3x3 className="h-4 w-4" />
          </PanoToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <PanoToolbarButton
            onClick={controller.snapAsBackgroundAnchor}
            disabled={controller.isCapturing}
            title="用作背景源(写入本 beat selected_background)"
          >
            <ImageDown className="h-4 w-4" />
          </PanoToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <PanoToolbarButton onClick={controller.resetView} title="复位视角">
            <RotateCcw className="h-4 w-4" />
          </PanoToolbarButton>
        </div>
      </ReactFlowNodeToolbar>

      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Globe className="h-4 w-4" />}
        titleText={controller.title}
        metaText={
          controller.status ||
          (data.imageUrl ? '360 自由画布查看器' : '等待上游连接全景图')
        }
        editable
        onTitleChange={controller.rename}
      />

      <div className="flex h-full w-full overflow-hidden rounded-[var(--node-radius)] bg-media">
        <div className="relative min-w-0 flex-1">
          <div
            ref={controller.viewerHostRef}
            className={`pano360-viewer-host absolute inset-0 bg-media [&_.psv-loader-container]:!hidden [&_.psv-container]:[background:transparent_!important] ${controller.isActive ? 'nopan nowheel' : ''}`}
            onPointerDown={
              controller.isActive
                ? (event) => event.stopPropagation()
                : undefined
            }
            onWheel={
              controller.isActive
                ? (event) => event.stopPropagation()
                : undefined
            }
          />
          {!data.imageUrl ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-muted/85">
              <Globe className="h-7 w-7 opacity-60" />
              <span className="px-3 text-center text-[12px] leading-6">
                连接上游图片节点开始浏览全景
              </span>
            </div>
          ) : null}

          {controller.viewerError ? (
            <div
              className={`pointer-events-none absolute left-2 right-2 top-2 max-h-24 overflow-y-auto ${NODE_INLINE_ERROR_MESSAGE_CLASS}`}
            >
              {controller.viewerError}
            </div>
          ) : null}

          {data.imageUrl ? (
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-media/35 px-2.5 py-1 text-[10px] tabular-nums text-media-foreground/75 backdrop-blur-sm">
              yaw {controller.livePosition.yawDeg.toFixed(1)}° · pitch{' '}
              {controller.livePosition.pitchDeg.toFixed(1)}° · fov{' '}
              {controller.liveFov.toFixed(0)}°
              {controller.focal ? ` · ${controller.focal}mm` : ''}
            </div>
          ) : null}

          {data.imageUrl ? (
            <div
              className="nodrag absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-media-foreground/10 bg-media/30 px-1.5 py-1 backdrop-blur-sm"
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              <PanoViewportButton
                onClick={() => controller.zoomViewportBy(10)}
                title="缩小"
              >
                <ZoomOut className="h-4 w-4" strokeWidth={1.8} />
              </PanoViewportButton>
              <PanoViewportButton
                onClick={() => controller.zoomViewportBy(-10)}
                title="放大"
              >
                <ZoomIn className="h-4 w-4" strokeWidth={1.8} />
              </PanoViewportButton>
              <PanoViewportButton
                onClick={() => controller.rotateViewportBy(-12, 0)}
                title="向左"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
              </PanoViewportButton>
              <PanoViewportButton
                onClick={() => controller.rotateViewportBy(12, 0)}
                title="向右"
              >
                <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
              </PanoViewportButton>
              <PanoViewportButton
                onClick={() => controller.rotateViewportBy(0, 8)}
                title="向上"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={1.8} />
              </PanoViewportButton>
              <PanoViewportButton
                onClick={() => controller.rotateViewportBy(0, -8)}
                title="向下"
              >
                <ArrowDown className="h-4 w-4" strokeWidth={1.8} />
              </PanoViewportButton>
              <PanoViewportButton
                onClick={controller.toggleFullscreen}
                title="进入全屏"
              >
                <Maximize2 className="h-4 w-4" strokeWidth={1.8} />
              </PanoViewportButton>
            </div>
          ) : null}

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              controller.togglePanel();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            data-ui-tooltip={controller.isPanelOpen ? '收起控制面板' : '展开控制面板'}
            className="nodrag absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-media-foreground/10 bg-media/35 text-media-foreground/75 backdrop-blur-sm transition-colors hover:bg-media/50 hover:text-media-foreground"
          >
            {controller.isPanelOpen ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {controller.isPanelOpen ? (
          <div
            className="pano360-control-panel nopan nowheel flex h-full w-[336px] shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-l border-border bg-card/95 p-4 text-[12px] text-foreground backdrop-blur-sm"
            onWheel={(event) => event.stopPropagation()}
          >
            <section className="flex flex-col gap-2">
              <header className="flex items-center justify-between gap-3 text-[11px] font-medium text-foreground/72">
                <span>视场角 FOV</span>
                <span className="tabular-nums text-muted-foreground">
                  {controller.liveFov.toFixed(0)}° · {controller.focal ?? '—'}mm
                </span>
              </header>
              <SliderRow
                label="fov"
                value={data.fovDeg}
                min={PANO_FOV_MIN}
                max={PANO_FOV_MAX}
                step={1}
                onChange={controller.setFovDeg}
              />
              <div className="flex flex-wrap gap-1.5">
                {[20, 35, 50, 70, 90, 120, 150].map((preset) => (
                  <ChipButton
                    key={preset}
                    onClick={() => controller.setFovDeg(preset)}
                  >
                    {preset}°
                  </ChipButton>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <header className="flex items-center justify-between gap-3 text-[11px] font-medium text-foreground/72">
                <span>球面校正</span>
                <button
                  type="button"
                  className="nodrag rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    controller.resetCorrection();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  重置
                </button>
              </header>
              <SliderRow
                label="roll"
                value={correction.roll}
                min={-180}
                max={180}
                onChange={(next) =>
                  controller.updateCorrectionAxis('roll', next)
                }
              />
              <SliderRow
                label="pitch"
                value={correction.pitch}
                min={-90}
                max={90}
                onChange={(next) =>
                  controller.updateCorrectionAxis('pitch', next)
                }
              />
              <SliderRow
                label="yaw"
                value={correction.yaw}
                min={-180}
                max={180}
                onChange={(next) =>
                  controller.updateCorrectionAxis('yaw', next)
                }
              />
              <div className="flex flex-wrap gap-1.5">
                <ChipButton
                  onClick={controller.lockCurrentView}
                  title="把当前视角烘焙进校正参数"
                >
                  <Lock className="h-3 w-3" /> 锁定当前视角
                </ChipButton>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <header className="flex items-center justify-between gap-3 text-[11px] font-medium text-foreground/72">
                <span>正前方</span>
                <span className="tabular-nums text-muted-foreground">
                  {data.frontYawDeg.toFixed(1)}°
                </span>
              </header>
              <SliderRow
                label="front"
                value={data.frontYawDeg}
                min={-180}
                max={180}
                onChange={controller.setFrontYaw}
              />
              <div className="flex flex-wrap gap-1.5">
                <ChipButton
                  onClick={controller.setFrontYawFromView}
                  title="把当前视角的 yaw 设为正前"
                >
                  设为当前视角
                </ChipButton>
                {(['front', 'right', 'back', 'left', 'seam'] as const).map(
                  (direction) => (
                    <ChipButton
                      key={direction}
                      onClick={() => controller.rotateToDirection(direction)}
                    >
                      {direction}
                    </ChipButton>
                  ),
                )}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <header className="text-[11px] font-medium text-foreground/72">
                效果与导出
              </header>
              <div className="flex flex-wrap gap-1.5">
                {controller.planetBackup ? (
                  <ChipButton onClick={controller.exitPlanet} tone="accent">
                    退出小行星
                  </ChipButton>
                ) : (
                  <ChipButton onClick={controller.enterPlanet}>
                    小行星模式
                  </ChipButton>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <ChipButton
                  onClick={controller.copyCorrectionJson}
                  title="把当前 frontYaw / 校正参数 / FOV 复制为 JSON"
                >
                  <Save className="h-3 w-3" /> 复制校正 JSON
                </ChipButton>
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-surface-dark !bg-muted-foreground"
      />
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-surface-dark !bg-muted-foreground"
      />
      <NodeResizeHandle
        minWidth={PANO_VIEWER_SIZE_LIMITS.minWidth}
        minHeight={PANO_VIEWER_SIZE_LIMITS.minHeight}
        maxWidth={PANO_VIEWER_SIZE_LIMITS.maxWidth}
        maxHeight={PANO_VIEWER_SIZE_LIMITS.maxHeight}
      />
    </div>
  );
}
