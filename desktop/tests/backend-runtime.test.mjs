import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LocalBackend,
  MAX_BACKEND_RESTART_ATTEMPTS,
  backendRestartDelayMs,
  terminateBackendProcessTree,
} from "../src/backend.ts";
import { COMMERCIAL_GATEWAY_URL } from "../src/commercial-api-client.ts";

const testDesktopApp = {
  isPackaged: false,
  getAppPath: () => "C:\\repo\\desktop",
  getPath: () => "C:\\user-data",
};

test("backend restart backoff is bounded at ten seconds", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 20].map(backendRestartDelayMs),
    [500, 1_000, 2_000, 4_000, 8_000, 10_000, 10_000, 10_000],
  );
});

test("backend Windows cleanup force-terminates the complete process tree", () => {
  const invocations = [];
  const killer = new EventEmitter();
  let fallbackKills = 0;
  const child = {
    exitCode: null,
    pid: 4321,
    kill: () => {
      fallbackKills += 1;
    },
  };

  terminateBackendProcessTree(
    child,
    "win32",
    (command, args, options) => {
      invocations.push({ command, args, options });
      return killer;
    },
  );

  assert.deepEqual(invocations, [
    {
      command: "taskkill",
      args: ["/PID", "4321", "/T", "/F"],
      options: { windowsHide: true, stdio: "ignore" },
    },
  ]);
  assert.equal(fallbackKills, 0);
  killer.emit("exit", 0);
  assert.equal(fallbackKills, 1);
});

test("backend POSIX cleanup terminates the detached process group", () => {
  const signals = [];
  let directKills = 0;
  const child = {
    exitCode: 1,
    pid: 4321,
    kill: () => {
      directKills += 1;
    },
  };

  terminateBackendProcessTree(
    child,
    "darwin",
    undefined,
    (pid, signal) => {
      signals.push({ pid, signal });
      return true;
    },
  );

  assert.deepEqual(signals, [{ pid: -4321, signal: "SIGTERM" }]);
  assert.equal(directKills, 0);
});

test("backend stops retrying and reports an exhausted restart budget", () => {
  const reported = [];
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    const backend = new LocalBackend({
      desktopApp: testDesktopApp,
      restartOnUnexpectedExit: true,
      onRestartExhausted: (error) => reported.push(error),
    });
    backend.restartAttempts = MAX_BACKEND_RESTART_ATTEMPTS;

    backend.scheduleRestart(new Error("startup failed"));

    assert.equal(backend.restartTimer, null);
    assert.equal(reported.length, 1);
    assert.match(reported[0].message, /5 restart attempts/);
    assert.match(reported[0].message, /startup failed/);
  } finally {
    console.error = originalConsoleError;
  }
});

test("backend health watchdog terminates only after three consecutive failures", async () => {
  let healthRequests = 0;
  let terminations = 0;
  const backend = new LocalBackend({
    desktopApp: testDesktopApp,
    fetchImpl: async () => {
      healthRequests += 1;
      return new Response(null, { status: 503 });
    },
  });
  const child = { exitCode: null };
  backend.child = child;
  backend.readyChild = child;
  backend.healthCheckChild = child;
  backend._baseUrl = "http://127.0.0.1:43123";
  backend.terminateChildTree = (target) => {
    assert.equal(target, child);
    terminations += 1;
  };

  try {
    await backend.checkHealth(child);
    await backend.checkHealth(child);
    assert.equal(terminations, 0);
    await backend.checkHealth(child);

    assert.equal(healthRequests, 3);
    assert.equal(backend.healthCheckFailures, 3);
    assert.equal(terminations, 1);
  } finally {
    backend.stopHealthWatchdog();
  }
});

