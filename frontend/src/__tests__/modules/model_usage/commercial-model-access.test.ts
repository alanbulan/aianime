// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  parseCommercialModelAccessStatus,
  resolveRequiredCatalogModelCode,
  type CommercialModelCatalog,
} from "@/modules/model_usage/domain/commercial-model-access";

const baseStatus = {
  mode: "byok",
  allowsCustomModels: true,
  gatewayOrigin: "http://122.193.11.199:8889",
  byokConfigured: true,
  byokBaseUrl: "https://models.example.test/v1",
  byokApiKeyPreview: "sk-a...test",
};

describe("commercial model access status", () => {
  it("projects only explicit BYOK model assignments", () => {
    expect(
      parseCommercialModelAccessStatus({
        ...baseStatus,
        byokModelAssignments: [
          { modelId: "speech-model", role: "AUDIO_SPEECH" },
          { modelId: "speech-model", role: "AUDIO_VOICE_CLONE" },
        ],
      }).byokModelAssignments,
    ).toEqual([
      { modelId: "speech-model", role: "AUDIO_SPEECH" },
      { modelId: "speech-model", role: "AUDIO_VOICE_CLONE" },
    ]);
  });

  it("treats a migrated status without assignments as an empty catalog", () => {
    expect(
      parseCommercialModelAccessStatus(baseStatus).byokModelAssignments,
    ).toEqual([]);
  });

  it("rejects unknown BYOK model roles", () => {
    expect(() =>
      parseCommercialModelAccessStatus({
        ...baseStatus,
        byokModelAssignments: [
          { modelId: "unknown-model", role: "PAGE_REQUESTED_OPERATION" },
        ],
      }),
    ).toThrow("byokModelAssignments[0].role is invalid");
  });
});

function textCatalog(
  items: CommercialModelCatalog["items"],
): CommercialModelCatalog {
  return { catalogVersion: "catalog-v1", items };
}

function textModel(code: string, isDefault?: boolean) {
  return {
    id: code,
    code,
    displayName: code,
    operation: "TEXT",
    capabilities: {},
    parameterSchema: {},
    ...(isDefault === undefined ? {} : { isDefault }),
  };
}

describe("required commercial catalog model", () => {
  it("uses the only operation candidate", () => {
    expect(
      resolveRequiredCatalogModelCode(
        textCatalog([textModel("cloud-text-standard")]),
        "text",
      ),
    ).toBe("cloud-text-standard");
  });

  it("uses the unique default candidate", () => {
    expect(
      resolveRequiredCatalogModelCode(
        textCatalog([
          textModel("cloud-text-standard", true),
          textModel("cloud-text-premium", false),
        ]),
        "TEXT",
      ),
    ).toBe("cloud-text-standard");
  });

  it("rejects multiple default candidates", () => {
    expect(() =>
      resolveRequiredCatalogModelCode(
        textCatalog([
          textModel("cloud-text-a", true),
          textModel("cloud-text-b", true),
        ]),
        "TEXT",
      ),
    ).toThrow("TEXT 模型目录包含多个默认 SKU");
  });

  it("rejects ambiguous candidates without a default", () => {
    expect(() =>
      resolveRequiredCatalogModelCode(
        textCatalog([
          textModel("cloud-text-a"),
          textModel("cloud-text-b"),
        ]),
        "TEXT",
      ),
    ).toThrow("TEXT 模型目录缺少唯一默认 SKU");
  });
});
