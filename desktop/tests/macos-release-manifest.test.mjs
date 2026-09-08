import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareMacosReleaseManifest } from "../scripts/prepare-macos-release-manifest.mjs";

const version = "1.1.63";
const require = createRequire(import.meta.url);
const updaterRequire = createRequire(require.resolve("electron-updater/package.json"));
const { dump, load } = updaterRequire("js-yaml");
const { publishClientRelease } = require("../scripts/publish-client-release.cjs");

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "macos-release-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = [];
  for (const extension of ["zip", "dmg"]) {
    const content = Buffer.from(`fixture ${extension}`);
    const url = `AI-anime-${version}-macos-x64.${extension}`;
    await writeFile(join(directory, url), content);
    files.push({ url, sha512: createHash("sha512").update(content).digest("base64"), size: content.length });
  }
  const update = { version, files, path: files[0].url, sha512: files[0].sha512, releaseDate: "2026-09-05T13:07:32.150Z" };
  const save = () => writeFile(join(directory, "latest-mac.yml"), dump(update));
  await save();
  return { directory, update, save };
}

test("macOS release JSON describes the ZIP updater and DMG installer using actual hashes", async (t) => {
  const { directory, update } = await fixture(t);
  const path = await prepareMacosReleaseManifest(directory, version);
  assert.equal(path, join(directory, "release-1.1.63-macos-x64.json"));
  const manifest = JSON.parse(await readFile(path, "utf8"));
  assert.equal(manifest.platform, "darwin");
  assert.equal(manifest.arch, "x64");
  assert.equal(manifest.version, version);
  assert.equal(manifest.releaseDate, update.releaseDate);
  assert.equal(manifest.updaterManifest, "latest-mac.yml");
  assert.equal(manifest.updaterManifestVerified, true);
  for (const [index, artifact] of [manifest, manifest.installer].entries()) {
    const bytes = await readFile(join(directory, update.files[index].url));
    assert.equal(artifact.file, update.files[index].url);
    assert.equal(artifact.size, bytes.length);
    assert.equal(artifact.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(artifact.sha512, createHash("sha512").update(bytes).digest("base64"));
  }
  assert.equal("authenticodeSigned" in manifest, false);
});

test("macOS cloud plan preserves the handoff and publishes one ZIP with its actual size", async (t) => {
  const { directory, update, save } = await fixture(t);
  delete update.files[0].size;
  await save();
  const original = await readFile(join(directory, "latest-mac.yml"), "utf8");
  await prepareMacosReleaseManifest(directory, version, "本次发布说明");
  const plan = JSON.parse(await readFile(join(directory, "cloud/release.json"), "utf8"));
  assert.equal(plan.version, version);
  assert.equal(plan.notes, "本次发布说明");
  assert.deepEqual(plan.artifacts, [{
    target: "macos", arch: "x86_64", installer: `../${update.files[0].url}`, manifest: "latest-mac.yml",
  }]);
  const cloud = load(await readFile(join(directory, "cloud/latest-mac.yml"), "utf8"));
  assert.deepEqual(cloud, { ...update, files: [{ ...update.files[0], size: Buffer.byteLength("fixture zip") }] });
  assert.equal(await readFile(join(directory, "latest-mac.yml"), "utf8"), original);
});

test("vendored cloud script logs in, uploads the prepared ZIP/YAML, and publishes through HTTP", async (t) => {
  const { directory, update } = await fixture(t);
  await prepareMacosReleaseManifest(directory, version, "发布链路测试");
  const requests = [];
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  let fileId = 0;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, url: req.url, headers: req.headers, bytes: Buffer.concat(chunks) });
    let result;
    if (req.url === "/api/v1/auth/login") {
      result = { accessToken: "header.payload.signature", expiresIn: 7200, tenant: { code: "system", isSystem: true }, user: { username: "admin" } };
    } else if (req.url.endsWith("/uploads")) {
      result = { fileId: ++fileId };
    } else if (req.url.endsWith("/content")) {
      result = { success: true };
    } else {
      result = { id, version, status: req.url.endsWith("/publish") ? "PUBLISHED" : "READY" };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const result = await publishClientRelease({
    gateway: `http://127.0.0.1:${server.address().port}`,
    plan: join(directory, "cloud/release.json"), publish: true, reason: "构建完成后自动发布",
  }, { RELEASE_PASSWORD: "fixture-password" });
  assert.equal(result.status, "PUBLISHED");
  assert.equal(requests.length, 7);
  assert.equal(JSON.parse(requests[0].bytes).tenantCode, "system");
  for (const request of requests.slice(1)) assert.equal(request.headers.authorization, "Bearer header.payload.signature");
  assert.equal(JSON.parse(requests[1].bytes).fileName, update.files[0].url);
  assert.equal(requests[2].method, "PUT");
  assert.equal(Number(requests[2].headers["content-length"]), Buffer.byteLength("fixture zip"));
  assert.equal(requests[2].bytes.toString(), "fixture zip");
  const uploadedYaml = load(requests[4].bytes.toString());
  assert.equal(uploadedYaml.files.length, 1);
  assert.equal(uploadedYaml.files[0].url, update.files[0].url);
  const registered = JSON.parse(requests[5].bytes);
  assert.equal(registered.version, version);
  assert.equal(registered.artifacts[0].fileId, 1);
  assert.equal(registered.artifacts[0].manifestFileId, 2);
  assert.equal(registered.artifacts[0].sha256, createHash("sha256").update(requests[2].bytes).digest("hex"));
  assert.deepEqual(JSON.parse(requests[6].bytes), { confirmed: true, reason: "构建完成后自动发布" });
});

