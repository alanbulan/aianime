import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const packageRoot = resolve(
  process.argv[2] || join(process.cwd(), "release", "win-unpacked"),
);
const resources = join(packageRoot, "resources");
const required = [
  join(resources, "backend", "ai-anime-backend.exe"),
  join(resources, "installer", "install-runtime-dependency.ps1"),
];
for (const path of required) {
  if (!existsSync(path)) {
    throw new Error(`packaged desktop resource missing: ${path}`);
  }
}

for (const path of [
  join(resources, "world-runtime"),
  join(resources, "splat-transform"),
]) {
  if (existsSync(path)) {
    throw new Error(`optional world runtime must not be bundled in the lightweight app: ${path}`);
  }
}

console.log("Lightweight packaged resources check passed; optional 3D runtime is external.");
