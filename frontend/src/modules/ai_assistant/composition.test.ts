// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const modelUsageMocks = vi.hoisted(() => ({
  clearCommercialModelCatalogCache: vi.fn(),
  loadCommercialModelAccessStatus: vi.fn(),
  loadCommercialModelCatalog: vi.fn(),
}));

vi.mock("@/modules/model_usage/public", async () => {
  const actual = await vi.importActual<typeof import("@/modules/model_usage/public")>(
    "@/modules/model_usage/public",
  );
  return { ...actual, ...modelUsageMocks };
});

import type {
  CommercialModelAccessStatus,
  CommercialModelCatalog,
} from "@/modules/model_usage/public";
import { buildChatModelEntries, loadChatModels } from "./composition";

describe("chat model composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes the catalog before reading synchronized route metadata", async () => {
    const events: string[] = [];
    let resolveCatalog!: (catalog: CommercialModelCatalog) => void;
    const catalogPromise = new Promise<CommercialModelCatalog>((resolve) => {
      resolveCatalog = resolve;
    });
    const catalog: CommercialModelCatalog = {
      catalogVersion: "active-v2",
      items: [{
        id: "qwen",
        code: "QWEN3_8_27B",
        displayName: "Qwen3.8-27B",
        operation: "TEXT",
        capabilities: { routeSelector: "cloud:QWEN3_8_27B" },
        parameterSchema: {},
      }],
    };
    const status: CommercialModelAccessStatus = {
      mode: "mixed",
      allowsCustomModels: false,
      gatewayOrigin: "http://127.0.0.1:5174",
      cloudModelAssignments: [{
        modelId: "QWEN3_8_27B",
        role: "TEXT",
        priority: 100,
        enabled: true,
        reasoningEfforts: ["none", "low", "medium", "high"],
        defaultReasoningEffort: "low",
      }],
      byokConfigured: false,
      byokProviders: [],
    };
    modelUsageMocks.clearCommercialModelCatalogCache.mockImplementation(() => {
      events.push("clear");
    });
    modelUsageMocks.loadCommercialModelCatalog.mockImplementation(() => {
      events.push("catalog");
      return catalogPromise;
    });
    modelUsageMocks.loadCommercialModelAccessStatus.mockImplementation(async () => {
      events.push("status");
      return status;
    });

    const loading = loadChatModels();
    await Promise.resolve();

    expect(events).toEqual(["clear", "catalog"]);
    expect(modelUsageMocks.loadCommercialModelAccessStatus).not.toHaveBeenCalled();

    resolveCatalog(catalog);
    const entries = await loading;

    expect(events).toEqual(["clear", "catalog", "status"]);
    expect(entries.find((entry) => entry.id === "cloud:QWEN3_8_27B"))
      .toMatchObject({
        reasoningEfforts: ["none", "low", "medium", "high"],
        defaultReasoningEffort: "low",
      });
  });

  it("uses exact catalog routes only for presentation and route status for runtime settings", () => {
    const status: CommercialModelAccessStatus = {
      mode: "mixed",
      allowsCustomModels: true,
      gatewayOrigin: "http://127.0.0.1:5174",
      cloudModelAssignments: [
        {
          modelId: "gpt-5",
          role: "TEXT",
          priority: 100,
          enabled: true,
        },
      ],
      byokConfigured: true,
      byokProviders: [
        {
          id: "provider-a",
          name: "Provider A",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "https://models.example.test/v1",
          apiKeyPreview: "sk-***",
          configured: true,
          enabled: true,
          priority: 10,
          modelAssignments: [
            {
              modelId: "gpt-5",
              role: "TEXT",
              priority: 10,
              enabled: true,
            },
          ],
        },
      ],
    };
    const catalog: CommercialModelCatalog = {
      catalogVersion: "active-v1",
      items: [
        {
          id: "gpt-5",
          code: "gpt-5",
          displayName: "Cloud GPT-5",
          operation: "TEXT",
          capabilities: { routeSelector: "cloud:gpt-5" },
          parameterSchema: {
            type: "object",
            properties: {
              reasoning_effort: {
                type: "string",
                enum: ["low", "high"],
                default: "low",
              },
            },
          },
        },
      ],
    };

    const entries = buildChatModelEntries(status, catalog);

    expect(entries.find((entry) => entry.id === "cloud:gpt-5")).toMatchObject({
      label: "Cloud GPT-5",
    });
    expect(entries.find((entry) => entry.id === "cloud:gpt-5"))
      .not.toHaveProperty("reasoningEfforts");
    expect(entries.find((entry) => entry.id === "byok:provider-a:gpt-5")).toMatchObject({
      label: "gpt-5",
    });
    expect(entries.find((entry) => entry.id === "byok:provider-a:gpt-5"))
      .not.toHaveProperty("reasoningEfforts");
    expect(entries.find((entry) => entry.id === "auto"))
      .not.toHaveProperty("reasoningEfforts");
  });
});
