#!/usr/bin/env bash
set -euo pipefail

machine_arch="$(uname -m)"
case "$machine_arch" in
arm64 | x86_64) ;;
*)
  echo "Unsupported macOS architecture: ${machine_arch}" >&2
  exit 1
  ;;
esac

desktop_root="$(cd "$(dirname "$0")/.." && pwd)"
runtime_dir="${desktop_root}/runtime/ffmpeg"
mkdir -p "$runtime_dir"

checksum_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

download_verified_archive() {
  local archive_path="$1"
  local source_url="$2"
  local expected_sha256="$3"

  if [[ ! -f "$archive_path" ]] || [[ "$(checksum_file "$archive_path")" != "$expected_sha256" ]]; then
    curl -fL --retry 3 --retry-delay 2 \
      -A "AI-anime-Desktop-Build" \
      -o "$archive_path" \
      "$source_url"
  fi
  if [[ "$(checksum_file "$archive_path")" != "$expected_sha256" ]]; then
    echo "Archive checksum verification failed: ${archive_path}" >&2
    exit 1
  fi
}

prepare_arm64_runtime() {
  local release_tag="8.1.2.1-20260801"
  local release_root="https://github.com/TaherHaghverdi/mediamill-ffmpeg/releases/download/${release_tag}"
  local ffmpeg_sha256="7fe7a549a79719d1bc61530dc747a20937733289bf553d8569703fa7a51c2fe1"
  local ffprobe_sha256="d9c440eab4e8fdb919bad546bdd4f1d5c83a4ce919cd7d5421478871648ea368"
  local cache_dir="${desktop_root}/.ffmpeg-cache/macos-arm64-${release_tag}"
  mkdir -p "$cache_dir"

  local name expected_sha256 archive_path extract_dir binary_path
  for name in ffmpeg ffprobe; do
    if [[ "$name" == "ffmpeg" ]]; then
      expected_sha256="$ffmpeg_sha256"
    else
      expected_sha256="$ffprobe_sha256"
    fi
    archive_path="${cache_dir}/${name}.zip"
    download_verified_archive "$archive_path" "${release_root}/${name}.zip" "$expected_sha256"
    extract_dir="$(mktemp -d "${cache_dir}/${name}.XXXXXX")"
    ditto -x -k "$archive_path" "$extract_dir"
    binary_path="$(find "$extract_dir" -type f -name "$name" -print -quit)"
    if [[ -z "$binary_path" ]]; then
      echo "Required binary not found in ${archive_path}: ${name}" >&2
      exit 1
    fi
    install -m 0755 "$binary_path" "${runtime_dir}/${name}"
  done

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
}

prepare_x86_64_runtime() {
  local release_tag="v9.0.8"
  local ffmpeg_version="9.0.1"
  local source_url="https://github.com/markus-perl/ffmpeg-build-script/archive/refs/tags/${release_tag}.tar.gz"
  local source_sha256="3d0fc6ffb45d2e991ec4b6c0833c60e016c2e36781a7c279f53e0f108231e964"
  local cache_dir="${desktop_root}/.ffmpeg-cache/macos-x86_64-${release_tag#v}"
  local archive_path="${cache_dir}/ffmpeg-build-script-${release_tag}.tar.gz"
  local source_dir="${cache_dir}/source"
  local cached_ffmpeg="${cache_dir}/ffmpeg"
  local cached_ffprobe="${cache_dir}/ffprobe"
  mkdir -p "$cache_dir"

  local command_name
  for command_name in clang make python3 meson ninja lipo otool; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      echo "Intel macOS FFmpeg build requires ${command_name}; install the documented build prerequisites first." >&2
      exit 1
    fi
  done

  if [[ ! -x "$cached_ffmpeg" ]] || [[ ! -x "$cached_ffprobe" ]]; then
    download_verified_archive "$archive_path" "$source_url" "$source_sha256"
    if [[ ! -x "${source_dir}/build-ffmpeg" ]]; then
      rm -rf "$source_dir"
      mkdir -p "$source_dir"
      tar -xzf "$archive_path" -C "$source_dir" --strip-components=1
      chmod +x "${source_dir}/build-ffmpeg"
    fi
    (
      cd "$source_dir"
      SKIPINSTALL=yes ./build-ffmpeg --build
    )
    install -m 0755 "${source_dir}/workspace/bin/ffmpeg" "$cached_ffmpeg"
    install -m 0755 "${source_dir}/workspace/bin/ffprobe" "$cached_ffprobe"
  fi

  install -m 0755 "$cached_ffmpeg" "${runtime_dir}/ffmpeg"
  install -m 0755 "$cached_ffprobe" "${runtime_dir}/ffprobe"
  cat >"${runtime_dir}/SOURCE.json" <<EOF
{
  "source": "markus-perl/ffmpeg-build-script",
  "releaseTag": "${release_tag}",
  "ffmpegVersion": "${ffmpeg_version}",
  "target": "macos",
  "arch": "x86_64",
  "sourceArchiveSha256": "${source_sha256}",
  "sourceRelease": "${source_url}"
}
EOF
}

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

