import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { validateReleaseSource } from "../scripts/verify-release-source.mjs";

const require = createRequire(import.meta.url);
const { load } = createRequire(require.resolve("electron-updater/package.json"))("js-yaml");

function source() {
  const targets = ["windows-x64", "macos-x64", "macos-arm64"];
  const run = { id: 123, repository: { full_name: "alanbulan/aianime" },
    head_repository: { full_name: "alanbulan/aianime" }, path: ".github/workflows/build-desktop.yml",
    status: "completed", conclusion: "failure", event: "workflow_dispatch", head_branch: "master", head_sha: "a".repeat(40) };
  return { run, jobs: targets.map((target) => ({ name: `Package ${target}`, conclusion: "success" })),
    artifacts: targets.map((target) => ({ name: `AI-anime-${target}`, expired: false, size_in_bytes: 100,
      workflow_run: { id: run.id, head_sha: run.head_sha } })) };
}

test("completed package jobs can be published after only assembly failed", () => {
  const { run, jobs, artifacts } = source();
  jobs.push({ name: "Collect and publish all three targets", conclusion: "failure" });
  assert.equal(validateReleaseSource(run, jobs, artifacts), run.head_sha);
});

for (const [name, mutate] of [
  ["fork", ({ run }) => { run.head_repository.full_name = "someone/aianime"; }],
  ["pull request", ({ run }) => { run.event = "pull_request"; }],
  ["different workflow", ({ run }) => { run.path = ".github/workflows/other.yml"; }],
  ["development branch", ({ run }) => { run.head_branch = "feature/unsafe"; }],
  ["running build", ({ run }) => { run.status = "in_progress"; }],
  ["cancelled build", ({ run }) => { run.conclusion = "cancelled"; }],
  ["failed package", ({ jobs }) => { jobs[0].conclusion = "failure"; }],
  ["missing package job", ({ jobs }) => { jobs.pop(); }],
  ["expired artifact", ({ artifacts }) => { artifacts[0].expired = true; }],
  ["missing artifact", ({ artifacts }) => { artifacts.pop(); }],
  ["duplicate artifact", ({ artifacts }) => { artifacts.push(artifacts[0]); }],
  ["different source commit", ({ artifacts }) => { artifacts[0].workflow_run.head_sha = "b".repeat(40); }],
  ["different source run", ({ artifacts }) => { artifacts[0].workflow_run.id = 124; }],
]) {
  test(`publish recovery rejects ${name}`, () => {
    const data = source();
    mutate(data);
    assert.throws(() => validateReleaseSource(data.run, data.jobs, data.artifacts));
  });
}

test("publish recovery has only a release job and uses the original artifact run and source metadata", async () => {
  const workflow = load(await readFile(new URL("../../.github/workflows/publish-desktop.yml", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(Object.keys(workflow.jobs), ["release"]);
  assert.equal(workflow.permissions.actions, "read");
  assert.equal(workflow.permissions.contents, "read");
  assert.equal(workflow.concurrency.group, "build-desktop-${{ github.repository }}");
  const steps = workflow.jobs.release.steps;
  const verify = steps.findIndex((step) => step.run === "node desktop/scripts/verify-release-source.mjs");
  const original = steps.findIndex((step) => step.with?.ref === "${{ steps.source.outputs.source_sha }}");
  const download = steps.findIndex((step) => step.uses?.startsWith("actions/download-artifact@"));
  const combine = steps.findIndex((step) => step.run?.includes("release:combine --source-root ../release-source"));
  const publish = steps.findIndex((step) => step.run?.includes("release:publish --reason"));
  assert.ok(verify >= 0 && verify < original && original < download && download < combine && combine < publish);
  assert.equal(steps[download].with["run-id"], "${{ inputs.source_run_id }}");
  assert.equal(steps[download].with["merge-multiple"], false);
  assert.ok(steps.every((step) => !/package:|runtime:|build:|release:stage|release:sign/.test(step.run || "")));
  assert.ok(steps.filter((_, index) => index !== publish).every((step) => !step.env?.RELEASE_PASSWORD));
});
