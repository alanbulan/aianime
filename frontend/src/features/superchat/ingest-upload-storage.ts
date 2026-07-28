// Copyright (c) 2026 AI anime
import type { UploadResult } from "@/modules/story_intake/public";

const UPLOADED_INGEST_FILES_PREFIX = "superchat:ingest-uploads:";
const UPLOADED_INGEST_FILES_LIMIT = 20;

export type UploadedIngestFile = {
  filename: string;
  originalName?: string;
  size: number;
  totalChars?: number;
  chapterCount?: number;
  uploadedAt: number;
};

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

export function mergeUploadedIngestFiles(
  current: UploadedIngestFile[],
  additions: UploadedIngestFile[],
): UploadedIngestFile[] {
  if (additions.length === 0) return current;
  const byFilename = new Map<string, UploadedIngestFile>();
  for (const item of current) byFilename.set(item.filename, item);
  for (const item of additions) byFilename.set(item.filename, item);
  return [...byFilename.values()]
    .sort((left, right) => left.uploadedAt - right.uploadedAt)
    .slice(-UPLOADED_INGEST_FILES_LIMIT);
}

export function uploadedIngestFileFromUpload(
  upload: UploadResult,
  originalName?: string,
  uploadedAt = Date.now(),
): UploadedIngestFile {
  return {
    filename: upload.filename,
    originalName,
    size: upload.size,
    totalChars: upload.total_chars,
    chapterCount: upload.count,
    uploadedAt,
  };
}
