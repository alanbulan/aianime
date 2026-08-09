import type {
  CommercialInvocation,
  CommercialInvocationId,
  CommercialInvocationList,
} from "@/modules/model_usage/domain/commercial-invocation";

export interface CommercialInvocationQuery {
  page: number;
  pageSize: number;
  status?: string;
  operation?: string;
}

export interface CommercialInvocationSaveResult {
  saved: boolean;
  fileName?: string;
}

export interface CommercialInvocationGateway {
  list(query: CommercialInvocationQuery): Promise<CommercialInvocationList>;
  details(id: CommercialInvocationId): Promise<CommercialInvocation>;
  cancel(
    id: CommercialInvocationId,
    reason: string,
  ): Promise<CommercialInvocation>;
  saveResult(
    id: CommercialInvocationId,
  ): Promise<CommercialInvocationSaveResult>;
}
