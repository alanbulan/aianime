import { createRequire } from "node:module";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeRoot = join(desktopRoot, "runtime", "splat-transform");
const runtimeModules = join(runtimeRoot, "node_modules");

function packageRootFromEntry(entry, expectedName) {
  let current = dirname(entry);
  while (true) {
    const packageFile = join(current, "package.json");
    try {
      const manifest = JSON.parse(readFileSync(packageFile, "utf8"));
      if (manifest.name === expectedName) return current;
    } catch {
      // Continue walking until the owning package is found.
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Unable to locate package root for ${expectedName}`);
}

const splatEntry = require.resolve("@playcanvas/splat-transform");
const splatRoot = packageRootFromEntry(
  splatEntry,
  "@playcanvas/splat-transform",
);
const splatRequire = createRequire(splatEntry);
const webgpuEntry = splatRequire.resolve("webgpu");
const webgpuRoot = packageRootFromEntry(webgpuEntry, "webgpu");

function copyEntry(source, target) {
  const stats = statSync(source);
  if (!stats.isDirectory()) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    copyEntry(join(source, entry), join(target, entry));
  }
}

if (!runtimeRoot.startsWith(join(desktopRoot, "runtime"))) {
  throw new Error(`Refusing to replace unexpected runtime path: ${runtimeRoot}`);
}
rmSync(runtimeRoot, { recursive: true, force: true });
mkdirSync(join(runtimeModules, "@playcanvas"), { recursive: true });
const splatTarget = join(runtimeModules, "@playcanvas", "splat-transform");
const webgpuTarget = join(runtimeModules, "webgpu");
mkdirSync(splatTarget, { recursive: true });
mkdirSync(webgpuTarget, { recursive: true });

for (const entry of ["bin", "dist", "lib", "package.json", "LICENSE", "README.md"]) {
  copyEntry(join(splatRoot, entry), join(splatTarget, entry));
}
for (const entry of ["dist", "index.js", "package.json", "types.d.ts"]) {
  copyEntry(join(webgpuRoot, entry), join(webgpuTarget, entry));
}

const nodeTarget = join(runtimeRoot, process.platform === "win32" ? "node.exe" : "node");
copyFileSync(process.execPath, nodeTarget);
const nodeLicense = join(dirname(process.execPath), "LICENSE");
try {
  copyFileSync(nodeLicense, join(runtimeRoot, "NODE-LICENSE"));
} catch {
  throw new Error(`Unable to bundle the Node.js license from ${nodeLicense}`);
}

const cliTarget = join(splatTarget, "bin", "cli.mjs");
const smoke = spawnSync(nodeTarget, [cliTarget, "--help"], {
  encoding: "utf8",
  timeout: 60_000,
  windowsHide: true,
});
if (smoke.error) throw smoke.error;
if (smoke.status !== 0 || !String(smoke.stdout).includes("Transform and Filter Gaussian Splats")) {
  throw new Error(
    `Bundled splat-transform runtime smoke check failed (${String(smoke.status)}): ${smoke.stderr || smoke.stdout}`,
  );
}

console.log(`Prepared splat-transform runtime at ${runtimeRoot}`);
