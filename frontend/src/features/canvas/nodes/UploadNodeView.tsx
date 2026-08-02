// Copyright (c) 2026 AI anime
import { Handle, Position } from '@xyflow/react';
import { Camera, Image as ImageIcon, Loader2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { VIDEO_FILE_ACCEPT } from '@/features/canvas/application/videoFileTypes';
import type { UploadNodeController } from '@/features/canvas/hooks/useUploadNodeController';
import { CanvasNodeImage } from '@/features/canvas/ui/CanvasNodeImage';
import { DirectorControlBundleBadge } from '@/features/canvas/ui/DirectorControlBundleBadge';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import {
  CANVAS_NODE_INPUT_BODY_FRAME_CLASS,
  CANVAS_NODE_INPUT_BODY_SELECTED_FRAME_CLASS,
  CANVAS_NODE_INPUT_SURFACE_CLASS,
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  canvasNodeFrameClass,
} from '@/features/canvas/ui/nodeFrameStyles';
import {
  NODE_SIDE_ACTION_BUTTON_CLASS,
  NODE_SIDE_ACTION_ICON_CLASS,
  NodeSideActionRail,
} from '@/features/canvas/ui/NodeSideActionRail';
import { CandidateBindingBadges } from '@/modules/creative_canvas/public';
import { ThreeDDirectorDialog } from '@/features/viewer-kit/three-d/ThreeDDirectorDialog';

export function UploadNodeView({
  controller,
}: {
  controller: UploadNodeController;
}) {
  const { t } = useTranslation();
  const frameToneClass = controller.hasMediaContent
    ? canvasNodeFrameClass({
        selected: controller.selected,
        mainline: controller.hasMainlineContext,
      })
    : controller.selected
      ? CANVAS_NODE_INPUT_BODY_SELECTED_FRAME_CLASS
      : CANVAS_NODE_INPUT_BODY_FRAME_CLASS;
  const surfaceClass = controller.hasMediaContent
    ? CANVAS_NODE_PANEL_SURFACE_CLASS
    : CANVAS_NODE_INPUT_SURFACE_CLASS;

  return (
    <div
      className={`
        group relative overflow-visible rounded-[var(--node-radius)] border ${surfaceClass} p-0 transition-colors duration-150
        ${frameToneClass}
      `}
      style={{ width: controller.size.width, height: controller.size.height }}
      onClick={controller.select}
      onDrop={controller.drop}
      onDragOver={controller.dragOver}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={
          controller.imageOnly || controller.hasMainlineContext ? (
            <ImageIcon className="h-4 w-4" />
          ) : (
            <Upload className="h-4 w-4" />
          )
        }
        titleText={controller.title}
        editable
        onTitleChange={controller.rename}
      />
      <CandidateBindingBadges roles={controller.candidateBindingRoles} />

      {!controller.hasMediaContent ? (
        <NodeSideActionRail nodeId={controller.id}>
          <button
            type="button"
            disabled={Boolean(controller.data.isUploading)}
            onClick={(event) => {
              event.stopPropagation();
              controller.pickFile();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            title={
              controller.imageOnly
                ? '上传图片'
                : (t('node.upload.hint') ?? '上传资源')
            }
            className={NODE_SIDE_ACTION_BUTTON_CLASS}
          >
            {controller.data.isUploading ? (
              <Loader2
                className={`${NODE_SIDE_ACTION_ICON_CLASS} animate-spin`}
              />
            ) : (
              <Upload className={NODE_SIDE_ACTION_ICON_CLASS} />
            )}
            <span>
              {controller.data.isUploading
                ? '上传中'
                : controller.imageOnly
                  ? '上传图片'
                  : '上传资源'}
            </span>
          </button>
        </NodeSideActionRail>
      ) : null}

      {controller.hasMediaContent ? (
        <div className="relative block h-full w-full overflow-hidden rounded-[var(--node-radius)] bg-bg-dark">
          <DirectorControlBundleBadge
            bundle={controller.data.director_control_bundle}
          />
          <CanvasNodeImage
            src={controller.imageSource ?? ''}
            viewerSourceUrl={controller.viewerSourceUrl}
            alt={t('node.upload.uploadedAlt')}
            className="h-full w-full object-contain"
            onLoad={controller.imageLoad}
          />
        </div>
      ) : (
        <div className="block h-full w-full overflow-hidden rounded-[var(--node-radius)] bg-transparent">
          <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted/85">
            <Upload className="h-7 w-7 opacity-60" />
            <span className="px-3 text-center text-[12px] leading-6">
              {t('node.upload.hint')}
            </span>
          </div>
        </div>
      )}

      {controller.selected && controller.canOpenDirectorStage ? (
        <button
          type="button"
          disabled={controller.directorStageBusy}
          onClick={(event) => {
            event.stopPropagation();
            void controller.openDirectorStage();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          title={t('viewer.threeD.openDirectorWorldTitle')}
          className="nodrag absolute bottom-2 right-2 z-[6] inline-flex h-7 items-center gap-1.5 rounded-md border border-primary/55 bg-primary px-2.5 text-[11px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {controller.directorStageBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          <span>{t('viewer.threeD.directorWorld')}</span>
        </button>
      ) : null}

      <input
        ref={controller.inputRef}
        type="file"
        accept={
          controller.imageOnly
            ? 'image/*'
            : `image/*,${VIDEO_FILE_ACCEPT},audio/*`
        }
        className="hidden"
        onChange={controller.changeFile}
      />

      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-surface-dark !bg-muted-foreground"
      />
      <NodeResizeHandle
        minWidth={controller.size.resizeMinWidth}
        minHeight={controller.size.resizeMinHeight}
        maxWidth={1400}
        maxHeight={1400}
        keepAspectRatio
      />
      {controller.canOpenDirectorStage ? (
        <ThreeDDirectorDialog
          open={controller.directorStageOpen}
          onOpenChange={controller.changeDirectorStageOpen}
          manifest={controller.directorStageManifest}
          title={t('viewer.threeD.beatDirectorWorld')}
          description={t('viewer.threeD.beatDirectorWorldDescription')}
          viewerPurpose="beat"
          onSubmitDirectorCombined={controller.submitDirectorCombined}
          onCaptureCanvasNode={controller.captureDirectorCanvasNode}
          initialScene={controller.directorInitialScene}
          initialScenesBySourceId={controller.directorInitialScenesBySourceId}
        />
      ) : null}
    </div>
  );
}
