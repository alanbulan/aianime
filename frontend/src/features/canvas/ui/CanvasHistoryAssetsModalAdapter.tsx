// Copyright (c) 2026 AI anime
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useCanvasStore } from '@/features/canvas/canvasStore';
import { extractCanvasAssets } from '@/features/canvas/domain/canvasAssets';
import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';
import {
  CanvasHistoryAssetsModal,
  type CanvasHistoryAssetsModalCommandProps,
  type CanvasHistoryAssetsModalController,
  type HistoryNodeMeta,
  ImageViewerModal,
  VideoViewerModal,
} from '@/modules/creative_canvas/public';
import { buildStandaloneWorldManifest } from '@/features/viewer-kit/three-d/directorManifest';
import { ThreeDDirectorDialog } from '@/features/viewer-kit/three-d/ThreeDDirectorDialog';
import { downloadUrlAsFile } from '@/lib/browserDownload';
import { resolveMediaUrl } from '@/lib/media-url';

const GENERATIVE_HISTORY_NODE_TYPES = new Set<string>([
  CANVAS_NODE_TYPES.imageGen,
  CANVAS_NODE_TYPES.imageEdit,
  CANVAS_NODE_TYPES.exportImage,
  CANVAS_NODE_TYPES.storyboardSplit,
  CANVAS_NODE_TYPES.storyboardGen,
  CANVAS_NODE_TYPES.video,
  CANVAS_NODE_TYPES.videoStory,
  CANVAS_NODE_TYPES.videoCompose,
  CANVAS_NODE_TYPES.audio,
  CANVAS_NODE_TYPES.script,
  CANVAS_NODE_TYPES.threeDWorld,
]);

export type CanvasHistoryAssetsModalAdapterProps =
  CanvasHistoryAssetsModalCommandProps;

function trimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function CanvasHistoryAssetsViewerLayer({
  controller,
}: {
  controller: CanvasHistoryAssetsModalController;
}) {
  const { t } = useTranslation();
  const request = controller.worldViewerRequest;
  const worldManifest = request
    ? buildStandaloneWorldManifest({
        project: request.projectId,
        url: request.url,
        displayName: request.displayName,
      })
    : null;

  return (
    <>
      <ImageViewerModal
        open={controller.imageViewerIndex !== null}
        imageUrl={
          controller.imageViewerIndex !== null
            ? (controller.orderedImageUrls[controller.imageViewerIndex] ?? '')
            : ''
        }
        imageList={controller.orderedImageUrls}
        currentIndex={controller.imageViewerIndex ?? 0}
        onClose={controller.closeImageViewer}
        onNavigate={controller.navigateImageViewer}
      />
      <VideoViewerModal
        open={Boolean(controller.videoViewerUrl)}
        videoUrl={controller.videoViewerUrl ?? ''}
        onClose={controller.closeVideoViewer}
      />
      <ThreeDDirectorDialog
        open={Boolean(worldManifest)}
        onOpenChange={controller.setWorldViewerOpen}
        manifest={worldManifest}
        title={t('viewer.threeD.directorWorld')}
        viewerPurpose="freezone"
      />
    </>
  );
}

export function CanvasHistoryAssetsModalAdapter(
  props: CanvasHistoryAssetsModalAdapterProps,
) {
  const nodes = useCanvasStore((state) => state.nodes);
  const historyNodeIds = useMemo(
    () =>
      nodes
        .filter((node) => GENERATIVE_HISTORY_NODE_TYPES.has(node.type))
        .map((node) => node.id),
    [nodes],
  );
  const resolveNodeMeta = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return (nodeId: string): HistoryNodeMeta => {
      const node = byId.get(nodeId);
      if (!node) return { cover: null, name: null };
      const data = node.data as Record<string, unknown>;
      const sourceNodeId = trimmed(data.sourceNodeId);
      const sourceData = (sourceNodeId
        ? byId.get(sourceNodeId)?.data
        : undefined) as Record<string, unknown> | undefined;
      return {
        cover: trimmed(data.previewImageUrl),
        name:
          trimmed(sourceData?.displayName) ??
          trimmed(sourceData?.sourceFileName) ??
          trimmed(data.displayName),
      };
    };
  }, [nodes]);
  const liveAssetBuckets = useMemo(
    () => extractCanvasAssets(nodes, resolveMediaUrl),
    [nodes],
  );

  return (
    <CanvasHistoryAssetsModal
      {...props}
      historyNodeIds={historyNodeIds}
      resolveNodeMeta={resolveNodeMeta}
      liveAssetBuckets={liveAssetBuckets}
      resolveMediaUrl={resolveMediaUrl}
      downloadAsset={downloadUrlAsFile}
      ViewerLayer={CanvasHistoryAssetsViewerLayer}
    />
  );
}
