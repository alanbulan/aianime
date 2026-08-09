import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { saveCommercialInvocationResult } from "../src/commercial-invocation-result.ts";

test("cancelled result saves cancel the unread response stream", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const client = {
    invocationResult: async () =>
      new Response(body, {
        headers: {
          "Content-Disposition": "attachment; filename*=UTF-8''result%20image.png",
        },
      }),
  };

  const result = await saveCommercialInvocationResult(
    client,
    "invocation-id",
    async (suggestedName) => {
      assert.equal(suggestedName, "result image.png");
      return null;
    },
  );

  assert.deepEqual(result, { saved: false });
  assert.equal(cancelled, true);
});

test("result saves stream bytes and replaces the selected file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-result-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "result.bin");
  await writeFile(filePath, "old");
  const client = {
    invocationResult: async () => new Response(Buffer.from("new-result")),
  };

  const result = await saveCommercialInvocationResult(
    client,
    42,
    async (suggestedName) => {
      assert.equal(suggestedName, "AI-anime-result-42.bin");
      return filePath;
    },
  );

  assert.deepEqual(result, { saved: true, fileName: "result.bin" });
  assert.equal(await readFile(filePath, "utf8"), "new-result");
});