for (const [name, mutate, error] of [
  ["wrong version", (u) => { u.version = "1.1.62"; }, /version/],
  ["wrong ZIP hash", (u) => { u.files[0].sha512 = "wrong"; }, /SHA-512/],
  ["wrong DMG size", (u) => { u.files[1].size += 1; }, /size/],
  ["missing DMG entry", (u) => { u.files.pop(); }, /one updater entry/],
  ["wrong updater target", (u) => { u.path = u.files[1].url; }, /ZIP artifact/],
  ["wrong legacy hash", (u) => { u.sha512 = "wrong"; }, /SHA-512/],
]) {
  test(`macOS release manifest rejects ${name} before writing JSON`, async (t) => {
    const { directory, update, save } = await fixture(t);
    mutate(update);
    await save();
    await assert.rejects(prepareMacosReleaseManifest(directory, version), error);
    await assert.rejects(readFile(join(directory, `release-${version}-macos-x64.json`)), { code: "ENOENT" });
  });
}

test("macOS release manifest rejects a missing package", async (t) => {
  const { directory, update } = await fixture(t);
  await rm(join(directory, update.files[0].url));
  await assert.rejects(prepareMacosReleaseManifest(directory, version), { code: "ENOENT" });
});

test("Intel workflow uploads the verified release JSON with the existing Mac packages", async () => {
  const workflow = load(await readFile(new URL("../../.github/workflows/build-macos-intel.yml", import.meta.url), "utf8"));
  const steps = workflow.jobs.package.steps;
  const prepare = steps.find((step) => step.id === "artifacts");
  assert.ok(prepare.run.includes("pnpm --dir desktop release:manifest:mac:x64"));
  const upload = steps.find((step) => step.name === "Upload temporary workflow artifact");
  assert.ok(upload.with.path.includes("${{ steps.artifacts.outputs.manifest_path }}"));
  const draft = steps.find((step) => step.name === "Save tagged build to a draft release");
  assert.equal(draft.env.MANIFEST_PATH, "${{ steps.artifacts.outputs.manifest_path }}");
});

test("Intel workflow installs the locked Chromium runtime before desktop CSP tests", async () => {
  const workflow = load(await readFile(new URL("../../.github/workflows/build-macos-intel.yml", import.meta.url), "utf8"));
  const steps = workflow.jobs.package.steps;
  const prerequisites = steps.findIndex((step) => step.name === "Install build prerequisites");
  const browser = steps.findIndex((step) => step.name === "Install Chromium for desktop security tests");
  const tests = steps.findIndex((step) => step.name === "Test desktop packaging contracts");
  assert.ok(prerequisites >= 0 && browser > prerequisites && tests > browser);
  assert.equal(steps[browser].run, "pnpm --dir frontend test:browser:install");
  const frontend = JSON.parse(await readFile(new URL("../../frontend/package.json", import.meta.url), "utf8"));
  assert.equal(frontend.scripts["test:browser:install"], "playwright install chromium");
});

test("Intel workflow invokes the cloud script only after verified packaging with a scoped secret", async () => {
  const workflow = load(await readFile(new URL("../../.github/workflows/build-macos-intel.yml", import.meta.url), "utf8"));
  const steps = workflow.jobs.package.steps;
  const publishIndex = steps.findIndex((step) => step.name === "Publish verified Intel package to cloud");
  assert.ok(publishIndex > steps.findIndex((step) => step.id === "artifacts"));
  assert.ok(publishIndex > steps.findIndex((step) => step.name === "Upload temporary workflow artifact"));
  const publish = steps[publishIndex];
  assert.equal(publish.env.RELEASE_PASSWORD, "${{ secrets.RELEASE_PASSWORD }}");
  assert.equal(publish.env.RELEASE_GATEWAY, "https://aianime.mingcw.com");
  assert.match(publish.if, /github\.repository == 'alanbulan\/aianime'/);
  assert.match(publish.if, /refs\/heads\/master/);
  assert.ok(!publish.if.includes("always()"));
  assert.match(publish.run, /pnpm --dir desktop release:publish:mac:x64 --reason/);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.concurrency.group, "build-macos-intel-${{ github.repository }}");
  assert.ok(steps.filter((_, index) => index !== publishIndex).every((step) => !step.env?.RELEASE_PASSWORD));
  const desktop = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(desktop.scripts["release:publish:mac:x64"], "node scripts/publish-client-release.cjs --plan release/cloud/release.json --publish");
  const upload = steps.find((step) => step.name === "Upload temporary workflow artifact");
  assert.ok(upload.with.path.includes("${{ steps.artifacts.outputs.cloud_plan_path }}"));
  assert.ok(upload.with.path.includes("${{ steps.artifacts.outputs.cloud_update_path }}"));
});
