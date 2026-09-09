import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { assertSparkleSignature, installSparkleUpdate } from "../src/commercial-sparkle-installer.ts";

test("Sparkle rejects missing and malformed signatures", () => {
  for (const value of [undefined, "", "a".repeat(88), Buffer.alloc(32).toString("base64")]) {
    assert.throws(() => assertSparkleSignature(value), /signature/);
  }
});

for (const fail of [false, true]) {
  test(`Sparkle loopback bridge restricts routes and cleans up after ${fail ? "failure" : "success"}`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "sparkle-bridge-test-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const archivePath = join(directory, "download.zip");
    await writeFile(archivePath, "verified archive fixture");
    let finish;
    const launched = new Promise((resolve) => { finish = resolve; });
    const child = Object.assign(new EventEmitter(), { stderr: new PassThrough() });
    const install = installSparkleUpdate(join(directory, "App.app"), {
      version: '1.2.3&<"', archivePath, edSignature: Buffer.alloc(64, 1).toString("base64"),
    }, (executable, args, options) => {
      finish({ executable, args, options });
      return child;
    });
    const checked = fail ? assert.rejects(install, /signature/) : install;
    const { executable, args, options } = await launched;
    assert.equal(executable, join(directory, "App.app/Contents/Helpers/Sparkle.app/Contents/MacOS/sparkle"));
    assert.equal(options.detached, true);
    assert.ok(!args.includes("--defer-install"));
    const feedUrl = args[args.indexOf("--feed-url") + 1];
    assert.match(feedUrl, /^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{64}\/appcast\.xml$/);
    const feed = await (await fetch(feedUrl)).text();
    assert.match(feed, /1\.2\.3&amp;&lt;&quot;/);
    assert.doesNotMatch(feed, /Bearer|Authorization/);
    assert.equal((await fetch(feedUrl, { method: "POST" })).status, 404);
    assert.equal((await fetch(new URL("/update.zip", feedUrl))).status, 404);
    assert.equal(await (await fetch(feedUrl.replace("appcast.xml", "update.zip"))).text(), "verified archive fixture");
    if (fail) child.stderr.write("invalid signature");
    child.emit("close", fail ? 1 : 0);
    await checked;
    await assert.rejects(fetch(feedUrl));
  });
}
