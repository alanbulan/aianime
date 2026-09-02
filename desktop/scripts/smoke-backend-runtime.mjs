import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const executableName = process.platform === "win32" ? "ai-anime-backend.exe" : "ai-anime-backend";
const executable = join(
  process.cwd(),
  "backend-dist",
  "ai-anime-backend",
  executableName,
);

if (!existsSync(executable)) {
  throw new Error(`packaged backend not found: ${executable}`);
}

const result = spawnSync(executable, ["--runtime-smoke-check"], {
  encoding: "utf8",
  env: {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
  },
  timeout: 300_000,
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(
    `packaged backend smoke check failed (${String(result.status)}): ${result.stderr || result.stdout}`,
  );
}

const marker = "AI_ANIME_BACKEND_SMOKE ";
const line = String(result.stdout || "")
  .split(/\r?\n/u)
  .find((entry) => entry.startsWith(marker));
if (!line) {
  throw new Error(`packaged backend smoke marker missing: ${result.stdout}`);
}

const payload = JSON.parse(line.slice(marker.length));
if (
  payload.ok !== true ||
  payload.ladybug !== true ||
  payload.ladybug_unicode_path !== true ||
  payload.unicode !== "中文 ⚠" ||
  payload.litellm_resources !== true ||
  payload.cognee_prompts !== true ||
  payload.prompt_count < 50 ||
  payload.cognee_migrations !== true ||
  payload.migration_count < 20
) {
  throw new Error(`packaged backend smoke payload invalid: ${line}`);
}

const packagedWorkers = [
  ["scene-360-builder", "--scene-name"],
  ["scene-overlap-analyzer", "--master"],
  ["scene-spatial-contract", "--overlap-analysis"],
  ["block-world-builder", "--description"],
];
for (const [workerName, expectedOption] of packagedWorkers) {
  const worker = spawnSync(
    executable,
    ["--internal-worker", workerName, "--help"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
      timeout: 60_000,
      windowsHide: true,
    },
  );
  const workerOutput = `${worker.stdout || ""}\n${worker.stderr || ""}`;
  if (worker.error || worker.status !== 0 || !workerOutput.includes(expectedOption)) {
    if (worker.error) throw worker.error;
    throw new Error(
      `packaged worker dispatch failed for ${workerName} (${String(worker.status)}): ${workerOutput}`,
    );
  }
  if (workerOutput.includes("--data-root")) {
    throw new Error(`packaged worker ${workerName} was routed to the API server entrypoint`);
  }
}

console.log(
  `Packaged backend Ladybug/Cognee/UTF-8/worker smoke check passed (${payload.prompt_count} prompts, ${payload.migration_count} migrations, ${packagedWorkers.length} workers).`,
);
