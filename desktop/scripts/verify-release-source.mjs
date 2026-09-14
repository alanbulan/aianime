import assert from "node:assert/strict";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "alanbulan/aianime";
const targets = ["windows-x64", "macos-x64", "macos-arm64"];

export function validateReleaseSource(run, jobs, artifacts) {
  assert.equal(run.repository?.full_name, repository, "Unexpected source repository");
  assert.equal(run.head_repository?.full_name, repository, "Fork artifacts cannot be published");
  assert.equal(run.path, ".github/workflows/build-desktop.yml", "Unexpected source workflow");
  assert.equal(run.status, "completed", "Source build is still running");
  assert.ok(["success", "failure"].includes(run.conclusion), "Source build was cancelled or incomplete");
  assert.ok(["workflow_dispatch", "push"].includes(run.event), "Untrusted source event");
  assert.ok(run.head_branch === "master" || /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(run.head_branch), "Unexpected source branch or tag");
  assert.match(run.head_sha, /^[a-f0-9]{40}$/, "Invalid source commit");
  for (const target of targets) {
    const matchingJobs = jobs.filter((job) => job.name === `Package ${target}`);
    assert.equal(matchingJobs.length, 1, `Expected one package job: ${target}`);
    assert.equal(matchingJobs[0].conclusion, "success", `Package did not succeed: ${target}`);
    const matchingArtifacts = artifacts.filter((artifact) => artifact.name === `AI-anime-${target}`);
    assert.equal(matchingArtifacts.length, 1, `Expected one artifact: ${target}`);
    const artifact = matchingArtifacts[0];
    assert.equal(artifact.expired, false, `Artifact expired: ${target}`);
    assert.ok(artifact.size_in_bytes > 0, `Artifact is empty: ${target}`);
    assert.equal(artifact.workflow_run?.id, run.id, `Artifact belongs to another run: ${target}`);
    assert.equal(artifact.workflow_run?.head_sha, run.head_sha, `Artifact source commit mismatch: ${target}`);
  }
  assert.equal(artifacts.length, targets.length, "Unexpected extra source artifacts");
  return run.head_sha;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runID = process.env.SOURCE_RUN_ID || "";
  assert.match(runID, /^[1-9]\d*$/, "Source run ID must be a positive integer");
  assert.equal(process.env.GITHUB_REPOSITORY, repository, "Unexpected recovery repository");
  assert.ok(process.env.GH_TOKEN && process.env.GITHUB_OUTPUT, "Missing Actions credentials or output file");
  async function get(suffix) {
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${runID}${suffix}`, {
      redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28" },
    });
    assert.ok(response.ok, `Source verification failed: HTTP ${response.status}`);
    return response.json();
  }
  const [run, jobList, artifactList] = await Promise.all([
    get(""), get("/jobs?per_page=100&filter=latest"), get("/artifacts?per_page=100"),
  ]);
  assert.equal(jobList.total_count, jobList.jobs.length, "Source job list is incomplete");
  assert.equal(artifactList.total_count, artifactList.artifacts.length, "Source artifact list is incomplete");
  const sha = validateReleaseSource(run, jobList.jobs, artifactList.artifacts);
  await appendFile(process.env.GITHUB_OUTPUT, `source_sha=${sha}\n`);
  console.log(`Verified three successful package jobs from run ${runID}, commit ${sha}`);
}
