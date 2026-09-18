import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LocalBackend } from "../src/backend.ts";
import { sidecarModelCapability, sidecarCapabilityError } from "../src/backend-model-capability.ts";

const fixture = JSON.parse(await readFile(new URL("../../tests/fixtures/sidecar-capability-contract.json", import.meta.url), "utf8"));

test("billing metadata remains in Electron while sidecar receives the exact execution contract", async () => {
  const input = { allowsCustomModels: false, mode: "mixed", modelCapabilities: structuredClone(fixture.main) };
  const calls = [];
  const backend = new LocalBackend({
    desktopApp: { isPackaged: false, getAppPath: () => ".", getPath: () => "." },
    fetchImpl: async (_url, request) => { calls.push(JSON.parse(request.body)); return new Response("{}", { status: 200 }); },
  });
  backend._baseUrl = "http://127.0.0.1:45678";
  await backend.configureModelAccess(input);
  assert.deepEqual(calls[0].modelCapabilities, fixture.sidecar);
  assert.deepEqual(input.modelCapabilities, fixture.main);
  assert.equal(backend.modelAccess.modelCapabilities[0].billingVersion, "METERED_V2");
  const prior = backend.modelAccess;
  backend.fetchImpl = async () => new Response("{}", { status: 422 });
  await assert.rejects(() => backend.configureModelAccess({ ...input, modelCapabilities: [] }), /契约不匹配/);
  assert.equal(backend.modelAccess, prior, "failed synchronization replaced restart state");
});

test("capability projection clones arrays and cannot forward arbitrary secret fields", () => {
  const input = { ...structuredClone(fixture.main[1]), apiKey: "not-a-real-key" };
  const output = sidecarModelCapability(input);
  assert(!("apiKey" in output));
  output.videoResolutionOptions.push("fixture-only");
  assert.equal(input.videoResolutionOptions.length, 2);
});

test("422 diagnostics expose a field location, never rejected input or raw messages", async () => {
  const error = await sidecarCapabilityError(new Response(JSON.stringify({ detail: [{ loc: ["body", "modelCapabilities", 0, "billingVersion"], input: "private-value", msg: "secret-value" }] }), { status: 422 }));
  assert.match(error.message, /modelCapabilities\.0\.billingVersion/);
  assert(!/private-value|secret-value/.test(error.message));
});
