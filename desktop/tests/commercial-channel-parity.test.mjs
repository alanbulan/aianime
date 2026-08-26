// Copyright (c) 2026 AI anime

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));

function commercialChannels(source) {
  const match = source.match(
    /(?:export\s+)?const COMMERCIAL_CHANNELS\s*=\s*\{([\s\S]*?)\}\s*(?:as const)?;/,
  );
  assert.ok(match, "COMMERCIAL_CHANNELS declaration is missing");
  return Object.fromEntries(
    [...match[1].matchAll(/^\s*([A-Za-z]\w*):\s*"([^"]+)",?$/gm)].map(
      ([, key, value]) => [key, value],
    ),
  );
}

test("commercial IPC channel contracts stay aligned across main and preload boundaries", () => {
  const mainProcess = commercialChannels(
    readFileSync(`${desktopRoot}/src/commercial-ipc.ts`, "utf8"),
  );
  const productionPreload = commercialChannels(
    readFileSync(`${desktopRoot}/src/preload.cts`, "utf8"),
  );
  const developmentPreload = commercialChannels(
    readFileSync(`${desktopRoot}/scripts/dev-preload.cjs`, "utf8"),
  );

  assert.deepEqual(productionPreload, mainProcess);
  assert.deepEqual(developmentPreload, mainProcess);
});
