import type {
  ByokModelAssignment,
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
    baseUrl: string;
    apiKey?: string;
    modelAssignments?: ByokModelAssignment[];
  }): Promise<CommercialModelAccessStatus>;
  selectCloud(
    modelAssignments?: ByokModelAssignment[],
  ): Promise<CommercialModelAccessStatus>;
  clearByok(): Promise<CommercialModelAccessStatus>;
}
