import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommercialInvocationSection } from "@/modules/model_usage/presentation/CommercialInvocationSection";

const translations: Record<string, string> = {
  "common.close": "关闭",
  "settings.invocations.all": "全部",
  "settings.invocations.details": "查看详情",
  "settings.invocations.detailsDescription": "查看本次云端模型调用的状态、额度和请求信息。",
  "settings.invocations.detailsTitle": "调用详情",
  "settings.invocations.id": "调用 ID",
  "settings.invocations.model": "模型 SKU",
  "settings.invocations.operation": "操作类型",
  "settings.invocations.page": "第 1 / 1 页",
  "settings.invocations.quotaStatus": "额度状态",
  "settings.invocations.refresh": "刷新调用记录",
  "settings.invocations.status": "状态",
  "settings.invocations.title": "云端模型调用",
  "settings.values.operation.IMAGE": "图片",
  "settings.values.quota.COMMITTED": "已提交",
  "settings.values.status.SUCCEEDED": "已成功",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      translations[key] ?? options?.defaultValue ?? key,
  }),
}));

vi.mock("@/modules/model_usage/composition", () => ({
  useCancelCommercialInvocation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useCommercialInvocationDetails: () => ({
    data: {
      id: "invocation-1",
      status: "SUCCEEDED",
      operation: "IMAGE",
      modelSkuCode: "GPT_IMAGE_2",
      quotaStatus: "COMMITTED",
    },
    error: null,
    isLoading: false,
  }),
  useCommercialInvocations: () => ({
    data: {
      items: [
        {
          id: "invocation-1",
          status: "SUCCEEDED",
          operation: "IMAGE",
          modelSkuCode: "GPT_IMAGE_2",
          quotaStatus: "COMMITTED",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    },
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useSaveCommercialInvocationResult: () => ({ mutateAsync: vi.fn() }),
}));

describe("CommercialInvocationSection", () => {
  it("在当前视口弹出调用详情并本地化额度状态", () => {
    render(<CommercialInvocationSection active bridgeAvailable />);

    expect(screen.getByText(/已提交/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    const dialog = screen.getByRole("dialog", { name: "调用详情" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("GPT_IMAGE_2");
    expect(dialog).toHaveTextContent("已提交");
  });
});
