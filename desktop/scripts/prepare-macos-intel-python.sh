#!/usr/bin/env bash
set -euo pipefail

desktop_root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
  echo "Ventura Python preparation requires an Intel macOS build host" >&2
  exit 1
fi
export MACOSX_DEPLOYMENT_TARGET=13.0

# cryptography no longer ships Intel wheels. Build its existing OpenSSL
# dependency for Ventura instead of linking the runner's Homebrew libraries.
openssl_version="4.0.2"
openssl_sha256="736b467530f916737b7031310ccb21d8218c6229e61e8e160cd1d3458cd543a8"
cache_root="${desktop_root}/.macos-intel-cache"
openssl_root="${cache_root}/openssl-${openssl_version}-${MACOSX_DEPLOYMENT_TARGET}"
openssl_prefix="${openssl_root}/install"
export UV_CACHE_DIR="${cache_root}/uv-openssl-${openssl_version}-${MACOSX_DEPLOYMENT_TARGET}"

for command_name in clang make perl cargo rustc curl shasum lipo otool; do
  command -v "$command_name" >/dev/null
done
if [[ ! -f "${openssl_prefix}/.complete" ]]; then
  mkdir -p "${openssl_root}/source"
  archive_path="${openssl_root}/openssl-${openssl_version}.tar.gz"
  if [[ ! -f "$archive_path" ]]; then
    curl --fail --location --retry 3 \
      "https://github.com/openssl/openssl/releases/download/openssl-${openssl_version}/openssl-${openssl_version}.tar.gz" \
      --output "$archive_path"
  fi
  printf '%s  %s\n' "$openssl_sha256" "$archive_path" | shasum -a 256 --check -
  tar -xzf "$archive_path" -C "${openssl_root}/source" --strip-components=1
  (
    cd "${openssl_root}/source"
    ./Configure darwin64-x86_64-cc no-shared no-tests \
      -mmacosx-version-min=13.0 --prefix="$openssl_prefix" --libdir=lib
    make -j "$(sysctl -n hw.logicalcpu)"
    make install_sw
  )
  "${openssl_prefix}/bin/openssl" version
  touch "${openssl_prefix}/.complete"
fi

# Select Ventura wheels even when the native Intel build host runs a newer macOS.
# Reinstall also replaces same-version wheels left by a previous host-native sync.
OPENSSL_DIR="$openssl_prefix" OPENSSL_STATIC=1 \
  uv sync --project "${desktop_root}/.." --locked --group desktop --python-platform x86_64-apple-darwin \
    --reinstall --no-binary-package cryptography
uv sync --project "${desktop_root}/hermes-runtime" --locked --group build --python-platform x86_64-apple-darwin \
  --reinstall

uv run --project "${desktop_root}/.." --no-sync python - <<'PY'
import subprocess

from cryptography.fernet import Fernet
from cryptography.hazmat.backends.openssl.backend import backend
from cryptography.hazmat.bindings import _rust

links = subprocess.check_output(["otool", "-L", _rust.__file__], text=True)
if "libssl." in links or "libcrypto." in links:
    raise SystemExit("Intel cryptography must statically link the Ventura OpenSSL build")
fernet = Fernet(Fernet.generate_key())
assert fernet.decrypt(fernet.encrypt(b"ventura-runtime")) == b"ventura-runtime"
print(f"Intel cryptography smoke passed: {backend.openssl_version_text()}")
PY

bash "${desktop_root}/scripts/check-macos-binaries.sh" "${desktop_root}/../.venv" x86_64 13.4.0
bash "${desktop_root}/scripts/check-macos-binaries.sh" "${desktop_root}/hermes-runtime/.venv" x86_64 13.4.0
