// Copyright (c) 2026 AI anime
import type { ChatAttachment } from "@/modules/ai_assistant/domain/contracts";
import type { UploadResult } from "@/modules/story_intake/public";

const VIDEO_CREATION_RE =
  /(生成|创建|制作|开始|做|转|剪|出).{0,12}(视频|短剧|短片|成片|影片)|(?:视频|短剧|短片|成片|影片).{0,12}(生成|创建|制作|开始|做|转)|create.{0,16}video|make.{0,16}video|generate.{0,16}video|story.{0,12}video/i;
const UPLOADED_FILES_QUERY_RE =
  /(当前|现在|刚才|我)?\s*(上传|传了|传过|已上传).{0,12}(哪些|什么|列表|文件|剧本|小说)|(?:what|which|list|show).{0,20}uploaded.{0,10}(files?|scripts?)/i;

const NOVEL_ATTACHMENT_EXTENSIONS = new Set([".txt", ".md", ".doc", ".docx"]);
const CHAT_IMAGE_ATTACHMENT_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);
const INLINE_TEXT_ATTACHMENT_EXTENSIONS = new Set([".txt", ".md"]);
const NOVEL_ATTACHMENT_MIME_TYPES = new Set([
  "text/markdown",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const CHAT_IMAGE_ATTACHMENT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const INLINE_TEXT_ATTACHMENT_LIMIT = 120_000;
export const UPLOADED_INGEST_FILES_LIMIT = 20;

export type UploadedIngestFile = {
  filename: string;
  originalName?: string;
  size: number;
  totalChars?: number;
  chapterCount?: number;
  uploadedAt: number;
};

export type PreparedIngestAttachment = {
  attachment: ChatAttachment;
  original: ChatAttachment;
  upload?: UploadResult;
  error?: string;
};

export type ReingestConfirmation = {
  stage: "choose_overwrite" | "confirm_clear";
  filename: string;
  project: string;
};

export type AttachmentBlob = {
  blob: Blob;
  filename: string;
};

type IngestAutomationResult = {
  filename: string;
  taskType?: string;
  taskKey?: string;
  message?: string;
  rebuild?: boolean;
};

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

function extensionOf(filename?: string): string {
  const name = filename?.trim().toLowerCase() ?? "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function isInlineTextAttachment(attachment: ChatAttachment): boolean {
  return INLINE_TEXT_ATTACHMENT_EXTENSIONS.has(extensionOf(attachment.fileName));
}

function dataUrlToText(attachment: ChatAttachment): string | null {
  const content = attachment.content;
  if (!content?.startsWith("data:")) return null;
  const comma = content.indexOf(",");
  if (comma < 0) return null;
  const meta = content.slice(0, comma);
  const payload = content.slice(comma + 1);
  try {
    if (!/;base64/i.test(meta)) {
      return decodeURIComponent(payload);
    }
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

export function hasVideoCreationIntent(text: string): boolean {
  return VIDEO_CREATION_RE.test(text);
}

export function shouldReportUploadedFiles(text: string): boolean {
  return UPLOADED_FILES_QUERY_RE.test(text);
}

export function isNovelAttachment(attachment: ChatAttachment): boolean {
  return NOVEL_ATTACHMENT_EXTENSIONS.has(extensionOf(attachment.fileName));
}

export function isAllowedScriptUpload(file: File): boolean {
  return NOVEL_ATTACHMENT_EXTENSIONS.has(extensionOf(file.name));
}

export function isAllowedScriptDragItem(item: {
  name?: string;
  type?: string;
}): boolean {
  const extension = extensionOf(item.name);
  if (extension) return NOVEL_ATTACHMENT_EXTENSIONS.has(extension);
  const type = item.type?.trim().toLowerCase() ?? "";
  if (!type) return true;
  return NOVEL_ATTACHMENT_MIME_TYPES.has(type);
}

export function isAllowedChatUpload(file: File): boolean {
  const extension = extensionOf(file.name);
  return NOVEL_ATTACHMENT_EXTENSIONS.has(extension)
    || CHAT_IMAGE_ATTACHMENT_EXTENSIONS.has(extension);
}

export function isAllowedChatDragItem(item: {
  name?: string;
  type?: string;
}): boolean {
  const extension = extensionOf(item.name);
  if (extension) {
    return NOVEL_ATTACHMENT_EXTENSIONS.has(extension)
      || CHAT_IMAGE_ATTACHMENT_EXTENSIONS.has(extension);
  }
  const type = item.type?.trim().toLowerCase() ?? "";
  if (!type) return true;
  return NOVEL_ATTACHMENT_MIME_TYPES.has(type)
    || CHAT_IMAGE_ATTACHMENT_MIME_TYPES.has(type);
}

export function isOverwriteChoice(text: string): boolean {
  return /^覆盖[。.!！?？\s]*$/.test(text.trim());
}

export function isFinalOverwriteConfirmation(text: string): boolean {
  return /^(确定|继续)[。.!！?？\s]*$/.test(text.trim());
}

export function dataUrlToAttachmentBlob(
  attachment: ChatAttachment,
): AttachmentBlob | null {
  const content = attachment.content;
  if (!content?.startsWith("data:")) return null;
  const comma = content.indexOf(",");
  if (comma < 0) return null;
  const meta = content.slice(0, comma);
  const base64 = content.slice(comma + 1);
  const mime =
    attachment.mimeType ||
    /data:([^;]+)/.exec(meta)?.[1] ||
    "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return {
    blob: new Blob([bytes], { type: mime }),
    filename: attachment.fileName || "novel.txt",
  };
}

export function buildUploadedFilesContext(
  project: string | undefined,
  files: UploadedIngestFile[],
): string {
  const lines = [
    "[AI_ANIME_UPLOADED_FILES]",
    "If the user asks what files are currently uploaded, answer directly from this list. These files have already been uploaded to the current AI anime project ingest directory.",
    project ? `ai_anime_project_id: ${project}` : null,
  ].filter((line): line is string => line !== null);

  if (files.length === 0) {
    lines.push("no_uploaded_files: true");
  } else {
    files.forEach((file, index) => {
      lines.push("");
      lines.push(`file_${index + 1}_filename: ${file.filename}`);
      if (file.originalName && file.originalName !== file.filename) {
        lines.push(`file_${index + 1}_original_name: ${file.originalName}`);
      }
      lines.push(`file_${index + 1}_size_bytes: ${file.size}`);
      if (typeof file.totalChars === "number") {
        lines.push(`file_${index + 1}_total_chars: ${file.totalChars}`);
      }
      if (typeof file.chapterCount === "number") {
        lines.push(`file_${index + 1}_chapter_count: ${file.chapterCount}`);
      }
    });
  }

  lines.push("[/AI_ANIME_UPLOADED_FILES]");
  return lines.join("\n");
}

export function buildReingestConfirmationContext(
  pending: ReingestConfirmation,
): string {
  return [
    "[AI_ANIME_REINGEST_CONFIRMATION]",
    `stage: ${pending.stage}`,
    `ai_anime_project_id: ${pending.project}`,
    `filename: ${pending.filename}`,
    pending.stage === "choose_overwrite"
      ? "The current project has already ingested a script. Do not call ingest/start yet. Tell the user the current project is not empty and ask only whether they want to overwrite this project. Do not recommend creating a new project, and do not offer to create another project from the current project flow."
      : "The user chose overwrite. Do not call ingest/start yet. Ask the second confirmation and warn that overwrite/rebuild will clear existing characters, episodes, scripts, sketches, audio, videos, and other pipeline outputs. Only an exact user reply of 确定 or 继续 may proceed.",
    "[/AI_ANIME_REINGEST_CONFIRMATION]",
  ].join("\n");
}

export function buildReingestCancelledContext(
  pending: ReingestConfirmation,
): string {
  return [
    "[AI_ANIME_REINGEST_CANCELLED]",
    `stage: ${pending.stage}`,
    `ai_anime_project_id: ${pending.project}`,
    `filename: ${pending.filename}`,
    "The overwrite/re-ingest flow was cancelled or not explicitly confirmed. Do not call any write API. Briefly tell the user no overwrite was performed.",
    "[/AI_ANIME_REINGEST_CANCELLED]",
  ].join("\n");
}

export function buildAttachmentAnalysisContext(
  project: string | undefined,
  preparedAttachments: PreparedIngestAttachment[],
): string {
  const lines = [
    "[AI_ANIME_ATTACHMENT_CONTEXT]",
    "The user attached file(s). No explicit video-generation instruction was detected, so do not start the AI anime/AI anime video pipeline unless the user asks for it later. Analyze the attached text when available, and ask a focused follow-up if the intent is ambiguous.",
  ];

  for (const prepared of preparedAttachments) {
    const attachment = prepared.attachment;
    const originalAttachment = prepared.original;
    const filename = attachment.fileName || "attachment";
    const ext = extensionOf(filename);
    lines.push("");
    lines.push(`file: ${filename}`);
    lines.push(`mime_type: ${attachment.mimeType || "application/octet-stream"}`);
    if (typeof attachment.fileSize === "number") {
      lines.push(`size_bytes: ${attachment.fileSize}`);
    }

    if (project && isNovelAttachment(originalAttachment)) {
      if (prepared.upload) {
        lines.push(`ai_anime_upload_filename: ${prepared.upload.filename}`);
        lines.push(`ai_anime_project_id: ${project}`);
        lines.push("ai_anime_upload_target: ai_anime_ingest");
        if (typeof prepared.upload.total_chars === "number") {
          lines.push(`ai_anime_total_chars: ${prepared.upload.total_chars}`);
        }
        if (typeof prepared.upload.count === "number") {
          lines.push(`ai_anime_chapter_count: ${prepared.upload.count}`);
        }
      } else if (prepared.error) {
        lines.push(`ai_anime_upload_error: ${prepared.error}`);
      }
    }

    if (isInlineTextAttachment(originalAttachment)) {
      const text = dataUrlToText(originalAttachment);
      if (text) {
        const truncated = text.length > INLINE_TEXT_ATTACHMENT_LIMIT;
        lines.push(`text_content${truncated ? "_truncated" : ""}:`);
        lines.push("```text");
        lines.push(text.slice(0, INLINE_TEXT_ATTACHMENT_LIMIT));
        lines.push("```");
        if (truncated) {
          lines.push(`truncated_after_chars: ${INLINE_TEXT_ATTACHMENT_LIMIT}`);
        }
      } else if (ext) {
        lines.push(
          `text_decode_error: unable to decode ${ext} attachment in the browser`,
        );
      }
    } else if (isNovelAttachment(attachment)) {
      lines.push(
        "text_content_unavailable: this attachment type cannot be decoded in the browser without starting the video ingest flow",
      );
    }
  }

  lines.push("[/AI_ANIME_ATTACHMENT_CONTEXT]");
  return lines.join("\n");
}

export function appendIngestAutomationContext(
  text: string,
  result: IngestAutomationResult,
): string {
  return [
    text,
    "",
    "[AI_ANIME_INGEST_AUTOMATION]",
    `novel_filename: ${result.filename}`,
    result.rebuild ? "rebuild: true" : "rebuild: false",
    result.taskType ? `task_type: ${result.taskType}` : null,
    result.taskKey ? `task_key: ${result.taskKey}` : null,
    result.message ? `message: ${result.message}` : null,
    "The uploaded novel has already been submitted to the project ingest API. Continue the AI anime/AI anime video creation workflow from this task instead of asking the user to upload a novel again.",
    "[/AI_ANIME_INGEST_AUTOMATION]",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function appendAttachmentAnalysisContext(
  text: string,
  context: string,
): string {
  return [text, "", context].join("\n");
}
