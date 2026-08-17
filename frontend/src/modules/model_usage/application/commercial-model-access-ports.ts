import type {
  ByokModelAssignment,
  ByokProviderModelDiscoveryInput,
  ByokProviderProtocol,
  CommercialModelCatalog,
  CommercialModelCatalogItem,
  CommercialModelAccessStatus,
  CommercialModelCatalogSource,
  CommercialQuota,
} from "@/modules/model_usage/domain/commercial-model-access";

export interface CommercialModelAccessGateway {
  fetchQuota(): Promise<CommercialQuota>;
  fetchCatalog(
    operation?: string,
    source?: CommercialModelCatalogSource,
  ): Promise<CommercialModelCatalog>;
  fetchModelDetails(sku: string): Promise<CommercialModelCatalogItem>;
  fetchAccessStatus(): Promise<CommercialModelAccessStatus>;
  configureByok(input: {
    providerId?: string;
    name?: string;
    protocol?: ByokProviderProtocol;
    baseUrl: string;
    apiKey?: string;
    enabled?: boolean;
    priority?: number;
    modelAssignments?: ByokModelAssignment[];
  }): Promise<CommercialModelAccessStatus>;
  selectCloud(
    modelAssignments?: ByokModelAssignment[],
  ): Promise<CommercialModelAccessStatus>;
  clearByok(providerId?: string): Promise<CommercialModelAccessStatus>;
  fetchByokProviderModels(input: ByokProviderModelDiscoveryInput): Promise<{
    providerId: string;
    models: string[];
    catalogVersion: string;
  }>;
}
