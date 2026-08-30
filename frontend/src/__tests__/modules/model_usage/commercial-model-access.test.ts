// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  BYOK_MODEL_ROLES,
  commercialModelRoles,
  effectiveModelRuntimeSettings,
  parseCommercialModelAccessStatus,
  parseCommercialModelCatalogItem,
  resolveRequiredCatalogModelCode,
  resolveCommercialModelRoleRoute,
  type CommercialModelCatalog,
} from "@/modules/model_usage/domain/commercial-model-access";
import {
  commercialModelRuntimeMetadata,
  formatReasoningEffort,
} from "@/modules/model_usage/domain/model-runtime-metadata";

describe("commercial model details", () => {
  it("reads runtime limits from capabilities and JSON Schema properties", () => {
    const metadata = commercialModelRuntimeMetadata({
      capabilities: { contextWindowTokens: 32768 },
      parameterSchema: {
        type: "object",
        properties: {
          max_completion_tokens: {
            type: "integer",
            minimum: 1,
            maximum: 8192,
          },
          reasoning_effort: {
            type: "string",
            enum: ["low", "medium", "xhigh"],
            default: "low",
          },
        },
      },
    });

    expect(metadata).toEqual({
      contextWindow: 32768,
      maxOutputTokens: 8192,
      reasoningEffort: {
        options: ["low", "medium", "xhigh"],
        defaultValue: "low",
      },
    });
    expect(formatReasoningEffort(metadata.reasoningEffort)).toBe(
      "low / medium / xhigh（默认 low）",
    );
  });

  it("does not invent unsupported reasoning levels or context limits", () => {
    expect(commercialModelRuntimeMetadata({
      capabilities: {},
      parameterSchema: {
        properties: {
          reasoning_effort: { type: "string", default: "high" },
        },
      },
    })).toEqual({});
  });

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

  it("maps the canonical cloud image and audio contracts to desktop roles", () => {
    expect(
      commercialModelRoles({
        operation: "IMAGE",
        capabilities: {
          supportedModes: ["TEXT_TO_IMAGE", "IMAGE_TO_IMAGE"],
        },
      }),
    ).toEqual(["IMAGE_GENERATION", "IMAGE_EDIT"]);
    expect(
      commercialModelRoles({
        operation: "AUDIO_VOICE_CLONE",
        capabilities: { supportedModes: ["SPEECH", "VOICE_CLONE"] },
      }),
    ).toEqual(["AUDIO_SPEECH", "AUDIO_VOICE_CLONE"]);
    expect(
      commercialModelRoles({
        operation: "AUDIO_MUSIC",
        capabilities: { supportedModes: ["MUSIC"] },
      }),
    ).toEqual(["AUDIO_MUSIC"]);
    expect(
      commercialModelRoles({
        operation: "AUDIO_VOICE_DESIGN",
        capabilities: { supportedModes: ["VOICE_DESIGN"] },
      }),
    ).toEqual(["AUDIO_VOICE_DESIGN"]);
  });

  it("maps canonical multimodal video capability to reference roles", () => {
    expect(
      commercialModelRoles({
        operation: "VIDEO",
        capabilities: { supportedModes: ["MULTIMODAL_REFERENCE"] },
      }),
    ).toEqual([
      "VIDEO_FIRST_LAST_FRAME",
      "VIDEO_IMAGE_REFERENCE",
      "VIDEO_ALL_REFERENCE",
    ]);
  });
});

const baseStatus = {
  mode: "mixed",
  allowsCustomModels: true,
  gatewayOrigin: "http://122.193.11.199:8889",
  byokConfigured: true,
  cloudModelAssignments: [],
  byokProviders: [],
};

