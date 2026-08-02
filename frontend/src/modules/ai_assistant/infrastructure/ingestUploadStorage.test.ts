// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadUploadedIngestFiles,
  saveUploadedIngestFiles,
} from "@/modules/ai_assistant/infrastructure/ingestUploadStorage";
import {
  mergeUploadedIngestFiles,
  uploadedIngestFileFromUpload,
  type UploadedIngestFile,
} from "@/modules/ai_assistant/domain/ingestAutomation";

const STORAGE_PREFIX = "superchat:ingest-uploads:";

function storedFile(filename: string, uploadedAt: number): UploadedIngestFile {
  return {
    filename,
    originalName: `${filename}.source`,
    size: uploadedAt,
    uploadedAt,
  };
}

describe("SuperChat ingest upload storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads only valid records and returns empty for missing or malformed data", () => {
    expect(loadUploadedIngestFiles()).toEqual([]);
    expect(loadUploadedIngestFiles("   ")).toEqual([]);

    localStorage.setItem(`${STORAGE_PREFIX}project-a`, "{not json");
    expect(loadUploadedIngestFiles("project-a")).toEqual([]);

    localStorage.setItem(
      `${STORAGE_PREFIX}project-a`,
      JSON.stringify([
        storedFile("valid.txt", 1),
        null,
        { filename: "missing-size.txt", uploadedAt: 2 },
        { filename: "wrong-time.txt", size: 10, uploadedAt: "2" },
      ]),
    );
    expect(loadUploadedIngestFiles(" project-a ")).toEqual([
      storedFile("valid.txt", 1),
    ]);

    localStorage.setItem(
      `${STORAGE_PREFIX}project-a`,
      JSON.stringify({ filename: "not-an-array.txt" }),
    );
    expect(loadUploadedIngestFiles("project-a")).toEqual([]);
  });

  it("persists only the newest twenty records for a trimmed project ID", () => {
    const files = Array.from({ length: 22 }, (_, index) =>
      storedFile(`story-${index}.txt`, index),
    );

    saveUploadedIngestFiles(" project-a ", files);

    expect(
      JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}project-a`) || "null"),
    ).toEqual(files.slice(-20));
  });

  it("does not write without a project and does not surface storage failures", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    saveUploadedIngestFiles(undefined, [storedFile("story.txt", 1)]);
    expect(setItem).not.toHaveBeenCalled();

    setItem.mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    expect(() =>
      saveUploadedIngestFiles("project-a", [storedFile("story.txt", 1)]),
    ).not.toThrow();
  });

  it("replaces matching filenames, sorts by upload time, and keeps twenty records", () => {
    const current = Array.from({ length: 20 }, (_, index) =>
      storedFile(`story-${index}.txt`, index + 1),
    );
    const replacement = storedFile("story-10.txt", 30);
    const addition = storedFile("new-story.txt", 25);

    const result = mergeUploadedIngestFiles(current, [replacement, addition]);

    expect(result).toHaveLength(20);
    expect(result[0]?.filename).toBe("story-1.txt");
    expect(result[result.length - 2]).toEqual(addition);
    expect(result[result.length - 1]).toEqual(replacement);
    expect(result.filter((file) => file.filename === "story-10.txt")).toEqual([
      replacement,
    ]);
  });

  it("returns the existing collection unchanged when there are no additions", () => {
    const current = [storedFile("story.txt", 1)];
    expect(mergeUploadedIngestFiles(current, [])).toBe(current);
  });

  it("maps the canonical upload result into a stored record", () => {
    expect(
      uploadedIngestFileFromUpload(
        {
          filename: "stored-story.txt",
          size: 2048,
          total_chars: 12000,
          count: 8,
        },
        "original-story.txt",
        123456,
      ),
    ).toEqual({
      filename: "stored-story.txt",
      originalName: "original-story.txt",
      size: 2048,
      totalChars: 12000,
      chapterCount: 8,
      uploadedAt: 123456,
    });
  });
});
