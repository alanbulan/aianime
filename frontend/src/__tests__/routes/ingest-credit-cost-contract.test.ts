// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  resolve(process.cwd(), "src/routes/_app/projects.$project/ingest.tsx"),
  "utf8",
);

describe("ingest feature credit contract", () => {
  it("shows the strict feature billing configuration fallback", () => {
    expect(routeSource).toContain(
      'useGenerationCreditCost("feature", "ingest_fast", {',
    );
    expect(routeSource).toContain("quantity: billingBillableChars");
    expect(routeSource).toContain(
      "ingestFeatureCost.error instanceof BillingRuleNotConfiguredError",
    );
    expect(routeSource).toContain('t("common.billingRuleNotConfiguredShort")');
  });
});
