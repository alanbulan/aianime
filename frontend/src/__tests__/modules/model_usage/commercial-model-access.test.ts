// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  commercialModelRoles,
  parseCommercialModelAccessStatus,
  parseCommercialModelCatalogItem,
  resolveRequiredCatalogModelCode,
  type CommercialModelCatalog,
} from "@/modules/model_usage/domain/commercial-model-access";

describe("commercial model details", () => {
  it("projects renderer-safe capability and parameter JSON", () => {
    expect(
      parseCommercialModelCatalogItem({
        id: "sku-1",
        code: "cloud-text-standard",
        displayName: "Cloud text",
        operation: "TEXT",
        capabilityJson: '{"stream":true}',
        parameterSchemaJson: '{"temperature":{"type":"number"}}',
        unitsPerCall: 10,
        clientVisible: true,
        status: "ACTIVE",
      }),
    ).toEqual({
      id: "sku-1",
      code: "cloud-text-standard",
      displayName: "Cloud text",
      operation: "TEXT",
      capabilities: { stream: true },
      parameterSchema: { temperature: { type: "number" } },
      unitsPerCall: 10,
      clientVisible: true,
      status: "ACTIVE",
    });
  });

  it("projects one cloud model into its explicit supported purposes", () => {
    const model = parseCommercialModelCatalogItem({
      id: "video-1",
      code: "video-model",
      displayName: "Video model",
      operation: "VIDEO",
      capabilityJson: '{"supportedModes":["FIRST_FRAME","FIRST_LAST_FRAME"]}',
      parameterSchemaJson: "{}",
    });

    expect(commercialModelRoles(model)).toEqual([
      "VIDEO_IMAGE_TO_VIDEO",
      "VIDEO_FIRST_LAST_FRAME",
    ]);
  });
});

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

  it("projects cloud selections independently from BYOK assignments", () => {
    const status = parseCommercialModelAccessStatus({
      ...baseStatus,
      cloudModelAssignments: [{ modelId: "cloud-text", role: "TEXT" }],
      byokModelAssignments: [{ modelId: "byok-text", role: "TEXT" }],
    });

    expect(status.cloudModelAssignments).toEqual([
      { modelId: "cloud-text", role: "TEXT" },
    ]);
    expect(status.byokModelAssignments).toEqual([
      { modelId: "byok-text", role: "TEXT" },
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
