export type InputMode = "upload" | "paste";
export type UploadedFileSource = "upload" | "paste";
export type IngestFileStatus =
  | "uploaded"
  | "importing"
  | "completed"
  | "stopped"
  | "failed";

const ACTIVE_INGEST_STATUSES = new Set([
  "submitting",
  "queued",
  "pending",
  "starting",
  "running",
]);

export const PASTE_TEXT_MAX_LENGTH = 1000;

export function isActiveIngestionTask(taskType: string, status: string): boolean {
  return taskType === "ingest_fast" && ACTIVE_INGEST_STATUSES.has(status);
}

export function countBillableNovelChars(text: string): number {
  return text ? text.replace(/[\s\u3000]+/g, "").length : 0;
}
