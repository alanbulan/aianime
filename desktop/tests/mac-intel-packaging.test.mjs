import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
  assert.match(x64Package, /--config electron-builder\.macos-intel\.yml/);
  for (const name of ["package:win", "package:dir", "package:mac", "package:world-runtime"]) {
    assert.doesNotMatch(manifest.scripts[name], /electron-builder\.macos-intel/);
  }
  assert.match(x64Package, /smoke-packaged-mac-resources\.sh x86_64 13\.4\.0/);
});

test("Intel builder filters optional 3D modules without changing shared resources or other platforms", async () => {
  const require = createRequire(import.meta.url);
  const builderRequire = createRequire(require.resolve("electron-builder/package.json"));
  const { getConfig, validateConfiguration } = builderRequire("app-builder-lib/out/util/config/config.js");
  const { getNodeModuleFileMatcher } = builderRequire("app-builder-lib/out/fileMatcher.js");
  const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
  const base = await getConfig(desktopRoot, "electron-builder.yml");
  const intel = await getConfig(desktopRoot, "electron-builder.macos-intel.yml");
  await validateConfiguration(intel, { isEnabled: false });

  assert.equal(intel.mac.minimumSystemVersion, "13.4.0");
  assert.equal(base.mac.minimumSystemVersion, "15.0.0");
  assert.deepEqual(intel.win, base.win);
  assert.deepEqual(intel.extraResources, base.extraResources);
  assert.deepEqual(intel.publish, base.publish);

  const includes = (config, platform, modulePath) => {
    const matcher = getNodeModuleFileMatcher(
      desktopRoot,
      join(desktopRoot, "release", "test-app"),
      (pattern) => pattern,
      config[platform],
      { config, debugLogger: { isEnabled: false } },
    );
    return matcher.createFilter()(join(desktopRoot, modulePath), {
      moduleFullFilePath: modulePath,
      isDirectory: () => false,
    });
  };
  for (const modulePath of [
    "node_modules/webgpu/dist/darwin-universal.dawn.node",
    "node_modules/webgpu/index.js",
    "node_modules/@playcanvas/splat-transform/bin/cli.mjs",
    "node_modules/@playcanvas/splat-transform/node_modules/webgpu/dist/darwin-universal.dawn.node",
  ]) {
    assert.equal(includes(intel, "mac", modulePath), false, modulePath);
    assert.equal(includes(base, "mac", modulePath), true, modulePath);
    assert.equal(includes(base, "win", modulePath), true, modulePath);
  }
  for (const modulePath of [
    "node_modules/electron-updater/out/main.js",
    "node_modules/builder-util-runtime/out/index.js",
    "node_modules/debug/src/index.js",
  ]) {
    assert.equal(includes(intel, "mac", modulePath), true, modulePath);
  }
});

test("validated Intel main file collection excludes build environments and keeps the application", async () => {
  const require = createRequire(import.meta.url);
  const builderRequire = createRequire(require.resolve("electron-builder/package.json"));
  const { Packager } = builderRequire("app-builder-lib/out/packager.js");
  const { AppInfo } = builderRequire("app-builder-lib/out/appInfo.js");
  const { MacPackager } = builderRequire("app-builder-lib/out/macPackager.js");
  const { getMainFileMatchers } = builderRequire("app-builder-lib/out/fileMatcher.js");
  const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
  for (const config of ["electron-builder.yml", "electron-builder.macos-intel.yml"]) {
    const info = new Packager({ projectDir: desktopRoot, config });
    try {
      // validateConfig normalizes root files to FileSets, as in a real build.
      await info.validateConfig();
      info._appInfo = new AppInfo(info);
      const packager = new MacPackager(info);
      const matchers = getMainFileMatchers(desktopRoot, join(desktopRoot, "release", "test-app"),
        (pattern) => pattern, info.config.mac, packager, join(desktopRoot, "release"), false);
      const includes = (path) => matchers.some((matcher) =>
        matcher.createFilter()(join(desktopRoot, path), { isDirectory: () => false }));
      for (const path of ["package.json", "dist/main.js", "dist/preload.cjs", "dist/runtime-dependencies.js"]) {
        assert.equal(includes(path), true, `${config}: ${path}`);
      }
      for (const path of [
        "hermes-runtime/.venv/bin/python", "hermes-runtime/.venv/lib/python3.11/site-packages/test.py",
        "hermes-runtime/dist/hermes-acp/hermes-acp", "backend-dist/ai-anime-backend/ai-anime-backend",
        ".ffmpeg-cache/source/workspace/bin/ffmpeg", ".macos-intel-cache/openssl/lib/libcrypto.a",
        "runtime/ffmpeg/ffmpeg", "src/main.ts", "tests/mac-intel-packaging.test.mjs", "dist/main.js.map",
      ]) {
        assert.equal(includes(path), false, `${config}: ${path}`);
      }
    } finally {
      await info.tempDirManager.cleanup();
    }
  }
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
  assert.match(smokeScript, /ELECTRON_RUN_AS_NODE=1 "\$main_executable" - "\$\{resources\}\/app\.asar"/);
  assert.match(smokeScript, /appRequire\("electron-updater"\)\.MacUpdater/);
  assert.match(smokeScript, /Optional 3D module must not be bundled/);
  assert.match(smokeScript, /test -f "\$\{resources\}\/frontend\/index\.html"/);
  assert.match(smokeScript, /backend="\$\{resources\}\/backend\/ai-anime-backend"/);
  assert.doesNotMatch(smokeScript, /backend\/ai-anime-backend\/ai-anime-backend/);
  assert.match(smokeScript, /--runtime-smoke-check/);
  assert.ok(smokeScript.includes('filters="$("$ffmpeg" -hide_banner -filters'));
  assert.match(smokeScript, /-c:v h264_videotoolbox/);
  assert.match(smokeScript, /-allow_sw 1 -b:v 4M/);
  assert.match(smokeScript, /nb_read_frames=3/);
  assert.match(smokeScript, /-v error -xerror -i "\$video_path" -f null -/);
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
  assert.match(checkScript, /otool -m -arch "\$expected_arch" -l/);
  assert.match(checkScript, /LC_BUILD_VERSION/);
  assert.match(checkScript, /LC_VERSION_MIN_MACOSX/);
  assert.match(checkScript, /mach_o_failures=\$\(\(mach_o_failures \+ 1\)\)/);
  assert.match(checkScript, /"\$mach_o_failures" -gt 0/);
  assert.match(checkScript, /"\$mach_o_count" -eq 0/);
});

