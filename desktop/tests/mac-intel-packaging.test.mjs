import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Intel macOS packaging targets Ventura without changing Windows or arm64 packaging", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const arm64Package = manifest.scripts["package:mac"];
  const x64Package = manifest.scripts["package:mac:x64"];

  assert.equal(
    manifest.scripts["package:win"],
    "node scripts/assert-package-host.mjs win32 x64 && pnpm run package:prepare && electron-builder --win nsis --x64 --publish never && node scripts/smoke-packaged-win-resources.mjs",
  );
  assert.doesNotMatch(arm64Package, /prepare-macos-intel|UV_NO_SYNC|DEPLOYMENT_TARGET/);
  assert.doesNotMatch(manifest.scripts["package:prepare"], /prepare-macos-intel|UV_NO_SYNC/);
  assert.match(arm64Package, /assert-package-host\.mjs darwin arm64/);
  assert.match(arm64Package, /--arm64/);
  assert.match(x64Package, /assert-package-host\.mjs darwin x64/);
  assert.match(x64Package, /MACOSX_DEPLOYMENT_TARGET=13\.0/);
  assert.match(
    x64Package,
    /prepare-macos-intel-python\.sh && MACOSX_DEPLOYMENT_TARGET=13\.0 UV_NO_SYNC=1 pnpm run package:prepare/,
  );
  assert.match(x64Package, /--x64/);
  assert.match(x64Package, /-c\.mac\.minimumSystemVersion=13\.4\.0/);
  assert.match(x64Package, /smoke-packaged-mac-resources\.sh x86_64 13\.4\.0/);
});

