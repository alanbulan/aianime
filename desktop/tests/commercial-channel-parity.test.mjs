// Copyright (c) 2026 AI anime

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));

function channelMap(source, name) {
  const match = source.match(
    new RegExp(
      `(?:export\\s+)?const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*(?:as const)?;`,
    ),
  );
  assert.ok(match, `${name} declaration is missing`);
  const entries =
    [...match[1].matchAll(/^\s*([A-Za-z]\w*):\s*"([^"]+)",?$/gm)].map(
      ([, key, value]) => [key, value],
    );
  assert.ok(entries.length > 0, `${name} declaration has no parsed entries`);
  return Object.fromEntries(entries);
}

test("commercial IPC channel contracts stay aligned across main and preload boundaries", () => {
  const mainProcess = channelMap(
    readFileSync(`${desktopRoot}/src/commercial-ipc.ts`, "utf8"),
    "COMMERCIAL_CHANNELS",
  );
  const productionPreload = channelMap(
    readFileSync(`${desktopRoot}/src/preload.cts`, "utf8"),
    "COMMERCIAL_CHANNELS",
  );
  const developmentPreload = channelMap(
    readFileSync(`${desktopRoot}/scripts/dev-preload.cjs`, "utf8"),
    "COMMERCIAL_CHANNELS",
  );

  assert.deepEqual(productionPreload, mainProcess);
  assert.deepEqual(developmentPreload, mainProcess);
});

test("window and clipboard channels stay aligned in both desktop modes", () => {
  const productionMain = readFileSync(`${desktopRoot}/src/main.ts`, "utf8");
  const developmentMain = readFileSync(`${desktopRoot}/scripts/dev.mjs`, "utf8");
  const productionPreload = readFileSync(`${desktopRoot}/src/preload.cts`, "utf8");
  const developmentPreload = readFileSync(
    `${desktopRoot}/scripts/dev-preload.cjs`,
    "utf8",
  );

  for (const name of ["WINDOW_CHANNELS", "CLIPBOARD_CHANNELS"]) {
    const expected = channelMap(productionMain, name);
    assert.deepEqual(channelMap(developmentMain, name), expected);
    assert.deepEqual(channelMap(productionPreload, name), expected);
    assert.deepEqual(channelMap(developmentPreload, name), expected);
  }
});

test("runtime dependency channels stay aligned across main and preload boundaries", () => {
  const expected = channelMap(
    readFileSync(`${desktopRoot}/src/runtime-dependencies.ts`, "utf8"),
    "RUNTIME_DEPENDENCY_CHANNELS",
  );
  assert.deepEqual(
    channelMap(
      readFileSync(`${desktopRoot}/src/preload.cts`, "utf8"),
      "RUNTIME_DEPENDENCY_CHANNELS",
    ),
    expected,
  );
  assert.deepEqual(
    channelMap(
      readFileSync(`${desktopRoot}/scripts/dev-preload.cjs`, "utf8"),
      "RUNTIME_DEPENDENCY_CHANNELS",
    ),
    expected,
  );
});
