import assert from "node:assert/strict";
import test from "node:test";

import {
  bundledBackendPath,
  bundledWorldRuntimePath,
  bundledFfmpegPath,
  bundledWhisperModelPath,
  bundledSplatTransformCliPath,
  bundledSplatTransformNodePath,
  developmentSplatTransformCliPath,
  developmentSplatTransformNodePath,
  developmentFfmpegPath,
  developmentWhisperModelPath,
  executableName,
  installedWorldRuntimePaths,
  packagedVideoCodec,
} from "../src/platform-runtime.ts";

test("packaged runtime paths use platform-native executable names", () => {
  assert.equal(executableName("ffmpeg", "win32"), "ffmpeg.exe");
  assert.equal(executableName("ffmpeg", "darwin"), "ffmpeg");
  assert.equal(
    bundledBackendPath("C:\\resources", "win32"),
    "C:\\resources\\backend\\ai-anime-backend.exe",
  );
  assert.equal(
    bundledWorldRuntimePath("C:\\resources", "win32"),
    "C:\\resources\\world-runtime\\ai-anime-world-runtime.exe",
  );
  assert.equal(
    bundledSplatTransformCliPath("C:\\resources", "win32"),
    "C:\\resources\\splat-transform\\node_modules\\@playcanvas\\splat-transform\\bin\\cli.mjs",
  );
  assert.equal(
    bundledSplatTransformNodePath("C:\\resources", "win32"),
    "C:\\resources\\splat-transform\\node.exe",
  );
  assert.equal(
    developmentSplatTransformCliPath("/repo/desktop", "darwin"),
    "/repo/desktop/node_modules/@playcanvas/splat-transform/bin/cli.mjs",
  );
  assert.equal(
    developmentSplatTransformNodePath("/repo/desktop", "darwin"),
    "/repo/desktop/runtime/splat-transform/node",
  );
  assert.equal(
    bundledBackendPath("/Applications/AI anime.app/Contents/Resources", "darwin"),
    "/Applications/AI anime.app/Contents/Resources/backend/ai-anime-backend",
  );
  assert.equal(
    bundledWorldRuntimePath("/Applications/AI anime.app/Contents/Resources", "darwin"),
    "/Applications/AI anime.app/Contents/Resources/world-runtime/ai-anime-world-runtime",
  );
  assert.equal(
    bundledFfmpegPath("C:\\resources", "win32"),
    "C:\\resources\\bin\\ffmpeg.exe",
  );
  assert.equal(
    developmentFfmpegPath("/repo/desktop", "darwin"),
    "/repo/desktop/runtime/ffmpeg/ffmpeg",
  );
  assert.equal(
    bundledWhisperModelPath("C:\\resources", "win32"),
    "C:\\resources\\whisper\\faster-whisper-base",
  );
  assert.equal(
    developmentWhisperModelPath("/repo/desktop", "darwin"),
    "/repo/desktop/runtime/whisper/faster-whisper-base",
  );
});

test("packaged video codecs match the LGPL runtime on each desktop platform", () => {
  assert.equal(packagedVideoCodec("win32"), "libopenh264");
  assert.equal(packagedVideoCodec("darwin"), "h264_videotoolbox");
  assert.equal(packagedVideoCodec("linux"), "libx264");
});

test("optional world runtime paths live under desktop user data", () => {
  assert.deepEqual(installedWorldRuntimePaths("C:\\UserData", "win32"), {
    root: "C:\\UserData\\dependencies\\world\\current",
    worldRuntimePath:
      "C:\\UserData\\dependencies\\world\\current\\world-runtime\\ai-anime-world-runtime.exe",
    splatTransformCliPath:
      "C:\\UserData\\dependencies\\world\\current\\splat-transform\\node_modules\\@playcanvas\\splat-transform\\bin\\cli.mjs",
    splatTransformNodePath:
      "C:\\UserData\\dependencies\\world\\current\\splat-transform\\node.exe",
  });
  assert.equal(
    installedWorldRuntimePaths("/Users/demo/Library/Application Support/AI anime", "darwin")
      .worldRuntimePath,
    "/Users/demo/Library/Application Support/AI anime/dependencies/world/current/world-runtime/ai-anime-world-runtime",
  );
});
