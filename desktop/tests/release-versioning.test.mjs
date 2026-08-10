import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  bumpWorkspaceVersion,
  nextPatchVersion,
  readWorkspaceVersion,
} from "../../scripts/release/bump-version.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ai-anime-version-"));
  for (const directory of ["desktop", "frontend", "src/ai_anime", "docs"]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  writeFileSync(join(root, "pyproject.toml"), '[project]\nversion = "1.1.10"\n');
  writeFileSync(
    join(root, "desktop/package.json"),
    '{\n  "name": "desktop",\n  "version": "1.1.10"\n}\n',
  );
  writeFileSync(
    join(root, "uv.lock"),
    '[[package]]\nname = "ai-anime"\nversion = "1.1.10"\n',
  );
  writeFileSync(
    join(root, "frontend/vite.config.ts"),
    'const DEFAULT_APP_VERSION = "1.1.10";\n',
  );
  writeFileSync(join(root, "README.md"), "当前客户端版本：`1.1.10`。\n");
  writeFileSync(
    join(root, "docs/cloud-integration-handoff.md"),
    "客户端 `1.1.10` 固定使用网关。\n",
  );
  writeFileSync(join(root, "src/ai_anime/release-notes.md"), "old\n");
  return root;
}

test("patch version increments semantically", () => {
  assert.equal(nextPatchVersion("1.1.10"), "1.1.11");
  assert.throws(() => nextPatchVersion("1.1"), /不是 x\.y\.z 格式/);
});

test("workspace bump synchronizes every product version and release note", () => {
  const root = fixture();
  const result = bumpWorkspaceVersion(root, "1.1.11", {
    sourceCommit: "abcdef123456",
    buildNumber: "42",
    message: "修复视频下载和助手任务状态误判",
  });

  assert.deepEqual(result, {
    currentVersion: "1.1.10",
    targetVersion: "1.1.11",
  });
  assert.equal(readWorkspaceVersion(root), "1.1.11");
  assert.match(
    readFileSync(join(root, "src/ai_anime/release-notes.md"), "utf8"),
    /修复视频下载和助手任务状态误判/,
  );
  assert.match(
    readFileSync(join(root, "docs/cloud-integration-handoff.md"), "utf8"),
    /客户端 `1\.1\.11` 固定使用网关/,
  );
});

test("workspace bump refuses inconsistent source versions", () => {
  const root = fixture();
  writeFileSync(
    join(root, "frontend/vite.config.ts"),
    'const DEFAULT_APP_VERSION = "9.9.9";\n',
  );
  assert.throws(() => readWorkspaceVersion(root), /版本文件不一致/);
});

test("Gitee workflow auto-triggers master and guards release commits", () => {
  const workflow = readFileSync(
    join(process.cwd(), "..", ".workflow", "流水线-202608101609.yml"),
    "utf8",
  );
  assert.match(workflow, /step: build@gcc/);
  assert.match(workflow, /step: build@nodejs/);
  assert.match(workflow, /precise:\s*\n\s*- master/);
  assert.match(workflow, /chore\(release\): 自动升级版本至 v/);
  assert.match(workflow, /pnpm --dir desktop test/);
  assert.match(workflow, /pnpm --dir frontend test/);
  assert.match(workflow, /pnpm --dir frontend build:ce/);
  assert.match(workflow, /uv run pytest/);
  assert.match(workflow, /AI_MANGA_PUSH_TOKEN/);
  assert.match(workflow, /GIT_ASKPASS/);
  assert.match(workflow, /https:\/\/gitee\.com\/mingcheng_software\/ai-manga-desktop\.git/);
  assert.match(workflow, /push origin HEAD:master/);
});
