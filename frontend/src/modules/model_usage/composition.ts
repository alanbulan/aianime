import { createGenerationCreditQueries } from "@/modules/model_usage/application/query-hooks";
import { httpGenerationCreditGateway } from "@/modules/model_usage/infrastructure/http-generation-credit-gateway";

const generationCreditQueries = createGenerationCreditQueries(
  httpGenerationCreditGateway,
);

export const { useGenerationCreditCost, useGenerationCreditCosts } =
  generationCreditQueries;