if [[ "$machine_arch" == "arm64" ]]; then
  prepare_arm64_runtime
  maximum_macos_version="15.0"
  expected_ffmpeg_version="8.1.2"
else
  prepare_x86_64_runtime
  maximum_macos_version="13.0"
  expected_ffmpeg_version="9.0.1"
fi

ffmpeg_path="${runtime_dir}/ffmpeg"
ffprobe_path="${runtime_dir}/ffprobe"
version_output="$($ffmpeg_path -hide_banner -version 2>&1)"
if ! grep -Fq "ffmpeg version ${expected_ffmpeg_version}" <<<"$version_output"; then
  echo "Unexpected FFmpeg version; expected ${expected_ffmpeg_version}" >&2
  exit 1
fi
build_configuration="$($ffmpeg_path -hide_banner -buildconf 2>&1)"
if grep -Eqi -- '--enable-(gpl|nonfree)' <<<"$build_configuration"; then
  echo "Bundled FFmpeg build enables GPL or non-free components" >&2
  exit 1
fi
encoders="$($ffmpeg_path -hide_banner -encoders 2>/dev/null || true)"
if ! grep -Eq '[[:space:]]h264_videotoolbox[[:space:]]' <<<"$encoders"; then
  echo "Bundled FFmpeg is missing h264_videotoolbox" >&2
  exit 1
fi
filters="$($ffmpeg_path -hide_banner -filters 2>/dev/null || true)"
for required_filter in drawtext subtitles; do
  if ! grep -Eq "[[:space:]]${required_filter}[[:space:]]" <<<"$filters"; then
    echo "Bundled FFmpeg is missing ${required_filter}" >&2
    exit 1
  fi
done

for binary_path in "$ffmpeg_path" "$ffprobe_path"; do
  binary_archs="$(lipo -archs "$binary_path")"
  case " ${binary_archs} " in
  *" ${machine_arch} "*) ;;
  *)
    echo "Bundled binary does not contain ${machine_arch}: ${binary_path} (${binary_archs})" >&2
    exit 1
    ;;
  esac

  minimum_version="$(minimum_macos_version "$binary_path")"
  if [[ -z "$minimum_version" ]] || ! version_not_newer_than "$minimum_version" "$maximum_macos_version"; then
    echo "Bundled binary requires a newer macOS than ${maximum_macos_version}: ${binary_path} (${minimum_version:-unknown})" >&2
    exit 1
  fi

  non_system_dependencies="$(otool -L "$binary_path" | tail -n +2 | awk '{print $1}' | grep -vE '^/usr/lib/|^/System/Library/' || true)"
  if [[ -n "$non_system_dependencies" ]]; then
    echo "Bundled binary links non-system libraries: ${binary_path}" >&2
    echo "$non_system_dependencies" >&2
    exit 1
  fi
done

"$ffprobe_path" -hide_banner -version >/dev/null
printf '%s\n' "$build_configuration" >"${runtime_dir}/BUILD-CONFIGURATION.txt"
echo "FFmpeg runtime ready: ${runtime_dir} (${machine_arch}, macOS ${maximum_macos_version} compatible)"
