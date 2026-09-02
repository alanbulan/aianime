#!/usr/bin/env bash
set -euo pipefail

scan_root="${1:?A Mach-O scan directory is required}"
expected_arch="${2:-x86_64}"
maximum_system_version="${3:-13.4.0}"
case "$expected_arch" in
arm64 | x86_64) ;;
*)
  echo "Unsupported expected architecture: ${expected_arch}" >&2
  exit 1
  ;;
esac
test -d "$scan_root"

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
  otool -arch "$expected_arch" -l "$1" | awk '
    $1 == "cmd" { command = $2; next }
    !found && command == "LC_BUILD_VERSION" && $1 == "minos" { print $2; found = 1 }
    !found && command == "LC_VERSION_MIN_MACOSX" && $1 == "version" { print $2; found = 1 }
  '
}

mach_o_count=0
mach_o_failures=0
while IFS= read -r candidate; do
  if ! file "$candidate" | grep -q 'Mach-O'; then
    continue
  fi
  mach_o_count=$((mach_o_count + 1))
  candidate_archs="$(lipo -archs "$candidate")"
  case " ${candidate_archs} " in
  *" ${expected_arch} "*) ;;
  *)
    echo "Mach-O file does not contain ${expected_arch}: ${candidate} (${candidate_archs})" >&2
    mach_o_failures=$((mach_o_failures + 1))
    continue
    ;;
  esac

  minimum_version="$(minimum_macos_version "$candidate")"
  if [[ -z "$minimum_version" ]] || ! version_not_newer_than "$minimum_version" "$maximum_system_version"; then
    echo "Mach-O requires a newer macOS than ${maximum_system_version}: ${candidate} (${minimum_version:-unknown})" >&2
    mach_o_failures=$((mach_o_failures + 1))
  fi
done < <(find "$scan_root" -type f -print)

if [[ "$mach_o_count" -eq 0 ]]; then
  echo "No Mach-O files were found under ${scan_root}" >&2
  exit 1
fi
if [[ "$mach_o_failures" -gt 0 ]]; then
  echo "macOS compatibility check failed for ${mach_o_failures} Mach-O files" >&2
  exit 1
fi
echo "macOS compatibility passed: ${expected_arch}, maximum ${maximum_system_version}, ${mach_o_count} Mach-O files in ${scan_root}."
