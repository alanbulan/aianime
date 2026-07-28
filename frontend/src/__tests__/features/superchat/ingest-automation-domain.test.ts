// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";
import {
  appendAttachmentAnalysisContext,
  appendIngestAutomationContext,
  buildAttachmentAnalysisContext,
  buildReingestCancelledContext,
  buildReingestConfirmationContext,
  buildUploadedFilesContext,
  dataUrlToAttachmentBlob,
  hasVideoCreationIntent,
  isAllowedScriptDragItem,
  isAllowedScriptUpload,
  isFinalOverwriteConfirmation,
  isNovelAttachment,
  isOverwriteChoice,
  shouldReportUploadedFiles,
} from "@/features/superchat/ingest-automation-domain";

describe("SuperChat ingest attachment rules", () => {
  it("recognizes supported script attachments and uploads by extension", () => {
    expect(isNovelAttachment({ fileName: " Story.DOCX " })).toBe(true);
    expect(isNovelAttachment({ fileName: "notes.md" })).toBe(true);
    expect(isNovelAttachment({ fileName: "poster.png" })).toBe(false);
    expect(isNovelAttachment({})).toBe(false);

    expect(isAllowedScriptUpload(new File(["story"], "story.TXT"))).toBe(true);
    expect(isAllowedScriptUpload(new File(["story"], "story.pdf"))).toBe(false);
  });

  it("uses the extension first and MIME type for extensionless drag items", () => {
    expect(isAllowedScriptDragItem({ name: "story.doc", type: "image/png" })).toBe(true);
    expect(isAllowedScriptDragItem({ name: "story.png", type: "text/plain" })).toBe(false);
    expect(isAllowedScriptDragItem({ type: " TEXT/MARKDOWN " })).toBe(true);
    expect(isAllowedScriptDragItem({ type: "image/png" })).toBe(false);
    expect(isAllowedScriptDragItem({})).toBe(true);
  });

  it("decodes a base64 data URL into an uploadable blob", () => {
    const result = dataUrlToAttachmentBlob({
      fileName: "story.txt",
      content: "data:text/plain;base64,aGVsbG8=",
    });

    expect(result?.filename).toBe("story.txt");
    expect(result?.blob.type).toBe("text/plain");
    expect(result?.blob.size).toBe(5);
    expect(dataUrlToAttachmentBlob({ content: "plain text" })).toBeNull();
    expect(dataUrlToAttachmentBlob({ content: "data:text/plain;base64" })).toBeNull();
  });
});

describe("SuperChat ingest intent and confirmation rules", () => {
  it("detects Chinese and English video creation intent", () => {
    expect(hasVideoCreationIntent("请根据这部小说生成短剧视频")).toBe(true);
    expect(hasVideoCreationIntent("Create a video from this story")).toBe(true);
    expect(hasVideoCreationIntent("只分析这部小说的人物关系")).toBe(false);
  });

  it("detects requests for the current uploaded file list", () => {
    expect(shouldReportUploadedFiles("我刚才上传了哪些文件？")).toBe(true);
    expect(shouldReportUploadedFiles("Please show uploaded files")).toBe(true);
    expect(shouldReportUploadedFiles("请分析这部剧本")).toBe(false);
  });

  it("requires the exact overwrite and final confirmation choices", () => {
    expect(isOverwriteChoice(" 覆盖！ ")).toBe(true);
    expect(isOverwriteChoice("请覆盖")).toBe(false);
    expect(isFinalOverwriteConfirmation("确定。 ")).toBe(true);
    expect(isFinalOverwriteConfirmation("继续!")).toBe(true);
    expect(isFinalOverwriteConfirmation("确定覆盖")).toBe(false);
  });
});

describe("SuperChat ingest contexts", () => {
  it("describes empty and populated uploaded-file collections", () => {
    expect(buildUploadedFilesContext(undefined, [])).toContain(
      "no_uploaded_files: true",
    );

    const context = buildUploadedFilesContext("project-a", [
      {
        filename: "stored.txt",
        originalName: "story.txt",
        size: 2048,
        totalChars: 12000,
        chapterCount: 8,
        uploadedAt: 1,
      },
    ]);
    expect(context).toContain("ai_anime_project_id: project-a");
    expect(context).toContain("file_1_filename: stored.txt");
    expect(context).toContain("file_1_original_name: story.txt");
    expect(context).toContain("file_1_size_bytes: 2048");
    expect(context).toContain("file_1_total_chars: 12000");
    expect(context).toContain("file_1_chapter_count: 8");
  });

  it("builds both re-ingest confirmation stages and cancellation context", () => {
    const pending = {
      stage: "choose_overwrite" as const,
      project: "project-a",
      filename: "story.txt",
    };
    const first = buildReingestConfirmationContext(pending);
    const second = buildReingestConfirmationContext({
      ...pending,
      stage: "confirm_clear",
    });
    const cancelled = buildReingestCancelledContext(pending);

    expect(first).toContain("stage: choose_overwrite");
    expect(first).toContain("ask only whether they want to overwrite");
    expect(second).toContain("stage: confirm_clear");
    expect(second).toContain("Only an exact user reply of 确定 or 继续");
    expect(cancelled).toContain("Do not call any write API");
  });

  it("includes decoded inline text and canonical upload metadata", () => {
    const context = buildAttachmentAnalysisContext("project-a", [
      {
        original: {
          fileName: "original.md",
          mimeType: "text/markdown",
          content: "data:text/markdown,hello%20world",
        },
        attachment: {
          fileName: "stored.md",
          mimeType: "text/markdown",
          fileSize: 11,
        },
        upload: {
          filename: "stored.md",
          size: 11,
          total_chars: 11,
          count: 1,
        },
      },
    ]);

    expect(context).toContain("file: stored.md");
    expect(context).toContain("size_bytes: 11");
    expect(context).toContain("ai_anime_upload_filename: stored.md");
    expect(context).toContain("ai_anime_total_chars: 11");
    expect(context).toContain("ai_anime_chapter_count: 1");
    expect(context).toContain("```text\nhello world\n```");
  });

  it("reports decode, upload, and browser-preview limitations", () => {
    const context = buildAttachmentAnalysisContext("project-a", [
      {
        original: { fileName: "broken.txt", content: "data:text/plain,%" },
        attachment: { fileName: "broken.txt" },
        error: "upload failed",
      },
      {
        original: { fileName: "story.docx" },
        attachment: { fileName: "story.docx" },
      },
    ]);

    expect(context).toContain("ai_anime_upload_error: upload failed");
    expect(context).toContain("text_decode_error: unable to decode .txt attachment");
    expect(context).toContain("text_content_unavailable:");
  });

  it("appends attachment and completed-ingest contexts to user text", () => {
    expect(appendAttachmentAnalysisContext("分析剧本", "[context]")).toBe(
      "分析剧本\n\n[context]",
    );

    const context = appendIngestAutomationContext("生成视频", {
      filename: "story.txt",
      taskType: "story_ingest",
      taskKey: "task-1",
      message: "started",
      rebuild: true,
    });
    expect(context).toContain("生成视频\n\n[AI_ANIME_INGEST_AUTOMATION]");
    expect(context).toContain("novel_filename: story.txt");
    expect(context).toContain("rebuild: true");
    expect(context).toContain("task_type: story_ingest");
    expect(context).toContain("task_key: task-1");
    expect(context).toContain("message: started");
  });
});
