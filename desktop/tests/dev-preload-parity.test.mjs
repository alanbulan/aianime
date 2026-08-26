// Copyright (c) 2026 AI anime

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));

function commercialBridgeKeys(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  const start = normalized.indexOf("commercial: Object.freeze({");
  const end = normalized.indexOf("\n  }),\n});", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return [...normalized.slice(start, end).matchAll(/^\s{4}([A-Za-z]\w*):/gm)]
    .map((match) => match[1])
    .sort();
}

test("development preload exposes the production commercial bridge contract", () => {
  const production = readFileSync(`${desktopRoot}/src/preload.cts`, "utf8");
  const development = readFileSync(`${desktopRoot}/scripts/dev-preload.cjs`, "utf8");

  assert.deepEqual(
    commercialBridgeKeys(development),
    commercialBridgeKeys(production),
  );
});

test("development main process handles the clipboard bridge contract", () => {
  const production = readFileSync(`${desktopRoot}/src/main.ts`, "utf8");
  const development = readFileSync(`${desktopRoot}/scripts/dev.mjs`, "utf8");

  for (const source of [production, development]) {
    assert.match(source, /writeText:\s*"desktop:clipboard:write-text"/);
    assert.match(
      source,
      /ipcMain\.handle\(CLIPBOARD_CHANNELS\.writeText,\s*\(event, value[^)]*\)\s*=>/,
    );
    assert.match(source, /clipboard\.writeText\(value\)/);
  }
});

test("development main process defaults to the production user data directory", () => {
  const development = readFileSync(`${desktopRoot}/scripts/dev.mjs`, "utf8");

  assert.match(
    development,
    /join\(app\.getPath\("appData"\), "@ai-anime", "desktop"\)/,
  );
  assert.match(development, /app\.setPath\("userData", developmentUserData\)/);
});

test("development and packaged main processes share routing and runtime contracts", () => {
  const production = readFileSync(`${desktopRoot}/src/main.ts`, "utf8");
  const development = readFileSync(`${desktopRoot}/scripts/dev.mjs`, "utf8");

  for (const source of [production, development]) {
    assert.match(source, /modelAssignments:\s*modelRoutingSnapshot\(routing\)/);
    assert.match(source, /platform:\s*commercialPlatform\(\)/);
    assert.match(source, /arch:\s*commercialArchitecture\(\)/);
    assert.match(source, /desktopSessionCookie\(origin,/);
    assert.match(source, /isAllowedExternalUrl\(url\)/);
    assert.match(source, /isSameOrigin\(url,/);
  }
});
