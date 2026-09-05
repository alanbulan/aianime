import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
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

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("electron-builder"));
const appBuilderRequire = createRequire(builderRequire.resolve("app-builder-lib"));
const { extractFile } = appBuilderRequire("@electron/asar");
const archive = join(resources, "app.asar");
const sourcePackage = JSON.parse(readFileSync(join(desktopRoot, "package.json"), "utf8"));
const packagedPackage = JSON.parse(extractFile(archive, "package.json").toString("utf8"));
if (packagedPackage.version !== sourcePackage.version) {
  throw new Error("packaged application version differs from the current source");
}
for (const name of [
  "main", "commercial-api-client", "runtime-dependency-manifest", "runtime-dependencies",
  "verified-file-runtime-dependency", "world-models-runtime-dependency", "matte-runtime-dependency",
]) {
  const relativePath = `dist/${name}.js`;
  if (!extractFile(archive, relativePath).equals(readFileSync(join(desktopRoot, relativePath)))) {
    throw new Error(`packaged runtime dependency code is stale: ${relativePath}`);
  }
}
if (!readFileSync(join(resources, "installer", "install-runtime-dependency.ps1"))
  .equals(readFileSync(join(desktopRoot, "scripts", "install-runtime-dependency.ps1")))) {
  throw new Error("packaged Windows dependency installer is stale");
}

console.log(`Packaged ${sourcePackage.version} runtime dependency code and installer match the current build; optional 3D runtime is external.`);
