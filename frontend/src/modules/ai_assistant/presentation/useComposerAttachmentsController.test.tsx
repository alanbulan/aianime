// Copyright (c) 2026 AI anime
import type { DragEvent as ReactDragEvent } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useComposerAttachmentsController } from "@/modules/ai_assistant/public";

class FileReaderMock {
  static instances: FileReaderMock[] = [];
  static deferLoad = false;

  result: string | null = null;
  aborted = false;
  private onLoad: (() => void) | null = null;

  constructor() {
    FileReaderMock.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === "load") this.onLoad = listener;
  }

  readAsDataURL(file: File): void {
    this.result = `data:${file.name}`;
    if (!FileReaderMock.deferLoad) this.onLoad?.();
  }

  abort(): void {
    this.aborted = true;
  }
}

function fileList(files: File[]): FileList {
  return files as unknown as FileList;
}

function dragEvent({
  files = [],
  items = [],
  types = ["Files"],
}: {
  files?: File[];
  items?: Array<{
    kind: string;
    type: string;
    getAsFile: () => File | null;
  }>;
  types?: string[];
} = {}) {
  return {
    dataTransfer: {
      dropEffect: "move",
      files: fileList(files),
      items,
      types,
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as ReactDragEvent<HTMLDivElement>;
}

describe("SuperChat Composer attachments controller", () => {
  beforeEach(() => {
    vi.stubGlobal("FileReader", FileReaderMock);
    FileReaderMock.instances = [];
    FileReaderMock.deferLoad = false;
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads allowed files into attachments and supports remove and clear", () => {
    const { result } = renderHook(() =>
      useComposerAttachmentsController(true),
    );
    const allowed = new File(["story"], "story.txt", { type: "text/plain" });
    const image = new File(["image"], "cover.png", { type: "image/png" });
    const rejected = new File(["pdf"], "brief.pdf", { type: "application/pdf" });

    act(() => result.current.addFiles(fileList([allowed, image, rejected])));

    expect(result.current.attachments).toEqual([
      {
        id: "att-1000-i",
        type: "file",
        mimeType: "text/plain",
        fileName: "story.txt",
        fileSize: 5,
        content: "data:story.txt",
      },
      {
        id: "att-1000-i",
        type: "image",
        mimeType: "image/png",
        fileName: "cover.png",
        fileSize: 5,
        content: "data:cover.png",
      },
    ]);
    act(() => result.current.removeAttachment(result.current.attachments[0].id));
    expect(result.current.attachments).toEqual([]);

    act(() => result.current.addFiles(fileList([allowed])));
    act(() => result.current.clearAttachments());
    expect(result.current.attachments).toEqual([]);
  });

  it("does not consume drag events while file upload is disabled", () => {
    const { result } = renderHook(() =>
      useComposerAttachmentsController(false),
    );
    const event = dragEvent();

    act(() => result.current.handleComposerDragEnter(event));
    const handled = result.current.handleComposerDrop(event);

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(result.current.dragFileState).toBeNull();
  });

  it("aborts pending file reads when the controller unmounts", () => {
    FileReaderMock.deferLoad = true;
    const { result, unmount } = renderHook(() =>
      useComposerAttachmentsController(true),
    );
    const file = new File(["story"], "story.txt", { type: "text/plain" });

    act(() => result.current.addFiles(fileList([file])));
    expect(FileReaderMock.instances).toHaveLength(1);

    unmount();

    expect(FileReaderMock.instances[0].aborted).toBe(true);
  });

  it("tracks nested drag depth, validity, drop effect, and accepted drops", () => {
    const { result } = renderHook(() =>
      useComposerAttachmentsController(true),
    );
    const file = new File(["story"], "story.txt", { type: "text/plain" });
    const validItem = {
      kind: "file",
      type: "text/plain",
      getAsFile: () => file,
    };
    const validEvent = dragEvent({ files: [file], items: [validItem] });

    act(() => {
      result.current.handleComposerDragEnter(validEvent);
      result.current.handleComposerDragEnter(validEvent);
    });
    expect(result.current.dragFileState).toBe("valid");
    act(() => result.current.handleComposerDragLeave(validEvent));
    expect(result.current.dragFileState).toBe("valid");
    act(() => result.current.handleComposerDragLeave(validEvent));
    expect(result.current.dragFileState).toBeNull();

    const invalidEvent = dragEvent({
      items: [{
        kind: "file",
        type: "application/pdf",
        getAsFile: () => null,
      }],
    });
    act(() => result.current.handleComposerDragOver(invalidEvent));
    expect(result.current.dragFileState).toBe("invalid");
    expect(invalidEvent.dataTransfer.dropEffect).toBe("none");

    let handled = false;
    act(() => {
      handled = result.current.handleComposerDrop(validEvent);
    });
    expect(handled).toBe(true);
    expect(result.current.dragFileState).toBeNull();
    expect(result.current.attachments).toHaveLength(1);
    expect(validEvent.preventDefault).toHaveBeenCalled();
    expect(validEvent.stopPropagation).toHaveBeenCalled();
  });
});
