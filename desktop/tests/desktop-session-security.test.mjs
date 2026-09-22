// Copyright (c) 2026 AI anime

import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";

import { existsSync } from "node:fs";

import {
  installDesktopSessionSecurity,
  isDynamicCodeWorkerScriptUrl,
} from "../src/desktop-session-security.ts";

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

test("only the face pass Haar worker script receives a CSP that allows eval", () => {
  const { receiveHeaders } = createPermissionHarness();
  const policyFor = (url) => {
    let response;
    receiveHeaders({ url, responseHeaders: {} }, (value) => {
      response = value;
    });
    return response.responseHeaders["Content-Security-Policy"][0];
  };
  const evalAllowed = /script-src [^;]*'unsafe-eval'/;

  assert.match(policyFor("http://127.0.0.1:18080/assets/facePassHaarWorker-uelPe3cJ.js"), evalAllowed);
  assert.match(
    policyFor("http://127.0.0.1:5173/src/modules/creative_canvas/infrastructure/facePassHaarWorker.js"),
    evalAllowed,
  );
  // 页面、抠图 worker、YuNet worker 与 opencv.js 自身的响应都保持不放开 eval。
  for (const url of [
    "http://127.0.0.1:18080/",
    "http://127.0.0.1:18080/assets/index-D-BA_oo4.js",
    "http://127.0.0.1:18080/assets/facePassWorker-BsDn8q1D.js",
    "http://127.0.0.1:18080/assets/matteWorker-KigKcCLv.js",
    "http://127.0.0.1:18080/api/v1/runtime-dependencies/matte/opencv/opencv.js",
    "http://127.0.0.1:18080/assets/facePassHaarWorker.js.map",
    "http://evil.example/assets/facePassHaarWorker-x.js?next=/",
  ]) {
    assert.doesNotMatch(policyFor(url), evalAllowed, url);
  }
  assert.equal(isDynamicCodeWorkerScriptUrl(undefined, ["http://127.0.0.1:18080"]), false);
  assert.equal(isDynamicCodeWorkerScriptUrl("not a url", ["http://127.0.0.1:18080"]), false);
  // 文件名是与前端的契约：前端源文件必须仍在原路径，否则放开的策略会落空。
  assert.ok(
    existsSync(new URL(
      "../../frontend/src/modules/creative_canvas/infrastructure/facePassHaarWorker.js",
      import.meta.url,
    )),
  );
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
