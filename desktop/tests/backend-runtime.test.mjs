import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop backend packages Ladybug and enforces UTF-8 output", async () => {
  const spec = await readFile(
    new URL("../backend/ai_anime_backend.spec", import.meta.url),
    "utf8",
  );
  const entrypoint = await readFile(
    new URL("../backend/entrypoint.py", import.meta.url),
    "utf8",
  );
  const backendSource = await readFile(
    new URL("../src/backend.ts", import.meta.url),
    "utf8",
  );
  const desktopPackage = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.match(spec, /collect_submodules\("ladybug"\)/);
  assert.match(entrypoint, /--runtime-smoke-check/);
  assert.match(entrypoint, /from ladybug import Connection, Database/);
  assert.match(entrypoint, /reconfigure\(encoding="utf-8", errors="backslashreplace"\)/);
  assert.match(backendSource, /PYTHONIOENCODING: "utf-8"/);
  assert.match(backendSource, /PYTHONUTF8: "1"/);
  assert.match(desktopPackage.scripts["build:backend"], /smoke-backend-runtime\.mjs/);
});
