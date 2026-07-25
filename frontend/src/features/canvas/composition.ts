// Copyright (c) 2026 AI anime
import { nodeCatalog } from './application/nodeCatalog';
import { CanvasNodeFactory } from './application/nodeFactory';
import {
  migratePastedNodeAssets as migratePastedNodeAssetsUseCase,
  type MigratePastedNodeAssetsParams,
} from './application/crossProjectAssets';
import { CanvasToolProcessor } from './application/toolProcessor';
import {
  regenerateExportImageNode as regenerateExportImageNodeUseCase,
} from './application/regenerateExportNode';
import {
  uploadAndAutoCommitSelectedBackgroundCandidate as uploadAndAutoCommitSelectedBackgroundCandidateUseCase,
  type SelectedBackgroundTarget,
  type UploadSelectedBackgroundCandidateOptions,
} from './application/selectedBackgroundSlot';
import {
  uploadLocalImageToBackend as uploadLocalImageToBackendUseCase,
} from './application/uploadToolOutput';
import { freezoneAssetGateway } from './infrastructure/freezoneAssetGateway';
import { freezoneAiGateway } from './infrastructure/freezoneAiGateway';
import { freezoneRedrawTaskGateway } from './infrastructure/freezoneRedrawTaskGateway';
import { uuidGenerator } from './infrastructure/idGenerator';
import { webImageSplitGateway } from './infrastructure/webImageSplitGateway';

export const canvasNodeFactory = new CanvasNodeFactory(
  uuidGenerator,
  nodeCatalog,
);
export const canvasToolProcessor = new CanvasToolProcessor(
  webImageSplitGateway,
  uuidGenerator,
);
export const canvasAiGateway = freezoneAiGateway;

export function migratePastedNodeAssets(
  params: MigratePastedNodeAssetsParams,
) {
  return migratePastedNodeAssetsUseCase(freezoneAssetGateway, params);
}

export function uploadLocalImageToBackend(
  localImageUrl: string,
  filename: string,
) {
  return uploadLocalImageToBackendUseCase(
    freezoneAssetGateway,
    localImageUrl,
    filename,
  );
}

export function uploadAndAutoCommitSelectedBackgroundCandidate(
  target: SelectedBackgroundTarget,
  blob: Blob,
  filename: string,
  options: UploadSelectedBackgroundCandidateOptions,
) {
  return uploadAndAutoCommitSelectedBackgroundCandidateUseCase(
    freezoneAssetGateway,
    target,
    blob,
    filename,
    options,
  );
}

export function regenerateExportImageNode(nodeId: string) {
  return regenerateExportImageNodeUseCase(
    nodeId,
    freezoneAiGateway,
    freezoneRedrawTaskGateway,
  );
}
