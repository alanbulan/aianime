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
  async clearByok() {
    return parseCommercialModelAccessStatus(
      await invokeCommercial(() => requireCommercialBridge().clearByok()),
    );
  },
};
