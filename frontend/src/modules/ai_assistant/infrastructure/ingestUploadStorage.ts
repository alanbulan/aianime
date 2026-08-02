// Copyright (c) 2026 AI anime
import {
  UPLOADED_INGEST_FILES_LIMIT,
  type UploadedIngestFile,
} from "@/modules/ai_assistant/domain/ingestAutomation";

const UPLOADED_INGEST_FILES_PREFIX = "superchat:ingest-uploads:";

function uploadedIngestFilesKey(project?: string): string | null {
  const id = project?.trim();
  if (!id) return null;
  return `${UPLOADED_INGEST_FILES_PREFIX}${id}`;
}

function isUploadedIngestFile(value: unknown): value is UploadedIngestFile {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.filename === "string" &&
    typeof record.size === "number" &&
    typeof record.uploadedAt === "number"
  );
}

export function loadUploadedIngestFiles(project?: string): UploadedIngestFile[] {
  const key = uploadedIngestFilesKey(project);
  if (!key) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(raw)
      ? raw.filter(isUploadedIngestFile).slice(-UPLOADED_INGEST_FILES_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function saveUploadedIngestFiles(
  project: string | undefined,
  files: UploadedIngestFile[],
): void {
  const key = uploadedIngestFilesKey(project);
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify(files.slice(-UPLOADED_INGEST_FILES_LIMIT)),
    );
  } catch {
    // Upload history is optional context and must not block sending a message.
  }
}
