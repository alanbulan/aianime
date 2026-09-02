import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Intel macOS packaging targets Ventura without changing the arm64 package", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const arm64Package = manifest.scripts["package:mac"];
  const x64Package = manifest.scripts["package:mac:x64"];

  assert.match(arm64Package, /assert-package-host\.mjs darwin arm64/);
  assert.match(arm64Package, /--arm64/);
  assert.match(x64Package, /assert-package-host\.mjs darwin x64/);
  assert.match(x64Package, /MACOSX_DEPLOYMENT_TARGET=13\.0/);
  assert.match(x64Package, /--x64/);
  assert.match(x64Package, /-c\.mac\.minimumSystemVersion=13\.0\.0/);
  assert.match(x64Package, /smoke-packaged-mac-resources\.sh x86_64 13\.0\.0/);
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
    /revision="\$ffmpeg_version" SKIPINSTALL=yes \.\/build-ffmpeg --build/,
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
  assert.match(smokeScript, /minimum_macos_version/);
  assert.match(smokeScript, /--runtime-smoke-check/);
  assert.match(smokeScript, /-c:v h264_videotoolbox/);
  assert.match(smokeScript, /subtitles=\$\{subtitle_path\}/);
  assert.match(smokeScript, /codesign --verify --deep --strict/);
  assert.match(smokeScript, /macos-\$\{artifact_arch\}\.\$\{extension\}/);
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
