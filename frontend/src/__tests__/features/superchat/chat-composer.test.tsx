// Copyright (c) 2026 AI anime
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count == null ? key : `${key}:${options.count}`,
  }),
}));

import { ChatComposer } from "@/features/superchat/chat-composer";

type ComposerProps = Parameters<typeof ChatComposer>[0];

function props(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    attachments: [],
    busy: false,
    canSend: true,
    connected: true,
    draft: "",
    draftInputRef: createRef<HTMLTextAreaElement>(),
    dragFileState: null,
    fileInputRef: createRef<HTMLInputElement>(),
    fileUploadEnabled: false,
    isFreezoneLayout: false,
    queuedMessages: [],
    recording: false,
    selectedHistoryMessageIndex: null,
    selectedQueuedMessageId: null,
    shellRef: createRef<HTMLDivElement>(),
    showWaitingIndicator: false,
    onAbort: vi.fn(),
    onAddFiles: vi.fn(),
    onAttachmentRemove: vi.fn(),
    onDragEnter: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDraftChange: vi.fn(),
    onDraftFocusChange: vi.fn(),
    onDropFiles: vi.fn(() => false),
    onHistorySelect: vi.fn(() => false),
    onOpenFilePicker: vi.fn(),
    onQueueOffset: vi.fn(),
    onQueueRemove: vi.fn(),
    onQueueSelect: vi.fn(),
    onResetHistorySelection: vi.fn(),
    onSubmit: vi.fn(),
    onToggleSpeech: vi.fn(),
    ...overrides,
  };
}

describe("SuperChat Composer view", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders attachment presentation and forwards removal", () => {
    const onAttachmentRemove = vi.fn();
    render(<ChatComposer {...props({
      attachments: [{
        id: "attachment-1",
        fileName: "cover.png",
        mimeType: "image/png",
      }],
      onAttachmentRemove,
      showWaitingIndicator: true,
    })} />);

    expect(screen.getByText("cover.png")).toBeInTheDocument();
    expect(screen.getByText("aiAssistant.disclaimer")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.removeAttachment" }),
    );
    expect(onAttachmentRemove).toHaveBeenCalledWith("attachment-1");
  });

  it("routes queue and history arrows before handling Enter submission", () => {
    const queueProps = props({
      queuedMessages: [{ id: "queue-1", text: "排队", attachments: [] }],
    });
    const { rerender } = render(<ChatComposer {...queueProps} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    expect(queueProps.onQueueOffset).toHaveBeenCalledWith(-1);
    expect(queueProps.onHistorySelect).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter" });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(queueProps.onSubmit).toHaveBeenCalledTimes(1);

    const historyProps = props({ selectedHistoryMessageIndex: 0 });
    rerender(<ChatComposer {...historyProps} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowDown" });
    expect(historyProps.onHistorySelect).toHaveBeenNthCalledWith(1, "older");
    expect(historyProps.onHistorySelect).toHaveBeenNthCalledWith(2, "newer");
  });

  it("forwards file and drag actions and restores draft focus", () => {
    const focus = vi
      .spyOn(HTMLTextAreaElement.prototype, "focus")
      .mockImplementation(() => undefined);
    const onAddFiles = vi.fn();
    const onDropFiles = vi.fn(() => true);
    const dragEnter = vi.fn();
    const dragLeave = vi.fn();
    const dragOver = vi.fn();
    const composerProps = props({
      fileUploadEnabled: true,
      onAddFiles,
      onDragEnter: dragEnter,
      onDragLeave: dragLeave,
      onDragOver: dragOver,
      onDropFiles,
    });
    const { container } = render(<ChatComposer {...composerProps} />);
    const file = new File(["story"], "story.txt", { type: "text/plain" });
    const files = [file] as unknown as FileList;
    const input = container.querySelector('input[type="file"]');
    const shell = container.querySelector("[data-composer-shell]");
    if (!input || !shell) throw new Error("Composer file controls are missing");

    fireEvent.change(input, { target: { files } });
    fireEvent.dragEnter(shell);
    fireEvent.dragOver(shell);
    fireEvent.dragLeave(shell);
    fireEvent.drop(shell);

    expect(onAddFiles).toHaveBeenCalledWith(files);
    expect(dragEnter).toHaveBeenCalledTimes(1);
    expect(dragOver).toHaveBeenCalledTimes(1);
    expect(dragLeave).toHaveBeenCalledTimes(1);
    expect(onDropFiles).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it("forwards speech, send, abort, and focus-state actions", () => {
    const onDraftFocusChange = vi.fn();
    const idleProps = props({ onDraftFocusChange });
    const { rerender } = render(<ChatComposer {...idleProps} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.focus(textarea);
    fireEvent.blur(textarea);
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.voiceInput" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "aiAssistant.send" }));
    expect(onDraftFocusChange.mock.calls).toEqual([[true], [false]]);
    expect(idleProps.onToggleSpeech).toHaveBeenCalledTimes(1);
    expect(idleProps.onSubmit).toHaveBeenCalledTimes(1);

    const busyProps = props({ busy: true, recording: true });
    rerender(<ChatComposer {...busyProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.stopVoice" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "aiAssistant.stop" }));
    expect(busyProps.onToggleSpeech).toHaveBeenCalledTimes(1);
    expect(busyProps.onAbort).toHaveBeenCalledTimes(1);
  });
});
