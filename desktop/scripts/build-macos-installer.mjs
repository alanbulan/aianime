import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));

function executeBuilder(args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn("pnpm", ["exec", "electron-builder", ...args], {
      cwd: desktopRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on("data", (data) => {
        destination.write(data);
        output = (output + data.toString()).slice(-131072);
      });
    }
    child.on("error", reject);
    child.on("close", (code, signal) => resolveResult({ code, signal, output }));
  });
}

export async function buildMacosInstaller(arch, {
  execute = executeBuilder,
  wait = setTimeout,
  checkApp = access,
  root = desktopRoot,
} = {}) {
  if (!["x64", "arm64"].includes(arch)) throw new Error(`Unsupported macOS architecture: ${arch}`);
  const args = ["--mac", "dmg", "zip", `--${arch}`, "--publish", "never"];
  if (arch === "x64") args.push("--config", "electron-builder.macos-intel.yml");
  const app = resolve(root, "release", arch === "x64" ? "mac" : "mac-arm64", "AI anime.app");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await execute(attempt === 1 ? args : [...args, "--prepackaged", app]);
    if (result.code === 0) return;
    // dmgbuild already attempts forced cleanup before reporting this error.
    // Retry only its transient detach failure, without rebuilding native runtimes.
    const busyDmg = /DMGError: Unable to detach device cleanly:[^\r\n]*Resource busy/.test(result.output);
    if (!busyDmg || result.signal || attempt === 3) {
      throw new Error(`macOS installer failed (attempt ${attempt}, exit ${result.code}, signal ${result.signal ?? "none"})`);
    }
    await checkApp(resolve(app, "Contents/MacOS/AI anime"));
    console.warn(`DMG volume was busy; retrying installers from the existing app (${attempt}/2).`);
    await wait(attempt * 10_000);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arch = process.argv[2]?.replace(/^--/, "");
  if (process.platform !== "darwin" || process.arch !== arch) {
    throw new Error(`macOS installer requires native darwin/${arch}`);
  }
  await buildMacosInstaller(arch);
}
