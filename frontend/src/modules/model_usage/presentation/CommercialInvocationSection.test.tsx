import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommercialInvocationSection } from "@/modules/model_usage/presentation/CommercialInvocationSection";

const mocks = vi.hoisted(() => ({
  cancelInvocation: vi.fn(),
  invocationStatus: "RESERVED",
  quotaStatus: "COMMITTED",
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const translations: Record<string, string> = {
  "common.cancel": "返回",
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
  "settings.invocations.reservedSummary": "预占 10",
  "settings.invocations.settlementPending": "待结算",
  "settings.invocations.quotaSettlementPending": "额度尚未结算，以服务端确认结果为准。",
  "settings.invocations.cancel": "取消调用",
  "settings.invocations.cancelDescription": "将请求取消当前调用。",
  "settings.invocations.cancelReason": "用户主动取消调用",
  "settings.invocations.cancelStateConflict": "当前调用状态不允许取消",
  "settings.invocations.cancelTitle": "取消这次调用？",
  "settings.invocations.confirmCancel": "确认取消",
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
  "settings.values.status.REJECTED_NO_COST": "已拒绝（未扣费）",
  "settings.values.status.RESERVED": "已预占",
  "settings.values.status.CANCEL_REQUESTED": "取消处理中",
  "settings.values.status.STREAMING": "正在输出",
  "settings.values.status.SUCCEEDED": "已成功",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      translations[key] ?? options?.defaultValue ?? key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/modules/model_usage/composition", () => ({
  useCancelCommercialInvocation: () => ({
    isPending: false,
    mutateAsync: mocks.cancelInvocation,
  }),
  useCommercialInvocationDetails: () => ({
    data: {
      id: "11111111-1111-4111-8111-111111111111",
      modelCode: "GPT_IMAGE_2",
      operation: "IMAGE",
      executionMode: "SYNC",
      status: mocks.invocationStatus,
      quotaStatus: mocks.quotaStatus,
      reservationId: "22222222-2222-4222-8222-222222222222",
      reservedUnits: 10,
      chargedUnits: 8,
      refundedUnits: 2,
      balanceBefore: 960,
      balanceAfter: 952,
      errorCode: "",
      errorMessage: "",
      createdAt: "2026-08-01T00:00:00Z",
      startedAt: "2026-08-01T00:00:01Z",
      completedAt: "",
      durationMs: 0,
    },
    error: null,
    isLoading: false,
  }),
  useCommercialInvocations: () => ({
    data: {
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          modelCode: "GPT_IMAGE_2",
          operation: "IMAGE",
          executionMode: "SYNC",
          status: mocks.invocationStatus,
          quotaStatus: mocks.quotaStatus,
          reservationId: "22222222-2222-4222-8222-222222222222",
          reservedUnits: 10,
          chargedUnits: 8,
          refundedUnits: 2,
          balanceBefore: 960,
          balanceAfter: 952,
          errorCode: "",
          errorMessage: "",
          createdAt: "2026-08-01T00:00:00Z",
          startedAt: "2026-08-01T00:00:01Z",
          completedAt: "",
          durationMs: 0,
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
          id: "33333333-3333-4333-8333-333333333333",
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
  beforeEach(() => {
    mocks.invocationStatus = "RESERVED";
    mocks.quotaStatus = "COMMITTED";
    mocks.cancelInvocation.mockReset();
    mocks.cancelInvocation.mockResolvedValue({});
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

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
    expect(dialog).toHaveTextContent(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(dialog).toHaveTextContent("最终实扣");
    expect(dialog).toHaveTextContent("960 → 952");
  });

  it("本地化未扣费拒绝终态且不提供取消操作", () => {
    mocks.invocationStatus = "REJECTED_NO_COST";

    render(<CommercialInvocationSection active bridgeAvailable />);

    expect(screen.getByText("已拒绝（未扣费）")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "取消调用" }),
    ).not.toBeInTheDocument();
  });

  it("取消处理中显示预占与待结算，不显示提前退款或重复取消按钮", () => {
    mocks.invocationStatus = "CANCEL_REQUESTED";
    mocks.quotaStatus = "HELD";
    render(<CommercialInvocationSection active bridgeAvailable />);

    expect(screen.getByText("取消处理中")).toBeInTheDocument();
    expect(screen.getByText(/预占 10/)).toBeInTheDocument();
    expect(screen.queryByText(/实扣 8/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消调用" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));
    const dialog = screen.getByRole("dialog", { name: "调用详情" });
    expect(dialog).toHaveTextContent("待结算");
    expect(dialog).not.toHaveTextContent("960 → 952");
    expect(dialog).not.toHaveTextContent("CANCEL_REQUESTED");
    expect(dialog).not.toHaveTextContent("HELD");
  });

  it("将 relay 调用状态冲突转换为本地化提示", async () => {
    mocks.cancelInvocation.mockRejectedValueOnce(
      Object.assign(
        new Error("relay invocation state does not allow this operation"),
        { status: 409 },
      ),
    );

    render(<CommercialInvocationSection active bridgeAvailable />);

    fireEvent.click(screen.getByRole("button", { name: "取消调用" }));
    fireEvent.click(screen.getByRole("button", { name: "确认取消" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("当前调用状态不允许取消"),
    );
  });
});
