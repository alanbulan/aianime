// Copyright (c) 2026 AI anime

import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_COOKIE_NAME,
  commercialArchitecture,
  commercialPlatform,
  desktopSessionCookie,
  isAllowedExternalUrl,
  isExpectedMainFrameSender,
  isSameOrigin,
} from "../src/desktop-runtime-contracts.ts";

test("development and packaged main processes share platform normalization", () => {
  assert.equal(commercialPlatform("win32"), "windows");
  assert.equal(commercialPlatform("darwin"), "macos");
  assert.equal(commercialPlatform("linux"), "linux");
  assert.equal(commercialArchitecture("x64"), "x86_64");
  assert.equal(commercialArchitecture("arm64"), "arm64");
});

test("desktop navigation accepts only same-origin pages and HTTPS external URLs", () => {
  assert.equal(isSameOrigin("http://127.0.0.1:5173/workspace", "http://127.0.0.1:5173"), true);
  assert.equal(isSameOrigin("http://localhost:5173", "http://127.0.0.1:5173"), false);
  assert.equal(isSameOrigin("not a url", "http://127.0.0.1:5173"), false);
  assert.equal(isAllowedExternalUrl("https://example.com/docs"), true);
  assert.equal(isAllowedExternalUrl("http://example.com/docs"), false);
  assert.equal(isAllowedExternalUrl("not a url"), false);
});

test("desktop session cookie attributes stay identical in both main processes", () => {
  assert.deepEqual(desktopSessionCookie("https://example.com", "用户", 1_000), {
    url: "https://example.com",
    name: AUTH_COOKIE_NAME,
    value: `desktop.${Buffer.from("用户", "utf8").toString("base64url")}`,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    expirationDate: 1 + 7 * 24 * 60 * 60,
  });
  assert.equal(desktopSessionCookie("http://127.0.0.1:5173", "demo", 0).secure, false);
});

test("desktop IPC accepts only the active web contents main frame", () => {
  const mainFrame = {};
  const subframe = {};

  assert.equal(isExpectedMainFrameSender(7, mainFrame, 7, mainFrame, mainFrame), true);
  assert.equal(isExpectedMainFrameSender(7, mainFrame, 8, mainFrame, mainFrame), false);
  assert.equal(isExpectedMainFrameSender(7, mainFrame, 7, subframe, mainFrame), false);
  assert.equal(isExpectedMainFrameSender(7, mainFrame, 7, mainFrame, subframe), false);
});
