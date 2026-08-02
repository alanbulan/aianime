// Copyright (c) 2026 AI anime
import type { TFunction } from "i18next";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatAttachment } from "@/modules/ai_assistant/domain/contracts";
import {
  useIngestAutomationControllerWithPorts,
  type IngestAutomationPorts,
} from "@/modules/ai_assistant/application/useIngestAutomationController";

const {
  backendErrorToastMessage,
  loadUploadedIngestFiles,
  projectHasIngestedContent,
  saveUploadedIngestFiles,
  startNovelIngest,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarning,
  uploadNovelForIngest,
} = vi.hoisted(() => ({
  backendErrorToastMessage: vi.fn(() => "mapped error"),
  loadUploadedIngestFiles: vi.fn(),
  projectHasIngestedContent: vi.fn(),
  saveUploadedIngestFiles: vi.fn(),
  startNovelIngest: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  uploadNovelForIngest: vi.fn(),
}));

vi.mock("@/shared/api/errors", () => ({ backendErrorToastMessage }));
vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    info: toastInfo,
    success: toastSuccess,
    warning: toastWarning,
  },
}));

const t = ((key: string, options?: Record<string, unknown>) => {
  const detail = options?.filename ?? options?.message;
  return detail ? `${key}:${String(detail)}` : key;
}) as TFunction;

const ports: IngestAutomationPorts = {
  loadUploadedIngestFiles,
  projectHasIngestedContent,
  saveUploadedIngestFiles,
  startNovelIngest,
  uploadNovelForIngest,
};

const novelAttachment = {
  fileName: "story.txt",
  fileSize: 5,
  mimeType: "text/plain",
  content: "data:text/plain;base64,aGVsbG8=",
};

function createSendChatMessage() {
  return vi.fn(
    (
      _text: string,
      _attachments: ChatAttachment[],
      _transportText?: string,
    ) => true,
  );
}

