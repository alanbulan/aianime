// Copyright (c) 2026 AI anime
import { spawnSync } from "node:child_process";

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("run-test-projects.mjs must be started through pnpm");
}
const pnpmIsNodeScript = /\.[cm]?js$/iu.test(pnpmCli);
const pnpmCommand = pnpmIsNodeScript ? process.execPath : pnpmCli;
const pnpmArgsPrefix = pnpmIsNodeScript ? [pnpmCli] : [];

const failedProjects = [];
for (const project of ["test:unit", "test:component", "test:browser"]) {
  const result = spawnSync(pnpmCommand, [...pnpmArgsPrefix, "run", project], {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    failedProjects.push(project);
  }
}

if (failedProjects.length > 0) {
  console.error(`Failed test projects: ${failedProjects.join(", ")}`);
  process.exitCode = 1;
}
