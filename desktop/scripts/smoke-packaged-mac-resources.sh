#!/usr/bin/env bash
set -euo pipefail

expected_arch="${1:-x86_64}"
maximum_system_version="${2:-13.4.0}"
case "$expected_arch" in
arm64 | x86_64) ;;
*)
  echo "Unsupported expected architecture: ${expected_arch}" >&2
  exit 1
  ;;
esac

desktop_root="$(cd "$(dirname "$0")/.." && pwd)"
release_root="${desktop_root}/release"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/ai-anime-macos-smoke.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

app_path=""
while IFS= read -r candidate; do
  main_executable="${candidate}/Contents/MacOS/AI anime"
  if [[ ! -f "$main_executable" ]]; then
    continue
  fi
  candidate_archs="$(lipo -archs "$main_executable")"
  case " ${candidate_archs} " in
  *" ${expected_arch} "*)
    app_path="$candidate"
    break
    ;;
  esac
done < <(find "$release_root" -type d -name "AI anime.app" -print)

if [[ -z "$app_path" ]]; then
  echo "Packaged AI anime.app for ${expected_arch} was not found under ${release_root}" >&2
  exit 1
fi

info_plist="${app_path}/Contents/Info.plist"
plutil -lint "$info_plist" >/dev/null
declared_minimum="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$info_plist")"
if [[ "$declared_minimum" != "$maximum_system_version" ]]; then
  echo "Unexpected LSMinimumSystemVersion: ${declared_minimum} (expected ${maximum_system_version})" >&2
  exit 1
fi

bash "${desktop_root}/scripts/check-macos-binaries.sh" "${app_path}/Contents" "$expected_arch" "$maximum_system_version"

resources="${app_path}/Contents/Resources"
test -f "${resources}/frontend/index.html"
ELECTRON_RUN_AS_NODE=1 "$main_executable" - "${resources}/app.asar" <<'NODE'
const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { createRequire } = require("node:module");
const { join } = require("node:path");
const archive = process.argv[2];
const manifestPath = join(archive, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.ok(process.versions.electron, "Packaged Electron runtime did not start");
assert.ok(existsSync(join(archive, manifest.main)), "Packaged main entry is missing");
const appRequire = createRequire(manifestPath);
assert.equal(typeof appRequire("electron-updater").MacUpdater, "function");
if (process.arch === "x64") {
  assert.deepEqual(readdirSync(archive).sort(), ["dist", "node_modules", "package.json"],
    "Intel ASAR must contain only the application and its production dependencies");
  for (const moduleName of ["@playcanvas/splat-transform", "webgpu"]) {
    assert.equal(existsSync(join(archive, "node_modules", moduleName)), false,
      `Optional 3D module must not be bundled in the Intel main app: ${moduleName}`);
  }
}
console.log(`Packaged Electron/ASAR/updater smoke passed: ${process.versions.electron}`);
NODE

backend="${resources}/backend/ai-anime-backend"
ffmpeg="${resources}/bin/ffmpeg"
ffprobe="${resources}/bin/ffprobe"
hermes="${resources}/hermes/hermes-acp/hermes-acp"
for required_path in "$backend" "$ffmpeg" "$ffprobe" "$hermes"; do
  if [[ ! -x "$required_path" ]]; then
    echo "Required packaged executable is missing: ${required_path}" >&2
    exit 1
  fi
done

# Cognee reads these paths during import. Smoke data must not be written into
# the signed application bundle, even when no project has been opened yet.
backend_output="$(PYTHONIOENCODING=utf-8 PYTHONUTF8=1 \
  SYSTEM_ROOT_DIRECTORY="${temporary_root}/cognee/system" \
  DATA_ROOT_DIRECTORY="${temporary_root}/cognee/data" \
  CACHE_ROOT_DIRECTORY="${temporary_root}/cognee/cache" \
  "$backend" --runtime-smoke-check)"
if ! grep -q '^AI_ANIME_BACKEND_SMOKE ' <<<"$backend_output"; then
  echo "Packaged backend runtime smoke marker is missing" >&2
  exit 1
fi

"$ffprobe" -hide_banner -version >/dev/null
filters="$("$ffmpeg" -hide_banner -filters 2>/dev/null || true)"
for required_filter in drawtext subtitles; do
  if ! grep -Eq "[[:space:]]${required_filter}[[:space:]]" <<<"$filters"; then
    echo "Packaged FFmpeg is missing ${required_filter}" >&2
    exit 1
  fi
done
subtitle_path="${temporary_root}/subtitle.srt"
printf '1\n00:00:00,000 --> 00:00:00,500\nIntel 中文\n' >"$subtitle_path"
video_path="${temporary_root}/encoded.mp4"
# Use the application's hardware-preferred, software-allowed H.264 settings.
# A real MP4 round trip verifies encoding, subtitle rendering, muxing and decoding.
"$ffmpeg" -v error -f lavfi -i color=size=640x360:rate=25:duration=0.12 \
  -vf "subtitles=${subtitle_path}" -pix_fmt yuv420p \
  -c:v h264_videotoolbox -allow_sw 1 -b:v 4M -frames:v 3 "$video_path"
video_info="$("$ffprobe" -v error -select_streams v:0 -count_frames \
  -show_entries stream=codec_name,width,height,nb_read_frames -of default=noprint_wrappers=1 "$video_path")"
for expected_field in codec_name=h264 width=640 height=360 nb_read_frames=3; do
  if ! grep -qx "$expected_field" <<<"$video_info"; then
    echo "Packaged FFmpeg MP4 verification failed: expected ${expected_field}, got ${video_info}" >&2
    exit 1
  fi
done
"$ffmpeg" -v error -xerror -i "$video_path" -f null -
echo "Packaged FFmpeg H.264/subtitles/MP4/decode smoke passed."
"$hermes" --help >/dev/null

codesign --verify --deep --strict "$app_path"

artifact_arch="$expected_arch"
if [[ "$artifact_arch" == "x86_64" ]]; then
  artifact_arch="x64"
fi
for extension in dmg zip; do
  artifact_path="$(find "$release_root" -type f -name "AI-anime-*-macos-${artifact_arch}.${extension}" -print -quit)"
  if [[ -z "$artifact_path" ]]; then
    echo "Packaged ${extension} artifact for ${artifact_arch} is missing" >&2
    exit 1
  fi
done

echo "Packaged macOS resources passed: ${expected_arch}, minimum macOS ${maximum_system_version}."
