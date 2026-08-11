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
  timeout: 60_000,
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
  payload.unicode !== "中文 ⚠" ||
  payload.litellm_resources !== true ||
  payload.cognee_prompts !== true ||
  payload.prompt_count < 50 ||
  payload.cognee_migrations !== true ||
  payload.migration_count < 20
) {
  throw new Error(`packaged backend smoke payload invalid: ${line}`);
}

console.log(
  `Packaged backend Ladybug/Cognee/UTF-8 smoke check passed (${payload.prompt_count} prompts, ${payload.migration_count} migrations).`,
);
