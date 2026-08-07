import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDirectory = fileURLToPath(new URL(".", import.meta.url));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: scriptsDirectory,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`FFmpeg preparation failed with exit code ${result.status}`);
  }
}

if (process.platform === "win32") {
  run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "fetch-ffmpeg.ps1",
  ]);
} else if (process.platform === "darwin") {
  run("/bin/bash", ["fetch-ffmpeg-macos.sh"]);
} else {
  throw new Error(`Desktop FFmpeg packaging is unsupported on ${process.platform}`);
}
