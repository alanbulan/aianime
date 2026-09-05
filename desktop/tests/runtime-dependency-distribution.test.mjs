import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RuntimeDependencyManager } from "../src/runtime-dependencies.ts";
import { runtimeDependencyManifestUrl } from "../src/runtime-dependency-manifest.ts";

const bytes = Buffer.from("verified runtime resource");
const expected = {
  version: "fixture+locked-1",
  files: [{
    relativePath: "models/model.onnx",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    urls: ["https://upstream.invalid/model.onnx"],
  }],
};
const expiredUrl = "https://rustfs.example/bucket/model.onnx?X-Amz-Signature=expired&X-Amz-Expires=3600";
const freshUrl = "https://rustfs.example/bucket/model.onnx?X-Amz-Signature=fresh%2Bsignature&X-Amz-Expires=3600";

function manifest(url = freshUrl) {
  return {
    schemaVersion: 1,
    package: {
      id: "matte", platform: "win32", arch: "x64", version: expected.version,
      files: expected.files.map((file) => ({ ...file, urls: [url] })),
    },
  };
}

test("all dependency manifests use the cloud API and encode locked versions", () => {
  for (const id of ["world", "worldModels", "matte"]) {
    const url = new URL(runtimeDependencyManifestUrl(id, "win32", "x64", {}, expected.version));
    assert.equal(url.pathname, `/api/v1/client/runtime-dependencies/${id}/win32-x64/manifest.json`);
    assert.equal(url.searchParams.get("version"), expected.version);
  }
  assert.equal(runtimeDependencyManifestUrl("matte", "darwin", "x64", {
    AI_ANIME_RUNTIME_MANIFEST_URL: "http://127.0.0.1:8000/{id}/{platform}/{arch}/manifest.json",
  }), "http://127.0.0.1:8000/matte/darwin/x64/manifest.json");
});

test("signed object downloads preserve query strings and refresh an expired URL once", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "runtime-distribution-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const requests = [];
  let manifests = 0;
  const manifestUrl = runtimeDependencyManifestUrl("matte", "win32", "x64", {}, expected.version);
  const manager = new RuntimeDependencyManager(root, {
    platform: "win32", arch: "x64", mattePackage: expected,
    fetchImpl: async (url, options) => {
      requests.push(String(url));
      assert.equal(options.redirect, "error");
      assert.equal(options.headers, undefined);
      if (String(url) === manifestUrl) {
        assert.equal(options.cache, "no-store");
        return Response.json(manifest(++manifests === 1 ? expiredUrl : freshUrl));
      }
      if (String(url) === expiredUrl) return new Response(null, { status: 403 });
      assert.equal(String(url), freshUrl);
      return new Response(bytes);
    },
  });
  const result = await manager.install("matte");
  assert.equal(result.state, "ready");
  assert.deepEqual(requests, [manifestUrl, expiredUrl, manifestUrl, freshUrl]);
  assert.deepEqual(await readFile(join(manager.paths.matteRoot, expected.files[0].relativePath)), bytes);
  const receipt = await readFile(join(manager.paths.matteRoot, "install.json"), "utf8");
  assert.doesNotMatch(receipt, /Signature|https:/);
});

test("cloud manifest mismatches and failures preserve the installed files without upstream fallback", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "runtime-distribution-reject-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let response = manifest();
  let status = 200;
  let downloads = 0;
  const manager = new RuntimeDependencyManager(root, {
    platform: "win32", arch: "x64", mattePackage: expected,
    fetchImpl: async (url) => {
      if (new URL(url).pathname.endsWith("manifest.json")) {
        return Response.json(response, { status });
      }
      assert.equal(String(url), freshUrl);
      downloads += 1;
      return new Response(bytes);
    },
  });
  await manager.install("matte");
  for (const [name, mutate] of [
    ["wrong dependency", (value) => { value.package.id = "worldModels"; }],
    ["wrong platform", (value) => { value.package.platform = "darwin"; }],
    ["wrong version", (value) => { value.package.version = "different"; }],
    ["wrong hash", (value) => { value.package.files[0].sha256 = "a".repeat(64); }],
    ["wrong size", (value) => { value.package.files[0].sizeBytes += 1; }],
    ["missing file", (value) => { value.package.files = []; }],
    ["unsafe path", (value) => { value.package.files[0].relativePath = "../unsafe"; }],
    ["unsafe URL", (value) => { value.package.files[0].urls = ["http://storage.example/model"]; }],
    ["invalid file", (value) => { value.package.files = [null]; }],
  ]) {
    await t.test(name, async () => {
      response = manifest();
      mutate(response);
      await assert.rejects(manager.install("matte"), /清单/);
      assert.deepEqual(await readFile(join(manager.paths.matteRoot, expected.files[0].relativePath)), bytes);
      assert.equal(downloads, 1);
    });
  }
  status = 503;
  await assert.rejects(manager.install("matte"), /HTTP 503/);
  assert.equal(downloads, 1);
});

test("persistently expired signatures fail after one refresh", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "runtime-distribution-expired-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let manifests = 0;
  let downloads = 0;
  const manager = new RuntimeDependencyManager(root, {
    platform: "win32", arch: "x64", mattePackage: expected,
    fetchImpl: async (url) => {
      if (new URL(url).pathname.endsWith("manifest.json")) {
        manifests += 1;
        return Response.json(manifest(expiredUrl));
      }
      downloads += 1;
      return new Response(null, { status: 403 });
    },
  });
  await assert.rejects(manager.install("matte"), /HTTP 403/);
  assert.equal(manifests, 2);
  assert.equal(downloads, 2);
  assert.equal((await manager.status("matte")).state, "not-installed");
});

test("world archive size is checked before extraction even when the hash matches", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "runtime-world-size-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manager = new RuntimeDependencyManager(root, {
    platform: "win32", arch: "x64",
    fetchImpl: async (url) => new URL(url).pathname.endsWith("manifest.json")
      ? Response.json({
        schemaVersion: 1,
        package: {
          id: "world", version: "1.1.39", platform: "win32", arch: "x64",
          archive: "tar.gz", sha256: expected.files[0].sha256,
          downloadSizeBytes: bytes.length + 1, installedSizeBytes: bytes.length,
          urls: [freshUrl],
        },
      })
      : new Response(bytes),
  });
  await assert.rejects(manager.install("world"), /大小校验失败/);
  assert.equal((await manager.status("world")).state, "not-installed");
});
