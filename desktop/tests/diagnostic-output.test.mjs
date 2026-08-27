import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createDiagnosticWriter } from "../scripts/diagnostic-output.mjs";

class DiagnosticStream extends EventEmitter {
  destroyed = false;
  writable = true;
  writes = [];

  write(message) {
    this.writes.push(message);
  }
}

test("diagnostic output stops writing after its parent pipe closes", () => {
  const stream = new DiagnosticStream();
  const write = createDiagnosticWriter(stream);

  write("before");
  assert.doesNotThrow(() => {
    stream.emit("error", Object.assign(new Error("broken pipe"), { code: "EPIPE" }));
  });
  write("after");

  assert.deepEqual(stream.writes, ["before"]);
});

test("diagnostic output tolerates a synchronous broken-pipe write", () => {
  const stream = new DiagnosticStream();
  let attempts = 0;
  stream.write = () => {
    attempts += 1;
    throw Object.assign(new Error("broken pipe"), { code: "EPIPE" });
  };
  const write = createDiagnosticWriter(stream);

  assert.doesNotThrow(() => write("first"));
  write("second");

  assert.equal(attempts, 1);
});

test("diagnostic output does not conceal unrelated stream errors", () => {
  const stream = new DiagnosticStream();
  createDiagnosticWriter(stream);

  assert.throws(() => stream.emit("error", new Error("unexpected")), /unexpected/);
});
