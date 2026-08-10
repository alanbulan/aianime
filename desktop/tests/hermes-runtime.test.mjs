import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  BUNDLED_HERMES_AGENT_VERSION,
  developmentHermesCliPath,
  packagedHermesCliPath,
  resolveHermesRuntimePaths,
} from "../src/hermes-runtime.ts";

test("Hermes runtime version stays pinned to the isolated project", () => {
  assert.equal(BUNDLED_HERMES_AGENT_VERSION, "0.19.0");
});

test("development and packaged Hermes paths are deterministic", () => {
  assert.equal(
    developmentHermesCliPath("C:\\repo", "win32"),
    "C:\\repo\\desktop\\hermes-runtime\\.venv\\Scripts\\hermes.exe",
  );
  assert.equal(
    packagedHermesCliPath("C:\\resources", "win32"),
    "C:\\resources\\hermes\\hermes-acp\\hermes-acp.exe",
  );
});

test("runtime resolution requires both the ACP binary and managed assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-anime-hermes-"));
  const repositoryRoot = join(root, "repo");
  const platform = process.platform;
  const cliPath = developmentHermesCliPath(repositoryRoot, platform);
  const assetsPath = join(repositoryRoot, ".hermes");
  try {
    await mkdir(dirname(cliPath), { recursive: true });
    await writeFile(cliPath, "runtime");
    await mkdir(assetsPath, { recursive: true });
    assert.deepEqual(
      resolveHermesRuntimePaths({
        packaged: false,
        repositoryRoot,
        resourcesPath: root,
        platform,
      }),
      { cliPath, assetsPath },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop packaging pins and bundles the isolated Hermes runtime", async () => {
  const runtimeProject = await readFile(
    new URL("../hermes-runtime/pyproject.toml", import.meta.url),
    "utf8",
  );
  const runtimeLock = await readFile(
    new URL("../hermes-runtime/uv.lock", import.meta.url),
    "utf8",
  );
  const mainProject = await readFile(
    new URL("../../pyproject.toml", import.meta.url),
    "utf8",
  );
  const builderConfig = await readFile(
    new URL("../electron-builder.yml", import.meta.url),
    "utf8",
  );
  const backendSource = await readFile(
    new URL("../src/backend.ts", import.meta.url),
    "utf8",
  );
  const developmentSource = await readFile(
    new URL("../scripts/dev.mjs", import.meta.url),
    "utf8",
  );
  const runtimeEntrypoint = await readFile(
    new URL("../hermes-runtime/hermes_acp.py", import.meta.url),
    "utf8",
  );
  const runtimeSpec = await readFile(
    new URL("../hermes-runtime/hermes_acp.spec", import.meta.url),
    "utf8",
  );
  const desktopPackage = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.match(runtimeProject, /hermes-agent\[acp\]==0\.19\.0/);
  assert.match(runtimeLock, /name = "hermes-agent"\r?\nversion = "0\.19\.0"/);
  assert.match(
    runtimeLock,
    /name = "agent-client-protocol"\r?\nversion = "0\.9\.0"/,
  );
  assert.match(runtimeLock, /name = "openai"\r?\nversion = "2\.24\.0"/);
  assert.doesNotMatch(mainProject, /hermes-agent/);
  assert.match(builderConfig, /hermes-runtime\/dist\/hermes-acp/);
  assert.match(builderConfig, /\.\.\/\.hermes/);
  assert.match(desktopPackage.scripts["build:hermes"], /--locked/);
  assert.match(desktopPackage.scripts["runtime:hermes"], /uv sync/);
  assert.equal(desktopPackage.scripts.dev, "electron scripts/dev-entry.mjs");
  assert.match(developmentSource, /await prepareHermesRuntime\(\)/);
  assert.match(developmentSource, /\["sync", "--project", HERMES_RUNTIME_ROOT, "--locked", "--no-dev"\]/);
  assert.doesNotMatch(backendSource, /AI_ANIME_CHAT_BACKEND/);
  assert.doesNotMatch(backendSource, /process\.env\.HERMES_CLI_PATH/);
  assert.match(runtimeEntrypoint, /from acp_adapter\.entry import main/);
  assert.match(runtimeEntrypoint, /args\[:1\] == \["acp"\]/);
  assert.match(runtimeSpec, /copy_metadata\("hermes-agent"\)/);
});