test("Intel Python environments select target wheels before packaging without resyncing to the host", async () => {
  const prepareScript = await readFile(
    new URL("../scripts/prepare-macos-intel-python.sh", import.meta.url),
    "utf8",
  );

  assert.match(prepareScript, /export MACOSX_DEPLOYMENT_TARGET=13\.0/);
  assert.match(prepareScript, /"\$\(uname -s\)" != "Darwin"/);
  assert.match(prepareScript, /"\$\(uname -m\)" != "x86_64"/);
  assert.match(
    prepareScript,
    /uv sync --project "\$\{desktop_root\}\/\.\." --locked --group desktop --python-platform x86_64-apple-darwin/,
  );
  assert.match(
    prepareScript,
    /uv sync --project "\$\{desktop_root\}\/hermes-runtime" --locked --group build --python-platform x86_64-apple-darwin/,
  );
  assert.equal((prepareScript.match(/--reinstall/g) ?? []).length, 2);
  assert.match(prepareScript, /check-macos-binaries\.sh" "\$\{desktop_root\}\/\.\.\/\.venv" x86_64 13\.4\.0/);
  assert.match(prepareScript, /check-macos-binaries\.sh" "\$\{desktop_root\}\/hermes-runtime\/\.venv" x86_64 13\.4\.0/);
});

test("Intel cryptography builds its existing OpenSSL dependency for Ventura without a Python downgrade", async () => {
  const prepareScript = await readFile(
    new URL("../scripts/prepare-macos-intel-python.sh", import.meta.url),
    "utf8",
  );

  assert.match(prepareScript, /openssl_version="4\.0\.2"/);
  assert.match(prepareScript, /736b467530f916737b7031310ccb21d8218c6229e61e8e160cd1d3458cd543a8/);
  assert.match(prepareScript, /shasum -a 256 --check -/);
  assert.match(prepareScript, /\.\/Configure darwin64-x86_64-cc no-shared no-tests/);
  assert.match(prepareScript, /-mmacosx-version-min=13\.0/);
  assert.match(prepareScript, /OPENSSL_DIR="\$openssl_prefix" OPENSSL_STATIC=1/);
  assert.match(prepareScript, /--no-binary-package cryptography/);
  assert.match(prepareScript, /export UV_CACHE_DIR="\$\{cache_root\}\/uv-openssl-/);
  assert.match(prepareScript, /fernet\.decrypt\(fernet\.encrypt/);
  assert.match(prepareScript, /"libssl\." in links or "libcrypto\." in links/);
});

test("Intel macOS native dependencies stay available at the Ventura baseline", async () => {
  const pyproject = await readFile(
    new URL("../../pyproject.toml", import.meta.url),
    "utf8",
  );
  const lock = await readFile(new URL("../../uv.lock", import.meta.url), "utf8");
  const ffmpegScript = await readFile(
    new URL("../scripts/fetch-ffmpeg-macos.sh", import.meta.url),
    "utf8",
  );

  assert.match(
    pyproject,
    /onnxruntime==1\.23\.2; sys_platform == 'darwin' and platform_machine == 'x86_64'/,
  );
  assert.match(
    pyproject,
    /onnxruntime==1\.29\.0; sys_platform != 'darwin' or platform_machine != 'x86_64'/,
  );
  assert.match(
    pyproject,
    /lancedb==0\.25\.3; sys_platform == 'darwin' and platform_machine == 'x86_64'/,
  );
  assert.match(
    pyproject,
    /lancedb==0\.37\.1; sys_platform != 'darwin' or platform_machine != 'x86_64'/,
  );
  assert.match(lock, /onnxruntime-1\.23\.2-cp311-cp311-macosx_13_0_x86_64\.whl/);
  assert.match(lock, /lancedb-0\.25\.3-cp39-abi3-macosx_10_15_x86_64\.whl/);
  assert.match(lock, /ladybug-0\.17\.1-cp311-cp311-macosx_13_0_x86_64\.whl/);
  assert.match(ffmpegScript, /arm64 \| x86_64/);
  assert.match(ffmpegScript, /release_tag="v9\.0\.8"/);
  assert.match(
    ffmpegScript,
    /3d0fc6ffb45d2e991ec4b6c0833c60e016c2e36781a7c279f53e0f108231e964/,
  );
  assert.match(ffmpegScript, /SKIPINSTALL=yes \.\/build-ffmpeg --build/);
  assert.match(
    ffmpegScript,
    /GIT_CEILING_DIRECTORIES="\$source_dir" SKIPINSTALL=yes \.\/build-ffmpeg --build/,
  );
  assert.match(
    ffmpegScript,
    /"\$expected_ffmpeg_version" \| "\$expected_ffmpeg_version"-\*/,
  );
  assert.match(ffmpegScript, /required_filter in drawtext subtitles/);
  assert.match(ffmpegScript, /h264_videotoolbox/);
  assert.match(ffmpegScript, /maximum_macos_version="13\.0"/);
});

test("packaged Intel app verification checks architecture, minimum OS, runtime and signature", async () => {
  const smokeScript = await readFile(
    new URL("../scripts/smoke-packaged-mac-resources.sh", import.meta.url),
    "utf8",
  );

  assert.match(smokeScript, /Print :LSMinimumSystemVersion/);
  assert.match(smokeScript, /lipo -archs/);
  assert.match(smokeScript, /check-macos-binaries\.sh" "\$\{app_path\}\/Contents" "\$expected_arch" "\$maximum_system_version"/);
  assert.match(smokeScript, /backend="\$\{resources\}\/backend\/ai-anime-backend"/);
  assert.doesNotMatch(smokeScript, /backend\/ai-anime-backend\/ai-anime-backend/);
  assert.match(smokeScript, /--runtime-smoke-check/);
  assert.match(smokeScript, /-c:v h264_videotoolbox/);
  assert.match(smokeScript, /subtitles=\$\{subtitle_path\}/);
  assert.match(smokeScript, /codesign --verify --deep --strict/);
  assert.match(smokeScript, /macos-\$\{artifact_arch\}\.\$\{extension\}/);
});

test("Mach-O compatibility checks the requested slice and reports every incompatible file", async () => {
  const checkScript = await readFile(
    new URL("../scripts/check-macos-binaries.sh", import.meta.url),
    "utf8",
  );

  assert.match(checkScript, /lipo -archs/);
  assert.match(checkScript, /otool -arch "\$expected_arch" -l/);
  assert.match(checkScript, /LC_BUILD_VERSION/);
  assert.match(checkScript, /LC_VERSION_MIN_MACOSX/);
  assert.match(checkScript, /mach_o_failures=\$\(\(mach_o_failures \+ 1\)\)/);
  assert.match(checkScript, /"\$mach_o_failures" -gt 0/);
  assert.match(checkScript, /"\$mach_o_count" -eq 0/);
});

test("GitHub Actions packages Intel macOS on an explicit x86_64 runner", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/build-macos-intel.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /runs-on: macos-15-intel/);
  assert.doesNotMatch(workflow, /runs-on: macos-latest/);
  assert.match(workflow, /test "\$\(uname -m\)" = "x86_64"/);
  assert.match(workflow, /MACOSX_DEPLOYMENT_TARGET: "13\.0"/);
  assert.match(workflow, /pnpm --dir desktop package:mac:x64/);
  assert.match(workflow, /AI-anime-\$\{app_version\}-macos-x64\.dmg/);
  assert.match(workflow, /AI-anime-\$\{app_version\}-macos-x64\.zip/);
  assert.match(workflow, /latest-mac\.yml/);
  assert.match(workflow, /SHA256SUMS-macos-x64\.txt/);
  assert.match(workflow, /github\.ref_type != 'tag'/);
  assert.match(workflow, /gh release create "\$\{GITHUB_REF_NAME\}"/);
  assert.match(workflow, /--draft/);
});
