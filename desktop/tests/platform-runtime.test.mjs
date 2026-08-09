import assert from "node:assert/strict";
import test from "node:test";

import {
  bundledBackendPath,
  bundledFfmpegPath,
  bundledWhisperModelPath,
  developmentFfmpegPath,
  developmentWhisperModelPath,
  executableName,
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
    bundledBackendPath("/Applications/AI anime.app/Contents/Resources", "darwin"),
    "/Applications/AI anime.app/Contents/Resources/backend/ai-anime-backend",
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
