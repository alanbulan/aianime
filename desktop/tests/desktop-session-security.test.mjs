// Copyright (c) 2026 AI anime

import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";

import { installDesktopSessionSecurity } from "../src/desktop-session-security.ts";

function createPermissionHarness(additionalConnectSources = []) {
  let checkPermission;
  let requestPermission;
  let receiveHeaders;
  const targetSession = {
    webRequest: {
      onBeforeSendHeaders() {},
      onHeadersReceived(_filter, handler) {
        receiveHeaders = handler;
      },
    },
    setPermissionCheckHandler(handler) {
      checkPermission = handler;
    },
    setPermissionRequestHandler(handler) {
      requestPermission = handler;
    },
  };
  const window = {
    isDestroyed: () => false,
    webContents: { id: 42 },
  };

  installDesktopSessionSecurity({
    targetSession,
    backend: {
      baseUrl: "http://127.0.0.1:18080",
      tokenHeader: "X-Desktop-Token",
      token: "test-token",
    },
    rendererOrigin: "http://127.0.0.1:5173",
    getMainWindow: () => window,
    additionalConnectSources,
  });

  return { checkPermission, requestPermission, receiveHeaders };
}

function requestDecision(handler, permission, details, senderId = 42) {
  let decision;
  handler({ id: senderId }, permission, (allowed) => {
    decision = allowed;
  }, details);
  return decision;
}

test("trusted renderer may use application fullscreen and audio capture", () => {
  const { checkPermission, requestPermission } = createPermissionHarness();
  const checkDetails = { isMainFrame: true, mediaType: "unknown" };

  assert.equal(
    checkPermission(
      { id: 42 },
      "automatic-fullscreen",
      "http://127.0.0.1:5173/workbench",
      checkDetails,
    ),
    true,
  );
  assert.equal(
    requestDecision(requestPermission, "fullscreen", {
      isMainFrame: true,
      requestingUrl: "http://127.0.0.1:5173/workbench",
    }),
    true,
  );
  assert.equal(
    requestDecision(requestPermission, "media", {
      isMainFrame: true,
      requestingUrl: "http://127.0.0.1:5173/workbench",
      mediaTypes: ["audio"],
    }),
    true,
  );
});

test("fullscreen remains blocked for subframes, other windows, and other origins", () => {
  const { checkPermission, requestPermission } = createPermissionHarness();

  assert.equal(
    checkPermission(
      { id: 42 },
      "automatic-fullscreen",
      "https://untrusted.example",
      { isMainFrame: true, mediaType: "unknown" },
    ),
    false,
  );
  assert.equal(
    requestDecision(
      requestPermission,
      "fullscreen",
      {
        isMainFrame: false,
        requestingUrl: "http://127.0.0.1:5173/workbench",
      },
      42,
    ),
    false,
  );
  assert.equal(
    requestDecision(
      requestPermission,
      "fullscreen",
      {
        isMainFrame: true,
        requestingUrl: "http://127.0.0.1:5173/workbench",
      },
      99,
    ),
    false,
  );
});

test("renderer content security policy keeps matte traffic local", () => {
  const { receiveHeaders } = createPermissionHarness();
  let response;
  receiveHeaders({ responseHeaders: {} }, (value) => {
    response = value;
  });

  const policy = response.responseHeaders["Content-Security-Policy"][0];
  assert.match(policy, /script-src [^;]*'wasm-unsafe-eval'/);
  assert.doesNotMatch(policy, /(?:^|\s)'unsafe-eval'(?:\s|;)/);
  assert.match(policy, /connect-src [^;]*blob:/);
  assert.doesNotMatch(policy, /huggingface|hf\.co|jsdelivr|unpkg/);
});

test("desktop CSP permits WASM in Chromium pages and workers while blocking JavaScript eval", async (t) => {
  const { chromium } = createRequire(new URL("../../frontend/package.json", import.meta.url))("playwright");
  const { receiveHeaders } = createPermissionHarness();
  let response;
  receiveHeaders({ responseHeaders: {} }, (value) => { response = value; });
  const policy = response.responseHeaders["Content-Security-Policy"][0];
  const compile = `WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]))`;
  const script = `
    window.result = (async () => {
      let evalBlocked = false;
      try { (0, eval)('1 + 1'); } catch { evalBlocked = true; }
      await ${compile};
      const worker = new Worker('/worker.js');
      const workerResult = await new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => resolve(data);
        worker.onerror = reject;
      });
      worker.terminate();
      return { pageWasm: true, workerWasm: workerResult, evalBlocked };
    })();`;
  const server = createServer((request, res) => {
    res.setHeader("Content-Security-Policy", policy);
    res.setHeader("Content-Type", request.url === "/" ? "text/html" : "text/javascript");
    res.end(request.url === "/"
      ? '<!doctype html><script src="/main.js"></script>'
      : request.url === "/worker.js"
        ? `${compile}.then(() => postMessage(true), (error) => postMessage(String(error)));`
        : script);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  assert.deepEqual(await page.evaluate(() => window.result), {
    pageWasm: true, workerWasm: true, evalBlocked: true,
  });
});
