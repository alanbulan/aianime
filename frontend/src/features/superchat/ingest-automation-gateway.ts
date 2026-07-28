// Copyright (c) 2026 AI anime
import type { AttachmentBlob } from "@/features/superchat/ingest-automation-domain";
import { readPipelineStatus } from "@/modules/narrative_planning/public";
import {
  startStoryIngestion,
  uploadStoryDocument,
  type StartedIngestion,
  type UploadResult,
} from "@/modules/story_intake/public";

export async function uploadNovelForIngest(
  project: string,
  file: AttachmentBlob,
): Promise<UploadResult> {
  return uploadStoryDocument(
    project,
    new File([file.blob], file.filename, { type: file.blob.type }),
  );
}

export async function startNovelIngest(
  project: string,
  filename: string,
  options: { rebuild?: boolean } = {},
): Promise<StartedIngestion> {
  return startStoryIngestion(project, {
    filename,
    rebuild: options.rebuild ?? false,
  });
}

export async function projectHasIngestedContent(project: string): Promise<boolean> {
  const response = await readPipelineStatus(project);
  return Boolean(response.data.global?.ingested);
}
