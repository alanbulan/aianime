import type { CommercialModelAccessGateway } from "@/modules/model_usage/application/commercial-model-access-ports";
import {
  parseCommercialModelCatalog,
  parseCommercialModelCatalogItem,
  parseCommercialModelAccessStatus,
  parseCommercialQuota,
} from "@/modules/model_usage/domain/commercial-model-access";
import {
  invokeCommercial,
  requireCommercialBridge,
} from "@/shared/commercial-bridge";

export const electronCommercialModelAccessGateway: CommercialModelAccessGateway = {
  async fetchQuota() {
    return parseCommercialQuota(
      await invokeCommercial(() => requireCommercialBridge().quotaBalance()),
    );
  },
  async fetchCatalog(operation, source = "active") {
    return parseCommercialModelCatalog(
      await invokeCommercial(() =>
        requireCommercialBridge().modelCatalog({
          ...(operation ? { operation } : {}),
          source,
        }),
      ),
    );
  },
  async fetchModelDetails(sku) {
    return parseCommercialModelCatalogItem(
      await invokeCommercial(() => requireCommercialBridge().modelDetails(sku)),
    );
  },
  async fetchAccessStatus() {
    return parseCommercialModelAccessStatus(
      await invokeCommercial(() => requireCommercialBridge().modelAccessStatus()),
    );
  },
  async configureByok(input) {
    return parseCommercialModelAccessStatus(
      await invokeCommercial(() =>
        requireCommercialBridge().configureByok(input),
      ),
    );
  },
  async selectCloud(modelAssignments) {
    return parseCommercialModelAccessStatus(
      await invokeCommercial(() =>
        requireCommercialBridge().selectCloudModels({ modelAssignments }),
      ),
    );
  },
  async clearByok(providerId) {
    return parseCommercialModelAccessStatus(
      await invokeCommercial(() =>
        requireCommercialBridge().clearByok(
          providerId ? { providerId } : undefined,
        ),
      ),
    );
  },
  async fetchByokProviderModels(input) {
    const value = await invokeCommercial(() =>
      requireCommercialBridge().byokProviderModels(input),
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("BYOK 模型目录响应无效");
    }
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.models)) {
      throw new Error("BYOK 模型目录缺少 models");
    }
    return {
      providerId: String(record.providerId ?? "").trim(),
      catalogVersion: String(record.catalogVersion ?? "").trim(),
      models: record.models.map((item) => String(item).trim()).filter(Boolean),
    };
  },
};