test("backend health watchdog resets on recovery and ignores replaced children", async () => {
  const statuses = [503, 200];
  let healthRequests = 0;
  const backend = new LocalBackend({
    desktopApp: testDesktopApp,
    fetchImpl: async () => {
      healthRequests += 1;
      return new Response(null, { status: statuses.shift() ?? 200 });
    },
  });
  const child = { exitCode: null };
  backend.child = child;
  backend.readyChild = child;
  backend.healthCheckChild = child;
  backend._baseUrl = "http://127.0.0.1:43123";

  try {
    await backend.checkHealth(child);
    assert.equal(backend.healthCheckFailures, 1);
    await backend.checkHealth(child);
    assert.equal(backend.healthCheckFailures, 0);

    backend.readyChild = { exitCode: null };
    await backend.checkHealth(child);
    assert.equal(healthRequests, 2);
  } finally {
    backend.stopHealthWatchdog();
  }
});

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
  const backendSmoke = await readFile(
    new URL("../scripts/smoke-backend-runtime.mjs", import.meta.url),
    "utf8",
  );
  const workerRuntime = await readFile(
    new URL(
      "../../src/ai_anime/modules/asset_world/infrastructure/director_world/worker_runtime.py",
      import.meta.url,
    ),
    "utf8",
  );
  const nativeTaskIsolation = await readFile(
    new URL(
      "../../src/ai_anime/modules/task_execution/infrastructure/native_task_isolation.py",
      import.meta.url,
    ),
    "utf8",
  );
  const internalWorkers = await readFile(
    new URL(
      "../../src/ai_anime/shared/infrastructure/internal_workers.py",
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
  assert.doesNotMatch(workerRuntime, /native-project-task/);
  assert.match(nativeTaskIsolation, /"native-project-task"/);
  assert.match(entrypoint, /DIRECTOR_WORLD_WORKERS/);
  assert.match(entrypoint, /NATIVE_PROJECT_TASK_WORKER/);
  assert.doesNotMatch(entrypoint, /dispatch_native_project_task_worker/);
  assert.match(internalWorkers, /"--internal-worker"/);
  assert.match(entrypoint, /from ladybug import Connection, Database/);
  assert.match(entrypoint, /_install_ladybug_windows_path_compatibility/);
  assert.match(entrypoint, /"中文项目" \/ "graph\.lbug"/);
  assert.match(entrypoint, /"ladybug_unicode_path": unicode_database_created/);
  assert.match(entrypoint, /from cognee\.infrastructure\.llm\.prompts import render_prompt/);
  assert.match(entrypoint, /for prompt_file in prompt_files/);
  assert.match(entrypoint, /prompt_environment\.get_template\(prompt_file\.name\)/);
  assert.match(entrypoint, /render_prompt\("extract_entities_user\.txt", \{"text": probe_text\}\)/);
  assert.doesNotMatch(entrypoint, /render_prompt\(prompt_file\.name, \{\}\)/);
  assert.match(entrypoint, /cognee_root \/ "alembic" \/ "versions"/);
  assert.match(entrypoint, /import litellm\.containers/);
  assert.match(entrypoint, /containers_root \/ "endpoints\.json"/);
  assert.match(entrypoint, /reconfigure\(encoding="utf-8", errors="backslashreplace"\)/);
  assert.match(backendSource, /PYTHONIOENCODING: "utf-8"/);
  assert.match(backendSource, /PYTHONUTF8: "1"/);
  assert.match(backendSource, /AI_ANIME_WORLD_RUNTIME_BIN/);
  assert.match(backendSource, /startHealthWatchdog\(child\)/);
  assert.match(backendSource, /HEALTH_CHECK_FAILURE_THRESHOLD = 3/);
  assert.match(backendSource, /backend health watchdog terminating unresponsive process/);
  assert.match(backendSource, /\["\/PID", String\(child\.pid\), "\/T", "\/F"\]/);
  assert.match(worldSpec, /collect_submodules\("safetensors"\)/);
  assert.match(worldSpec, /copy_metadata\("safetensors"\)/);
  assert.match(worldEntrypoint, /import safetensors/);
  assert.match(worldEntrypoint, /hasattr\(hub_mixin, "safetensors"\)/);
  assert.match(desktopPackage.scripts["build:backend"], /smoke-backend-runtime\.mjs/);
  assert.doesNotMatch(backendSmoke, /splat-transform/);
  assert.match(desktopPackage.scripts["build:main"], /clean-main-dist\.mjs/);
  assert.match(
    desktopPackage.scripts["build:world-runtime"],
    /smoke-world-runtime\.mjs/,
  );
  assert.doesNotMatch(desktopPackage.scripts["package:prepare"], /build:world-runtime/);
  assert.match(desktopPackage.scripts["package:world-runtime"], /build:world-runtime/);
  assert.match(desktopPackage.scripts["package:world-runtime"], /package-world-runtime\.mjs/);
  assert.doesNotMatch(builderConfig, /from: world-runtime-dist/);
  assert.doesNotMatch(builderConfig, /to: splat-transform/);
  assert.match(builderConfig, /!\*\*\/\*\.map/);
  assert.match(builderConfig, /include: build\/installer\.nsh/);
  const updaterUrl = builderConfig.match(/^\s+url:\s+(\S+)$/m)?.[1];
  assert.ok(updaterUrl, "electron-builder publish URL is missing");
  assert.equal(
    new URL(updaterUrl).origin,
    new URL(COMMERCIAL_GATEWAY_URL).origin,
  );
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
  assert.match(runtimePackager, /"System32",\s*"tar\.exe"/u);
  assert.doesNotMatch(runtimePackager, /spawnSync\(\s*"tar"/u);
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
      "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
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

test(
  "runtime dependency installer validates the same manifest safety fields",
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
    const validate = (manifest) => {
      const command = [
        "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
        "$tokens = $null",
        "$errors = $null",
        "$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:AI_ANIME_INSTALLER_SCRIPT_PATH, [ref]$tokens, [ref]$errors)",
        "$definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Assert-RuntimeDependencyManifest' }, $true)",
        "if ($null -eq $definition) { exit 2 }",
        "Invoke-Expression $definition.Extent.Text",
        "$manifest = $env:AI_ANIME_TEST_MANIFEST | ConvertFrom-Json",
        "try { [void](Assert-RuntimeDependencyManifest -Manifest $manifest); exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }",
      ].join("; ");
      return spawnSync(
        powershell,
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            AI_ANIME_INSTALLER_SCRIPT_PATH: scriptPath,
            AI_ANIME_TEST_MANIFEST: JSON.stringify(manifest),
          },
        },
      );
    };
    const valid = {
      schemaVersion: 1,
      package: {
        id: "world",
        version: "1.0.0",
        platform: "win32",
        arch: "x64",
        archive: "tar.gz",
        sha256: "a".repeat(64),
        downloadSizeBytes: 1024,
        installedSizeBytes: 2048,
        urls: ["https://example.com/world.tar.gz"],
      },
    };

    assert.equal(validate(valid).status, 0);
    for (const invalid of [
      { ...valid, package: { ...valid.package, urls: [] } },
      {
        ...valid,
        package: {
          ...valid.package,
          urls: ["http://example.com/world.tar.gz"],
        },
      },
      { ...valid, package: { ...valid.package, downloadSizeBytes: 0 } },
    ]) {
      const result = validate(invalid);
      assert.equal(result.status, 1, result.stderr || result.stdout);
      assert.match(result.stderr, /运行环境清单字段不完整/);
    }
  },
);
