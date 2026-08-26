import { rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
const distPath = resolve(desktopRoot, "dist");

if (dirname(distPath) !== desktopRoot || basename(distPath) !== "dist") {
  throw new Error(`refusing to clean unexpected main output path: ${distPath}`);
}

await rm(distPath, { recursive: true, force: true });
