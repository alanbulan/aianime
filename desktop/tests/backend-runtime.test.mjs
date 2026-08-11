import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop backend packages graph runtime resources and enforces UTF-8 output", async () => {
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

  assert.match(spec, /collect_data_files\(\s*"cognee",\s*include_py_files=False,/);
  assert.match(spec, /"\.cognee_system\/\*\*"/);
  assert.match(spec, /"tests\/\*\*"/);
  assert.match(spec, /includes=\["alembic\/\*\*\/\*\.py"\]/);
  assert.match(spec, /collect_submodules\("ladybug"\)/);
  assert.match(entrypoint, /--runtime-smoke-check/);
  assert.match(entrypoint, /from ladybug import Connection, Database/);
  assert.match(entrypoint, /from cognee\.infrastructure\.llm\.prompts import render_prompt/);
  assert.match(entrypoint, /for prompt_file in prompt_files/);
  assert.match(entrypoint, /cognee_root \/ "alembic" \/ "versions"/);
  assert.match(entrypoint, /import litellm\.containers/);
  assert.match(entrypoint, /containers_root \/ "endpoints\.json"/);
  assert.match(entrypoint, /reconfigure\(encoding="utf-8", errors="backslashreplace"\)/);
  assert.match(backendSource, /PYTHONIOENCODING: "utf-8"/);
  assert.match(backendSource, /PYTHONUTF8: "1"/);
  assert.match(desktopPackage.scripts["build:backend"], /smoke-backend-runtime\.mjs/);
});
