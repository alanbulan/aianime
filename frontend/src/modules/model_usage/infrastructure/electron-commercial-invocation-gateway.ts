import type { CommercialInvocationGateway } from "@/modules/model_usage/application/commercial-invocation-ports";
import {
  parseCommercialInvocationDetails,
  parseCommercialInvocationList,
  parseCommercialInvocationSaveResult,
} from "@/modules/model_usage/domain/commercial-invocation";
import {
  invokeCommercial,
  requireCommercialBridge,
} from "@/shared/commercial-bridge";

export const electronCommercialInvocationGateway: CommercialInvocationGateway = {
  async list(query) {
    return parseCommercialInvocationList(
      await invokeCommercial(() =>
        requireCommercialBridge().invocationList({
          status: query.status,
          operation: query.operation,
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        }),
      ),
      { page: query.page, pageSize: query.pageSize },
    );
  },
  async details(id) {
    return parseCommercialInvocationDetails(
      await invokeCommercial(() =>
        requireCommercialBridge().invocationDetails(id),
      ),
    );
  },
  async cancel(id, reason) {
    return parseCommercialInvocationDetails(
      await invokeCommercial(() =>
        requireCommercialBridge().cancelInvocation({ id, reason }),
      ),
    );
  },
  async saveResult(id) {
    return parseCommercialInvocationSaveResult(
      await invokeCommercial(() =>
        requireCommercialBridge().saveInvocationResult(id),
      ),
    );
  },
};