test(
  "real macOS tools audit literal Helper filenames and reject newer or wrong-architecture binaries",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "ai-anime-macho-test-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const scanRoot = join(root, "AI anime.app", "Contents");
    const helperRoot = join(scanRoot, "Frameworks", "AI anime Helper (GPU).app", "Contents", "MacOS");
    await mkdir(helperRoot, { recursive: true });
    const compile = (path, arch, minimumVersion) => {
      const result = spawnSync("clang", [
        "-arch", arch,
        `-mmacosx-version-min=${minimumVersion}`,
        "-dynamiclib", "-x", "c", "-", "-o", path,
      ], {
        input: "int ai_anime_macho_fixture(void) { return 0; }\n",
        encoding: "utf8",
        timeout: 20_000,
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
    };
    const checker = fileURLToPath(new URL("../scripts/check-macos-binaries.sh", import.meta.url));
    const audit = () => spawnSync("bash", [checker, scanRoot, "x86_64", "13.4.0"], {
      encoding: "utf8",
      timeout: 20_000,
    });

    const intelSlice = join(root, "intel.dylib");
    const armSlice = join(root, "arm.dylib");
    compile(intelSlice, "x86_64", "13.4");
    compile(armSlice, "arm64", "15.0");
    const fatHelper = spawnSync("lipo", [
      "-create", intelSlice, armSlice,
      "-output", join(helperRoot, "AI anime Helper (GPU)"),
    ], { encoding: "utf8", timeout: 20_000 });
    assert.equal(fatHelper.status, 0, fatHelper.stderr || fatHelper.error?.message);
    const compatible = audit();
    assert.equal(compatible.status, 0, compatible.stderr || compatible.error?.message);
    assert.match(compatible.stdout, /macOS compatibility passed/);

    const newerBinary = join(scanRoot, "requires-macos-15.dylib");
    const wrongArchBinary = join(scanRoot, "arm64-only.dylib");
    compile(newerBinary, "x86_64", "15.0");
    compile(wrongArchBinary, "arm64", "13.4");
    const incompatible = audit();
    assert.equal(incompatible.status, 1, incompatible.stderr || incompatible.error?.message);
    assert.ok(incompatible.stderr.includes(newerBinary));
    assert.ok(incompatible.stderr.includes(wrongArchBinary));
    assert.match(incompatible.stderr, /requires a newer macOS than 13\.4\.0/);
    assert.match(incompatible.stderr, /does not contain x86_64/);
    assert.match(incompatible.stderr, /compatibility check failed for 2 Mach-O files/);
  },
);

test("GitHub Actions packages Intel macOS on an explicit x86_64 runner", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/build-macos-intel.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /runs-on: macos-15-intel/);
  assert.doesNotMatch(workflow, /runs-on: macos-latest/);
  assert.match(workflow, /test "\$\(uname -m\)" = "x86_64"/);
  assert.match(workflow, /MACOSX_DEPLOYMENT_TARGET: "13\.0"/);
  assert.match(workflow, /Test desktop packaging contracts/);
  assert.match(workflow, /pnpm --dir desktop test/);
  assert.ok(workflow.indexOf("pnpm --dir desktop test") < workflow.indexOf("pnpm --dir desktop package:mac:x64"));
  assert.match(workflow, /pnpm --dir desktop package:mac:x64/);
  assert.match(workflow, /AI-anime-\$\{app_version\}-macos-x64\.dmg/);
  assert.match(workflow, /AI-anime-\$\{app_version\}-macos-x64\.zip/);
  assert.match(workflow, /latest-mac\.yml/);
  assert.match(workflow, /SHA256SUMS-macos-x64\.txt/);
  assert.match(workflow, /pnpm --dir desktop release:manifest:mac:x64/);
  assert.match(workflow, /release-\$\{app_version\}-macos-x64\.json/);
  assert.match(workflow, /steps\.artifacts\.outputs\.manifest_path/);
  assert.equal((workflow.match(/"\$\{MANIFEST_PATH\}"/g) ?? []).length, 2);
  assert.match(workflow, /github\.ref_type != 'tag'/);
  assert.match(workflow, /gh release create "\$\{GITHUB_REF_NAME\}"/);
  assert.match(workflow, /--draft/);
});
