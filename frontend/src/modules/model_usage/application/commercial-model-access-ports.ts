import type {
  ByokModelAssignment,
  CommercialModelCatalog,
  CommercialModelCatalogItem,
  CommercialModelAccessStatus,
  CommercialQuota,
} from "@/modules/model_usage/domain/commercial-model-access";

export interface CommercialModelAccessGateway {
  fetchQuota(): Promise<CommercialQuota>;
  fetchCatalog(operation?: string): Promise<CommercialModelCatalog>;
  fetchModelDetails(sku: string): Promise<CommercialModelCatalogItem>;
  fetchAccessStatus(): Promise<CommercialModelAccessStatus>;
  configureByok(input: {
    baseUrl: string;
    apiKey?: string;
    modelAssignments?: ByokModelAssignment[];
  }): Promise<CommercialModelAccessStatus>;
  selectCloud(): Promise<CommercialModelAccessStatus>;
  clearByok(): Promise<CommercialModelAccessStatus>;
}
