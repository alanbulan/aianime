import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommercialInvocationSection } from "@/modules/model_usage/presentation/CommercialInvocationSection";

const translations: Record<string, string> = {
  "common.close": "关闭",
  "settings.invocations.all": "全部",
  "settings.invocations.details": "查看详情",
  "settings.invocations.detailsDescription": "查看本次云端模型调用的状态、额度和请求信息。",
  "settings.invocations.detailsTitle": "调用详情",
  "settings.invocations.model": "模型名称",
  "settings.invocations.reservationId": "额度预占单号",
  "settings.invocations.reservedUnits": "初始预占",
  "settings.invocations.chargedUnits": "最终实扣",
  "settings.invocations.refundedUnits": "退还额度",
  "settings.invocations.balanceChange": "余额变化",
  "settings.invocations.balanceChangeValue": "960 → 952",
  "settings.invocations.quotaUnitsValue": "8 单位",
  "settings.invocations.chargedSummary": "实扣 8",
  "settings.invocations.operation": "操作类型",
  "settings.invocations.page": "第 1 / 1 页",
  "settings.invocations.quotaStatus": "额度状态",
  "settings.invocations.refresh": "刷新调用记录",
  "settings.invocations.status": "状态",
  "settings.invocations.title": "云端模型调用",
  "settings.values.operation.IMAGE": "图片",
  "settings.values.quota.COMMITTED": "已提交",
  "settings.values.quota.HELD": "已预占",
  "settings.values.status.DISPATCHING": "调度中",
  "settings.values.status.RESERVED": "已预占",
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
      status: "RESERVED",
      operation: "IMAGE",
      modelSkuCode: "GPT_IMAGE_2",
      quotaStatus: "COMMITTED",
      reservationId: "reservation-1",
      reservedUnits: 10,
      chargedUnits: 8,
      refundedUnits: 2,
      balanceBefore: 960,
      balanceAfter: 952,
    },
    error: null,
    isLoading: false,
  }),
  useCommercialInvocations: () => ({
    data: {
      items: [
        {
          id: "invocation-1",
          status: "RESERVED",
          operation: "IMAGE",
          modelSkuCode: "GPT_IMAGE_2",
          quotaStatus: "COMMITTED",
          reservedUnits: 10,
          chargedUnits: 8,
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
  useCommercialModelCatalog: () => ({
    data: {
      catalogVersion: "1",
      items: [
        {
          id: "model-1",
          code: "GPT_IMAGE_2",
          displayName: "GPT Image 2",
          operation: "IMAGE",
          capabilities: {},
          parameterSchema: {},
          unitsPerCall: 2,
        },
      ],
    },
  }),
  useSaveCommercialInvocationResult: () => ({ mutateAsync: vi.fn() }),
}));

describe("CommercialInvocationSection", () => {
  it("在当前视口弹出调用详情并本地化预占状态", () => {
    render(<CommercialInvocationSection active bridgeAvailable />);

    expect(screen.getByText(/已预占/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    const dialog = screen.getByRole("dialog", { name: "调用详情" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("GPT Image 2");
    expect(dialog).not.toHaveTextContent("GPT_IMAGE_2");
    expect(dialog).toHaveTextContent("已预占");
    expect(dialog).toHaveTextContent("已提交");
    expect(dialog).toHaveTextContent("额度预占单号");
    expect(dialog).toHaveTextContent("reservation-1");
    expect(dialog).toHaveTextContent("最终实扣");
    expect(dialog).toHaveTextContent("960 → 952");
  });
});
