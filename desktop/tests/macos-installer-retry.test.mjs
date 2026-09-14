import assert from "node:assert/strict";
import test from "node:test";
import { buildMacosInstaller } from "../scripts/build-macos-installer.mjs";

const busy = { code: 1, output: 'dmgbuild.core.DMGError: Unable to detach device cleanly: hdiutil: couldn\'t eject "disk4" - Resource busy' };

test("DMG detach failure retries from the compiled app with the same architecture and configuration", async () => {
  for (const arch of ["x64", "arm64"]) {
    const calls = [], waits = [], checks = [];
    await buildMacosInstaller(arch, {
      root: "/build path/desktop",
      execute: async (args) => { calls.push(args); return calls.length === 1 ? busy : { code: 0 }; },
      wait: async (ms) => waits.push(ms),
      checkApp: async (path) => checks.push(path),
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].includes("--prepackaged"), false);
    assert.deepEqual(calls[1].slice(0, calls[0].length), calls[0]);
    assert.deepEqual(calls[0].slice(0, 6), ["--mac", "dmg", "zip", `--${arch}`, "--publish", "never"]);
    assert.equal(calls[0].includes("electron-builder.macos-intel.yml"), arch === "x64");
    const app = `/build path/desktop/release/${arch === "x64" ? "mac" : "mac-arm64"}/AI anime.app`;
    assert.deepEqual(calls[1].slice(-2), ["--prepackaged", app]);
    assert.deepEqual(checks, [`${app}/Contents/MacOS/AI anime`]);
    assert.deepEqual(waits, [10_000]);
  }
});

test("DMG retries are bounded and persistent failure remains a failed build", async () => {
  let calls = 0;
  const waits = [];
  await assert.rejects(buildMacosInstaller("x64", {
    execute: async () => { calls++; return busy; },
    wait: async (ms) => waits.push(ms),
    checkApp: async () => {},
  }), /attempt 3/);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10_000, 20_000]);
});

test("signing, compilation, cancellation and other disk errors do not trigger installer retries", async () => {
  for (const result of [
    { code: 1, output: "codesign failed: Resource busy" },
    { code: 1, output: "compile error" },
    { code: 1, output: "DMGError: Unable to detach device cleanly: Permission denied" },
    { ...busy, code: null, signal: "SIGTERM" },
  ]) {
    let calls = 0;
    await assert.rejects(buildMacosInstaller("x64", {
      execute: async () => { calls++; return result; },
      wait: async () => assert.fail("must not wait"),
      checkApp: async () => assert.fail("must not reuse app"),
    }), /installer failed/);
    assert.equal(calls, 1);
  }
});

test("installer cannot retry when the compiled application is missing", async () => {
  let calls = 0;
  await assert.rejects(buildMacosInstaller("x64", {
    execute: async () => { calls++; return busy; },
    wait: async () => assert.fail("must not wait"),
    checkApp: async () => { throw new Error("ENOENT compiled app"); },
  }), /ENOENT compiled app/);
  assert.equal(calls, 1);
});
