// Copyright (c) 2026 AI anime

import assert from "node:assert/strict";
import test from "node:test";

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
  assert.match(policy, /connect-src [^;]*blob:/);
  assert.doesNotMatch(policy, /huggingface|hf\.co|jsdelivr|unpkg/);
});
