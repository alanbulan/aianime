import type {
  CommercialModelCatalog,
  CommercialModelCatalogItem,
} from "@/modules/model_usage/public";

export interface KnowledgeModelOption {
  code: string;
  label: string;
}

export interface KnowledgeModelSelection {
  textModel: string;
  embeddingModel: string;
}

export function knowledgeModelOptions(
  items: readonly CommercialModelCatalogItem[],
  operation: "TEXT" | "EMBEDDING",
): KnowledgeModelOption[] {
  const unique = new Map<string, KnowledgeModelOption>();
  for (const item of items) {
    if (item.operation.trim().toUpperCase() !== operation) continue;
    const code = item.code.trim();
    if (!code || unique.has(code)) continue;
    unique.set(code, {
      code,
      label: item.displayName.trim() || code,
    });
  }
  return Array.from(unique.values());
}

export function defaultKnowledgeModelSelection(
  textCatalog: CommercialModelCatalog,
  embeddingCatalog: CommercialModelCatalog,
): KnowledgeModelSelection {
  const textModel = knowledgeModelOptions(textCatalog.items, "TEXT")[0]?.code;
  const embeddingModel = knowledgeModelOptions(
    embeddingCatalog.items,
    "EMBEDDING",
  )[0]?.code;
  if (!textModel || !embeddingModel) {
    throw new Error("The story knowledge base requires TEXT and EMBEDDING models");
  }
  return { textModel, embeddingModel };
}
