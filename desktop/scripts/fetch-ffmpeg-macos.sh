#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "The bundled macOS FFmpeg runtime currently requires Apple Silicon (arm64)." >&2
  exit 1
fi

release_tag="8.1.2.1-20260801"
release_root="https://github.com/TaherHaghverdi/mediamill-ffmpeg/releases/download/${release_tag}"
ffmpeg_sha256="7fe7a549a79719d1bc61530dc747a20937733289bf553d8569703fa7a51c2fe1"
ffprobe_sha256="d9c440eab4e8fdb919bad546bdd4f1d5c83a4ce919cd7d5421478871648ea368"

desktop_root="$(cd "$(dirname "$0")/.." && pwd)"
cache_dir="${desktop_root}/.ffmpeg-cache/macos-arm64-${release_tag}"
runtime_dir="${desktop_root}/runtime/ffmpeg"
mkdir -p "$cache_dir" "$runtime_dir"

download_and_verify() {
  local name="$1"
  local expected_sha256="$2"
  local archive_path="${cache_dir}/${name}.zip"
  if [[ ! -f "$archive_path" ]] || [[ "$(shasum -a 256 "$archive_path" | awk '{print $1}')" != "$expected_sha256" ]]; then
    curl -fL --retry 3 --retry-delay 2 \
      -A "AI-anime-Desktop-Build" \
      -o "$archive_path" \
      "${release_root}/${name}.zip"
  fi
  if [[ "$(shasum -a 256 "$archive_path" | awk '{print $1}')" != "$expected_sha256" ]]; then
    echo "FFmpeg archive checksum verification failed: ${archive_path}" >&2
    exit 1
  fi
  local extract_dir
  extract_dir="$(mktemp -d "${cache_dir}/${name}.XXXXXX")"
  ditto -x -k "$archive_path" "$extract_dir"
  local binary_path
  binary_path="$(find "$extract_dir" -type f -name "$name" -print -quit)"
  if [[ -z "$binary_path" ]]; then
    echo "Required binary not found in ${archive_path}: ${name}" >&2
    exit 1
  fi
  install -m 0755 "$binary_path" "${runtime_dir}/${name}"
}

download_and_verify "ffmpeg" "$ffmpeg_sha256"
download_and_verify "ffprobe" "$ffprobe_sha256"

ffmpeg_path="${runtime_dir}/ffmpeg"
ffprobe_path="${runtime_dir}/ffprobe"
build_configuration="$($ffmpeg_path -hide_banner -buildconf 2>&1)"
if grep -Eqi -- '--enable-(gpl|nonfree)' <<<"$build_configuration"; then
  echo "Bundled FFmpeg build is not LGPL-only" >&2
  exit 1
fi
encoders="$("$ffmpeg_path" -hide_banner -encoders 2>/dev/null || true)"
if ! grep -q 'h264_videotoolbox' <<<"$encoders"; then
  echo "Bundled FFmpeg is missing h264_videotoolbox" >&2
  exit 1
fi
filters="$("$ffmpeg_path" -hide_banner -filters 2>/dev/null || true)"
if ! grep -q 'drawtext' <<<"$filters"; then
  echo "Bundled FFmpeg is missing drawtext" >&2
  exit 1
fi
if [[ "$(lipo -archs "$ffmpeg_path")" != "arm64" ]] || [[ "$(lipo -archs "$ffprobe_path")" != "arm64" ]]; then
  echo "Bundled FFmpeg binaries are not arm64" >&2
  exit 1
fi
for binary_path in "$ffmpeg_path" "$ffprobe_path"; do
  non_system_dependencies="$(otool -L "$binary_path" | tail -n +2 | awk '{print $1}' | grep -vE '^/usr/lib/|^/System/Library/' || true)"
  if [[ -n "$non_system_dependencies" ]]; then
    echo "Bundled binary links non-system libraries: ${binary_path}" >&2
    echo "$non_system_dependencies" >&2
    exit 1
  fi
done
"$ffprobe_path" -hide_banner -version >/dev/null
printf '%s\n' "$build_configuration" >"${runtime_dir}/BUILD-CONFIGURATION.txt"
cat >"${runtime_dir}/SOURCE.json" <<EOF
{
  "source": "TaherHaghverdi/mediamill-ffmpeg",
  "releaseTag": "${release_tag}",
  "target": "macos",
  "arch": "arm64",
  "ffmpegSha256": "${ffmpeg_sha256}",
  "ffprobeSha256": "${ffprobe_sha256}",
  "sourceRelease": "${release_root}"
}
EOF

echo "FFmpeg runtime ready: ${runtime_dir}"
