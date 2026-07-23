// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const controllerSource = readFileSync(
  resolve(
    process.cwd(),
    "src/modules/story_intake/application/use-story-intake-controller.ts",
  ),
  "utf8",
);

describe("ingest feature credit contract", () => {
  it("shows the strict feature billing configuration fallback", () => {
    expect(controllerSource).toContain(
      'useGenerationCreditCost("feature", "ingest_fast", {',
    );
    expect(controllerSource).toContain("quantity: billingBillableChars");
    expect(controllerSource).toContain(
      "ingestFeatureCost.error instanceof BillingRuleNotConfiguredError",
    );
    expect(controllerSource).toContain(
      't("common.billingRuleNotConfiguredShort")',
    );
  });
});