describe("SuperChat ingest automation controller", () => {
  beforeEach(() => {
    backendErrorToastMessage.mockClear();
    loadUploadedIngestFiles.mockReset();
    loadUploadedIngestFiles.mockReturnValue([]);
    projectHasIngestedContent.mockReset();
    saveUploadedIngestFiles.mockReset();
    startNovelIngest.mockReset();
    toastError.mockReset();
    toastInfo.mockReset();
    toastSuccess.mockReset();
    toastWarning.mockReset();
    uploadNovelForIngest.mockReset();
  });

  it("starts ingest for a novel attachment and exposes format warning details", async () => {
    const formatCheck = { level: "warning" as const, summary: "格式有风险" };
    uploadNovelForIngest.mockResolvedValue({
      filename: "stored.txt",
      size: 5,
      total_chars: 5,
      count: 1,
      format_check: formatCheck,
    });
    projectHasIngestedContent.mockResolvedValue(false);
    startNovelIngest.mockResolvedValue({
      taskType: "story_ingest",
      taskKey: "task-1",
      message: "started",
    });
    const sendChatMessage = createSendChatMessage();
    const { result } = renderHook(() =>
      useIngestAutomationControllerWithPorts({
        project: "project-a",
        ports,
        sendChatMessage,
        t,
      }),
    );

    let sent = false;
    await act(async () => {
      sent = await result.current.sendWithIngestAutomation(
        "根据剧本生成视频",
        [novelAttachment],
      );
    });

    expect(sent).toBe(true);
    expect(uploadNovelForIngest).toHaveBeenCalledWith(
      "project-a",
      expect.objectContaining({ filename: "story.txt" }),
    );
    expect(projectHasIngestedContent).toHaveBeenCalledWith("project-a");
    expect(startNovelIngest).toHaveBeenCalledWith("project-a", "stored.txt");
    expect(sendChatMessage).toHaveBeenCalledWith(
      "根据剧本生成视频",
      [
        {
          fileName: "stored.txt",
          fileSize: 5,
          mimeType: "text/plain",
        },
      ],
      expect.stringContaining("[AI_ANIME_INGEST_AUTOMATION]"),
    );
    expect(toastSuccess).toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalledWith(
      "格式有风险",
      expect.objectContaining({ action: expect.any(Object) }),
    );

    const warningOptions = toastWarning.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    act(() => warningOptions.action.onClick());
    expect(result.current.formatCheckDetails).toEqual({
      formatCheck,
      filename: "stored.txt",
    });
    act(() => result.current.clearFormatCheckDetails());
    expect(result.current.formatCheckDetails).toBeNull();
    expect(result.current.preparingSend).toBe(false);
  });

  it("requires both overwrite confirmations before starting a rebuild", async () => {
    uploadNovelForIngest.mockResolvedValue({ filename: "stored.txt", size: 5 });
    projectHasIngestedContent.mockResolvedValue(true);
    startNovelIngest.mockResolvedValue({
      taskType: "story_ingest",
      taskKey: "task-rebuild",
      message: "rebuilding",
    });
    const sendChatMessage = createSendChatMessage();
    const { result } = renderHook(() =>
      useIngestAutomationControllerWithPorts({
        project: "project-a",
        ports,
        sendChatMessage,
        t,
      }),
    );

    await act(async () => {
      await result.current.sendWithIngestAutomation("生成视频", [novelAttachment]);
    });
    expect(startNovelIngest).not.toHaveBeenCalled();
    expect(sendChatMessage.mock.calls[0]?.[2]).toContain("stage: choose_overwrite");

    await act(async () => {
      await result.current.sendWithIngestAutomation("覆盖", []);
    });
    expect(startNovelIngest).not.toHaveBeenCalled();
    expect(sendChatMessage.mock.calls[1]?.[2]).toContain("stage: confirm_clear");

    await act(async () => {
      await result.current.sendWithIngestAutomation("确定", []);
    });
    expect(startNovelIngest).toHaveBeenCalledWith(
      "project-a",
      "stored.txt",
      { rebuild: true },
    );
    expect(sendChatMessage.mock.calls[2]?.[2]).toContain("rebuild: true");
  });

  it("blocks video ingest without a project", async () => {
    const sendChatMessage = createSendChatMessage();
    const { result } = renderHook(() =>
      useIngestAutomationControllerWithPorts({
        ports,
        sendChatMessage,
        t,
      }),
    );

    let sent = true;
    await act(async () => {
      sent = await result.current.sendWithIngestAutomation("生成视频", [
        novelAttachment,
      ]);
    });

    expect(sent).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      "aiAssistant.ingestAutomationNoProject",
    );
    expect(uploadNovelForIngest).not.toHaveBeenCalled();
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("adds persisted upload history when the user asks for uploaded files", async () => {
    loadUploadedIngestFiles.mockReturnValue([
      {
        filename: "stored.txt",
        originalName: "story.txt",
        size: 5,
        uploadedAt: 1,
      },
    ]);
    const sendChatMessage = createSendChatMessage();
    const { result } = renderHook(() =>
      useIngestAutomationControllerWithPorts({
        project: "project-a",
        ports,
        sendChatMessage,
        t,
      }),
    );

    await act(async () => {
      await result.current.sendWithIngestAutomation("我上传了哪些文件？", []);
    });

    expect(sendChatMessage).toHaveBeenCalledWith(
      "我上传了哪些文件？",
      [],
      expect.stringContaining("file_1_filename: stored.txt"),
    );
  });

  it("maps infrastructure failures and always resets the preparing state", async () => {
    uploadNovelForIngest.mockResolvedValue({ filename: "stored.txt", size: 5 });
    projectHasIngestedContent.mockRejectedValue(new Error("offline"));
    const sendChatMessage = createSendChatMessage();
    const { result } = renderHook(() =>
      useIngestAutomationControllerWithPorts({
        project: "project-a",
        ports,
        sendChatMessage,
        t,
      }),
    );

    let sent = true;
    await act(async () => {
      sent = await result.current.sendWithIngestAutomation("生成视频", [
        novelAttachment,
      ]);
    });

    expect(sent).toBe(false);
    expect(backendErrorToastMessage).toHaveBeenCalledWith(expect.any(Error), t);
    expect(toastError).toHaveBeenCalledWith(
      "aiAssistant.ingestAutomationFailed:mapped error",
    );
    expect(result.current.preparingSend).toBe(false);
    expect(sendChatMessage).not.toHaveBeenCalled();
  });
});
