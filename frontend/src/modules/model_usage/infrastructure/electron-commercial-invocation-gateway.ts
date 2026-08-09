import type { CommercialInvocationGateway } from "@/modules/model_usage/application/commercial-invocation-ports";
import {
  parseCommercialInvocationDetails,
  parseCommercialInvocationList,
} from "@/modules/model_usage/domain/commercial-invocation";
import {
  invokeCommercial,
  requireCommercialBridge,
} from "@/shared/commercial-bridge";

export const electronCommercialInvocationGateway: CommercialInvocationGateway = {
  async list(query) {
    return parseCommercialInvocationList(
      await invokeCommercial(() => requireCommercialBridge().invocationList(query)),
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
  saveResult(id) {
    return invokeCommercial(() => requireCommercialBridge().saveInvocationResult(id));
  },
};
