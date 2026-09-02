#!/usr/bin/env bash
set -euo pipefail

expected_arch="${1:-x86_64}"
maximum_system_version="${2:-13.0.0}"
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

version_not_newer_than() {
  awk -v actual="$1" -v maximum="$2" 'BEGIN {
    split(actual, a, ".");
    split(maximum, b, ".");
    for (i = 1; i <= 4; i++) {
      av = a[i] + 0;
      bv = b[i] + 0;
      if (av < bv) exit 0;
      if (av > bv) exit 1;
    }
    exit 0;
  }'
}

minimum_macos_version() {
  otool -l "$1" | awk '
    $1 == "cmd" { command = $2; next }
    command == "LC_BUILD_VERSION" && $1 == "minos" { print $2; exit }
    command == "LC_VERSION_MIN_MACOSX" && $1 == "version" { print $2; exit }
  '
}

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

mach_o_count=0
while IFS= read -r candidate; do
  if ! file "$candidate" | grep -q 'Mach-O'; then
    continue
  fi
  mach_o_count=$((mach_o_count + 1))
  candidate_archs="$(lipo -archs "$candidate")"
  case " ${candidate_archs} " in
  *" ${expected_arch} "*) ;;
  *)
    echo "Packaged Mach-O file does not contain ${expected_arch}: ${candidate} (${candidate_archs})" >&2
    exit 1
    ;;
  esac

  inspection_path="$candidate"
  case "$candidate_archs" in
  *" "*)
    inspection_path="${temporary_root}/slice-${mach_o_count}"
    lipo "$candidate" -thin "$expected_arch" -output "$inspection_path"
    ;;
  esac
  minimum_version="$(minimum_macos_version "$inspection_path")"
  if [[ -z "$minimum_version" ]] || ! version_not_newer_than "$minimum_version" "$maximum_system_version"; then
    echo "Packaged Mach-O requires a newer macOS than ${maximum_system_version}: ${candidate} (${minimum_version:-unknown})" >&2
    exit 1
  fi
done < <(find "${app_path}/Contents" -type f -print)

if [[ "$mach_o_count" -eq 0 ]]; then
  echo "No Mach-O files were found in the packaged application" >&2
  exit 1
fi

resources="${app_path}/Contents/Resources"
backend="${resources}/backend/ai-anime-backend/ai-anime-backend"
ffmpeg="${resources}/bin/ffmpeg"
ffprobe="${resources}/bin/ffprobe"
hermes="${resources}/hermes/hermes-acp/hermes-acp"
for required_path in "$backend" "$ffmpeg" "$ffprobe" "$hermes"; do
  if [[ ! -x "$required_path" ]]; then
    echo "Required packaged executable is missing: ${required_path}" >&2
    exit 1
  fi
done

backend_output="$(PYTHONIOENCODING=utf-8 PYTHONUTF8=1 "$backend" --runtime-smoke-check)"
if ! grep -q '^AI_ANIME_BACKEND_SMOKE ' <<<"$backend_output"; then
  echo "Packaged backend runtime smoke marker is missing" >&2
  exit 1
fi

"$ffprobe" -hide_banner -version >/dev/null
filters="$($ffmpeg -hide_banner -filters 2>/dev/null || true)"
for required_filter in drawtext subtitles; do
  if ! grep -Eq "[[:space:]]${required_filter}[[:space:]]" <<<"$filters"; then
    echo "Packaged FFmpeg is missing ${required_filter}" >&2
    exit 1
  fi
done
subtitle_path="${temporary_root}/subtitle.srt"
printf '1\n00:00:00,000 --> 00:00:00,500\nIntel 中文\n' >"$subtitle_path"
"$ffmpeg" -v error -f lavfi -i color=size=32x32:duration=0.1 \
  -pix_fmt yuv420p -c:v h264_videotoolbox -frames:v 1 -f null -
"$ffmpeg" -v error -f lavfi -i color=size=32x32:duration=0.1 \
  -vf "subtitles=${subtitle_path}" -frames:v 1 -f null -
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

echo "Packaged macOS resources passed: ${expected_arch}, minimum macOS ${maximum_system_version}, ${mach_o_count} Mach-O files."
