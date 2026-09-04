// Copyright (c) 2026 AI anime

import { rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distPath = resolve(frontendRoot, "dist");

if (dirname(distPath) !== frontendRoot || basename(distPath) !== "dist") {
  throw new Error(`refusing to clean unexpected frontend output path: ${distPath}`);
}

await rm(distPath, { recursive: true, force: true });
