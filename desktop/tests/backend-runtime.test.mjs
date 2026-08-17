import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("desktop backend packages graph runtime resources and enforces UTF-8 output", async () => {
  const spec = await readFile(
    new URL("../backend/ai_anime_backend.spec", import.meta.url),
    "utf8",
  );
  const entrypoint = await readFile(
    new URL("../backend/entrypoint.py", import.meta.url),
    "utf8",
  );
  const worldSpec = await readFile(
    new URL("../backend/ai_anime_world_runtime.spec", import.meta.url),
    "utf8",
  );
  const worldEntrypoint = await readFile(
    new URL("../backend/world_runtime_entrypoint.py", import.meta.url),
    "utf8",
  );
  const backendSource = await readFile(
    new URL("../src/backend.ts", import.meta.url),
    "utf8",
  );
  const workerRuntime = await readFile(
    new URL(
      "../../src/ai_anime/modules/asset_world/infrastructure/director_world/worker_runtime.py",
      import.meta.url,
    ),
    "utf8",
  );
  const desktopPackage = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const builderConfig = await readFile(
    new URL("../electron-builder.yml", import.meta.url),
    "utf8",
  );
  const installerInclude = await readFile(
    new URL("../build/installer.nsh", import.meta.url),
    "utf8",
  );
  const installerScriptBytes = await readFile(
    new URL("../scripts/install-runtime-dependency.ps1", import.meta.url),
  );
  const installerScript = installerScriptBytes.toString("utf8");
  const runtimePackager = await readFile(
    new URL("../scripts/package-world-runtime.mjs", import.meta.url),
    "utf8",
  );
  const runtimeVersions = JSON.parse(
    await readFile(new URL("../runtime-version.json", import.meta.url), "utf8"),
  );

  assert.match(spec, /collect_data_files\(\s*"cognee",\s*include_py_files=False,/);
  assert.match(spec, /"\.cognee_system\/\*\*"/);
  assert.match(spec, /"tests\/\*\*"/);
  assert.match(spec, /includes=\["alembic\/\*\*\/\*\.py"\]/);
  assert.match(spec, /collect_submodules\("ladybug"\)/);
  assert.match(entrypoint, /--runtime-smoke-check/);
  assert.match(entrypoint, /dispatch_internal_worker/);
  assert.match(workerRuntime, /"scene-360-builder"/);
  assert.match(workerRuntime, /"scene-overlap-analyzer"/);
  assert.match(workerRuntime, /"scene-spatial-contract"/);
  assert.match(workerRuntime, /"block-world-builder"/);
  assert.match(workerRuntime, /"--internal-worker"/);
  assert.match(entrypoint, /from ladybug import Connection, Database/);
  assert.match(entrypoint, /_install_ladybug_windows_path_compatibility/);
  assert.match(entrypoint, /"中文项目" \/ "graph\.lbug"/);
  assert.match(entrypoint, /"ladybug_unicode_path": unicode_database_created/);
  assert.match(entrypoint, /from cognee\.infrastructure\.llm\.prompts import render_prompt/);
  assert.match(entrypoint, /for prompt_file in prompt_files/);
  assert.match(entrypoint, /cognee_root \/ "alembic" \/ "versions"/);
  assert.match(entrypoint, /import litellm\.containers/);
  assert.match(entrypoint, /containers_root \/ "endpoints\.json"/);
  assert.match(entrypoint, /reconfigure\(encoding="utf-8", errors="backslashreplace"\)/);
  assert.match(backendSource, /PYTHONIOENCODING: "utf-8"/);
  assert.match(backendSource, /PYTHONUTF8: "1"/);
  assert.match(backendSource, /AI_ANIME_WORLD_RUNTIME_BIN/);
  assert.match(worldSpec, /collect_submodules\("safetensors"\)/);
  assert.match(worldSpec, /copy_metadata\("safetensors"\)/);
  assert.match(worldEntrypoint, /import safetensors/);
  assert.match(worldEntrypoint, /hasattr\(hub_mixin, "safetensors"\)/);
  assert.match(desktopPackage.scripts["build:backend"], /smoke-backend-runtime\.mjs/);
  assert.match(
    desktopPackage.scripts["build:world-runtime"],
    /smoke-world-runtime\.mjs/,
  );
  assert.doesNotMatch(desktopPackage.scripts["package:prepare"], /build:world-runtime/);
  assert.match(desktopPackage.scripts["package:world-runtime"], /build:world-runtime/);
  assert.match(desktopPackage.scripts["package:world-runtime"], /package-world-runtime\.mjs/);
  assert.doesNotMatch(builderConfig, /from: world-runtime-dist/);
  assert.doesNotMatch(builderConfig, /to: splat-transform/);
  assert.match(builderConfig, /include: build\/installer\.nsh/);
  assert.match(installerInclude, /customPageAfterChangeDir/);
  assert.match(installerInclude, /install-runtime-dependency\.ps1/);
  assert.match(installerInclude, /runtime-dependency-install\.log/);
  assert.deepEqual([...installerScriptBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(installerScript, /Invoke-NativeCommandCapture/);
  assert.match(installerScript, /NativeCommandError/);
  assert.match(installerScript, /Start-Transcript/);
  assert.match(String(runtimeVersions.world), /^\d+\.\d+\.\d+$/u);
  assert.match(runtimePackager, /runtime-version\.json/);
  assert.doesNotMatch(runtimePackager, /package\.json/);
});

test(
  "runtime dependency installer parses in Windows PowerShell 5.1",
  { skip: process.platform !== "win32" },
  () => {
    const powershell = join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const scriptPath = fileURLToPath(
      new URL("../scripts/install-runtime-dependency.ps1", import.meta.url),
    );
    const command = [
      "$tokens = $null",
      "$errors = $null",
      "[void][System.Management.Automation.Language.Parser]::ParseFile($env:AI_ANIME_INSTALLER_SCRIPT_PATH, [ref]$tokens, [ref]$errors)",
      "if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }",
    ].join("; ");
    const result = spawnSync(
      powershell,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AI_ANIME_INSTALLER_SCRIPT_PATH: scriptPath,
        },
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
  },
);
