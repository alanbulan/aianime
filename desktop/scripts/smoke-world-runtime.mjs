import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const executableName =
  process.platform === "win32"
    ? "ai-anime-world-runtime.exe"
    : "ai-anime-world-runtime";
const executable = join(
  process.cwd(),
  "world-runtime-dist",
  "ai-anime-world-runtime",
  executableName,
);

if (!existsSync(executable)) {
  throw new Error(`packaged world runtime not found: ${executable}`);
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
    `packaged world runtime smoke check failed (${String(result.status)}): ${result.stderr || result.stdout}`,
  );
}

const marker = "AI_ANIME_WORLD_RUNTIME_SMOKE ";
const line = String(result.stdout || "")
  .split(/\r?\n/u)
  .find((entry) => entry.startsWith(marker));
if (!line) {
  throw new Error(`packaged world runtime smoke marker missing: ${result.stdout}`);
}
const payload = JSON.parse(line.slice(marker.length));
if (
  payload.ok !== true ||
  payload.unicode !== "导演世界 中文 ⚠" ||
  payload.sharp !== true ||
  typeof payload.safetensors !== "string" ||
  payload.safetensors.length === 0 ||
  typeof payload.torch !== "string" ||
  payload.torch.length === 0 ||
  typeof payload.torchvision !== "string" ||
  payload.torchvision.length === 0 ||
  (process.platform === "win32" &&
    (typeof payload.cuda_compiled !== "string" ||
      payload.cuda_compiled.length === 0)) ||
  payload.plyfile !== true ||
  payload.da2 !== true
) {
  throw new Error(`packaged world runtime smoke payload invalid: ${line}`);
}

const help = spawnSync(executable, ["--help"], {
  encoding: "utf8",
  timeout: 120_000,
  windowsHide: true,
});
if (help.error) throw help.error;
if (help.status !== 0 || !String(help.stdout).includes("--geometry-mode")) {
  throw new Error(
    `packaged world runtime CLI failed (${String(help.status)}): ${help.stderr || help.stdout}`,
  );
}

console.log(
  `Packaged SHARP/DA-2 world runtime smoke check passed (torch ${payload.torch}, torchvision ${payload.torchvision}, safetensors ${payload.safetensors}, CUDA ${payload.cuda_compiled || "not compiled"}, device ${payload.cuda_device || "CPU"}).`,
);
