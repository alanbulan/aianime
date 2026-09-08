import { beforeEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ files: new Map<string, Uint8Array>(), failNext: false }));
vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: class {
    async load() {}
    on() {}
    off() {}
    async writeFile(name: string, bytes: Uint8Array) { harness.files.set(name, bytes); }
    async exec(args: string[]) {
      if (harness.failNext) { harness.failNext = false; return 1; }
      harness.files.set(args[args.length - 1]!, harness.files.get(args[1])!.slice());
      return 0;
    }
    async readFile(name: string) { return harness.files.get(name); }
    async deleteFile(name: string) { harness.files.delete(name); }
  },
}));
vi.mock("@ffmpeg/util", () => ({
  fetchFile: async (file: File) => new Uint8Array(await file.arrayBuffer()),
}));
vi.mock("@ffmpeg/core?url", () => ({ default: "/core.js" }));
vi.mock("@ffmpeg/core/wasm?url", () => ({ default: "/core.wasm" }));

beforeEach(() => {
  vi.resetModules();
  harness.files.clear();
  harness.failNext = false;
});

it("keeps each concurrent conversion associated with its own input", async () => {
  const { transcodeWithFfmpeg } = await import("./videoTranscodeFfmpeg");
  const results = await Promise.all([
    transcodeWithFfmpeg(new File(["A"], "A.mov")),
    transcodeWithFfmpeg(new File(["B"], "B.mov")),
  ]);
  expect(await Promise.all(results.map((blob) => blob.text()))).toEqual(["A", "B"]);
  expect(harness.files.size).toBe(0);
});

it("cleans a failed conversion and continues the queued conversion", async () => {
  const { transcodeWithFfmpeg } = await import("./videoTranscodeFfmpeg");
  harness.failNext = true;
  const first = transcodeWithFfmpeg(new File(["A"], "A.mov"));
  const second = transcodeWithFfmpeg(new File(["B"], "B.mov"));
  await expect(first).rejects.toThrow("ffmpeg exited");
  expect(await (await second).text()).toBe("B");
  expect(harness.files.size).toBe(0);
});
