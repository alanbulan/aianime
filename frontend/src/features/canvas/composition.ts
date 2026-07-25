// Copyright (c) 2026 AI anime
import { readUrl } from '@/lib/url-params';

import {
  migratePastedNodeAssets as migratePastedNodeAssetsUseCase,
  type MigratePastedNodeAssetsParams,
} from './application/crossProjectAssets';
import { CanvasToolProcessor } from './application/toolProcessor';
import {
  regenerateExportImageNode as regenerateExportImageNodeUseCase,
  type RegenerateExportImageNodeParams,
} from './application/regenerateExportNode';
import {
  resumeNodeGeneration as resumeNodeGenerationUseCase,
  type ResumeNodeGenerationParams,
} from './application/resumeGeneration';
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
import { freezoneGenerationTaskGateway } from './infrastructure/freezoneGenerationTaskGateway';
import { freezoneRedrawTaskGateway } from './infrastructure/freezoneRedrawTaskGateway';
import { webImageSplitGateway } from './infrastructure/webImageSplitGateway';

export { canvasNodeFactory } from './nodeFactoryComposition';

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

export function regenerateExportImageNode(
  params: Omit<RegenerateExportImageNodeParams, 'projectId'>,
) {
  return regenerateExportImageNodeUseCase(
    {
      ...params,
      projectId: readUrl().project,
    },
    freezoneAiGateway,
    freezoneRedrawTaskGateway,
  );
}

export function resumeNodeGeneration(params: ResumeNodeGenerationParams) {
  return resumeNodeGenerationUseCase(
    params,
    freezoneGenerationTaskGateway,
  );
}