describe("commercial model access status", () => {
  it("projects only explicit BYOK model assignments", () => {
    expect(
      parseCommercialModelAccessStatus({
        ...baseStatus,
        byokProviders: [{
          id: "provider-a",
          name: "Provider A",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "https://models.example.test/v1",
          apiKeyPreview: "sk-a...test",
          configured: true,
          enabled: true,
          priority: 10,
          modelAssignments: [
            { modelId: "speech-model", role: "AUDIO_SPEECH", priority: 1 },
            { modelId: "speech-model", role: "AUDIO_VOICE_CLONE", enabled: false },
          ],
        }],
      }).byokProviders[0].modelAssignments,
    ).toEqual([
      { modelId: "speech-model", role: "AUDIO_SPEECH", priority: 1, enabled: true },
      { modelId: "speech-model", role: "AUDIO_VOICE_CLONE", priority: 101, enabled: false },
    ]);
  });

  it("projects cloud selections independently from BYOK assignments", () => {
    const status = parseCommercialModelAccessStatus({
      ...baseStatus,
      cloudModelAssignments: [{ modelId: "cloud-text", role: "TEXT" }],
      byokProviders: [{
        id: "provider-a",
        name: "Provider A",
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://models.example.test/v1",
        configured: true,
        modelAssignments: [{ modelId: "byok-text", role: "TEXT" }],
      }],
    });

    expect(status.cloudModelAssignments).toEqual([
      { modelId: "cloud-text", role: "TEXT", priority: 100, enabled: true },
    ]);
    expect(status.byokProviders[0].modelAssignments).toEqual([
      { modelId: "byok-text", role: "TEXT", priority: 100, enabled: true },
    ]);
  });

  it("keeps declared metadata separate while local runtime overrides win", () => {
    const [assignment] = parseCommercialModelAccessStatus({
      ...baseStatus,
      cloudModelAssignments: [{
        modelId: "cloud-text",
        role: "TEXT",
        contextWindow: 32768,
        maxOutputTokens: 2048,
        reasoningEfforts: ["low", "medium", "xhigh"],
        defaultReasoningEffort: "low",
        runtimeOverrides: {
          contextWindow: 65536,
          maxOutputTokens: 8192,
          reasoningEfforts: ["medium", "xhigh"],
          defaultReasoningEffort: "xhigh",
        },
      }],
    }).cloudModelAssignments;

    expect(assignment).toMatchObject({
      contextWindow: 32768,
      maxOutputTokens: 2048,
      reasoningEfforts: ["low", "medium", "xhigh"],
      defaultReasoningEffort: "low",
    });
    expect(effectiveModelRuntimeSettings(assignment)).toEqual({
      contextWindow: 65536,
      maxOutputTokens: 8192,
      reasoningEfforts: ["medium", "xhigh"],
      defaultReasoningEffort: "xhigh",
    });
  });

  it("treats a migrated status without assignments as an empty catalog", () => {
    expect(
      parseCommercialModelAccessStatus(baseStatus).byokProviders,
    ).toEqual([]);
  });

  it("rejects unknown BYOK model roles", () => {
    expect(() =>
      parseCommercialModelAccessStatus({
        ...baseStatus,
        byokProviders: [{
          id: "provider-a",
          name: "Provider A",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "https://models.example.test/v1",
          configured: true,
          modelAssignments: [
            { modelId: "unknown-model", role: "PAGE_REQUESTED_OPERATION" },
          ],
        }],
      }),
    ).toThrow("byokProviders[0].modelAssignments[0].role is invalid");
  });

  it("resolves the same global role priority used by the desktop proxy", () => {
    const status = parseCommercialModelAccessStatus({
      ...baseStatus,
      cloudModelAssignments: [
        { modelId: "cloud-clone", role: "AUDIO_VOICE_CLONE", priority: 20 },
      ],
      byokProviders: [
        {
          id: "provider-a",
          name: "Provider A",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "https://models.example.test/v1",
          configured: true,
          enabled: true,
          priority: 10,
          modelAssignments: [
            { modelId: "byok-clone", role: "AUDIO_VOICE_CLONE", priority: 5 },
          ],
        },
      ],
    });

    expect(resolveCommercialModelRoleRoute(status, "AUDIO_VOICE_CLONE")).toEqual({
      modelId: "byok-clone",
      role: "AUDIO_VOICE_CLONE",
      source: "byok",
      providerName: "Provider A",
      selector: "byok:provider-a:byok-clone",
    });
  });

  it("does not define roles without an application call chain", () => {
    expect(BYOK_MODEL_ROLES).toEqual(expect.not.arrayContaining(["RERANK", "MODERATION"]));
    expect(BYOK_MODEL_ROLES).toContain("AUDIO_VOICE_CLONE");
    expect(BYOK_MODEL_ROLES).toContain("AUDIO_VOICE_DESIGN");
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
