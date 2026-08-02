import type { CommercialModelAccessGateway } from "@/modules/model_usage/application/commercial-model-access-ports";
import {
  parseCommercialModelCatalog,
  parseCommercialModelAccessStatus,
  parseCommercialQuota,
} from "@/modules/model_usage/domain/commercial-model-access";

function bridge(): AIAnimeCommercialBridge {
  const commercial = window.aiAnimeDesktop?.commercial;
  if (!commercial) throw new Error("Commercial Gateway requires the Electron desktop app");
  return commercial;
}

export const electronCommercialModelAccessGateway: CommercialModelAccessGateway = {
  async fetchQuota() {
    return parseCommercialQuota(await bridge().quotaBalance());
  },
  async fetchCatalog(operation) {
    return parseCommercialModelCatalog(
      await bridge().modelCatalog(operation ? { operation } : {}),
    );
  },
  async fetchAccessStatus() {
    return parseCommercialModelAccessStatus(await bridge().modelAccessStatus());
  },
  async configureByok(input) {
    return parseCommercialModelAccessStatus(await bridge().configureByok(input));
  },
  async selectCloud() {
    return parseCommercialModelAccessStatus(await bridge().selectCloudModels());
  },
  async clearByok() {
    return parseCommercialModelAccessStatus(await bridge().clearByok());
  },
};
