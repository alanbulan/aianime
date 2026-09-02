import { useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCancelCommercialInvocation,
  useCommercialInvocationDetails,
  useCommercialInvocations,
  useCommercialModelCatalog,
  useSaveCommercialInvocationResult,
} from "@/modules/model_usage/composition";
import type { CommercialModelCatalogItem } from "@/modules/model_usage/domain/commercial-model-access";
import {
  canCancelCommercialInvocation,
  canSaveCommercialInvocationResult,
  isCommercialQuotaPending,
  type CommercialInvocation,
  type CommercialInvocationId,
} from "@/modules/model_usage/domain/commercial-invocation";
import {
  commercialValueLabel,
  type CommercialValueGroup,
} from "@/shared/commercial-value-label";

const PAGE_SIZE = 20;

export function CommercialInvocationSection({
  active,
  bridgeAvailable,
}: {
  active: boolean;
  bridgeAvailable: boolean;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [operation, setOperation] = useState("");
  const [selectedId, setSelectedId] = useState<CommercialInvocationId | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CommercialInvocation | null>(null);
  const list = useCommercialInvocations(
    { page, pageSize: PAGE_SIZE, status, operation },
    active && bridgeAvailable,
  );
  const details = useCommercialInvocationDetails(
    selectedId,
    active && bridgeAvailable,
  );
  const cancelInvocation = useCancelCommercialInvocation();
  const saveResult = useSaveCommercialInvocationResult();
  const modelCatalog = useCommercialModelCatalog(
    undefined,
    active && bridgeAvailable,
    "cloud",
  );
  const catalogItemsByCode = useMemo(
    () =>
      new Map(
        (modelCatalog.data?.items ?? []).map((item) => [
          normalizeModelCode(item.code),
          item,
        ]),
      ),
    [modelCatalog.data?.items],
  );
  const pageCount = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));

  if (!bridgeAvailable) {
    return <InlineNotice>{t("settings.invocations.desktopRequired")}</InlineNotice>;
  }

  return (
    <section className="space-y-4 px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">
          {t("settings.invocations.title")}
        </h3>
        <div className="flex items-center gap-2">
          <InvocationFilter
            label={t("settings.invocations.status")}
            valueGroup="status"
            value={status}
            values={["", "PENDING", "RESERVED", "DISPATCHING", "RUNNING", "STREAMING", "CANCEL_REQUESTED", "SUCCEEDED", "FAILED", "CANCELLED"]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <InvocationFilter
            label={t("settings.invocations.operation")}
            valueGroup="operation"
            value={operation}
            values={["", "TEXT", "IMAGE", "VIDEO", "AUDIO"]}
            onChange={(value) => {
              setOperation(value);
              setPage(1);
            }}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            data-ui-tooltip={t("settings.invocations.refresh")}
            aria-label={t("settings.invocations.refresh")}
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            <RefreshCw className={list.isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {list.isLoading ? (
        <div className="flex h-28 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : null}
      {list.error ? (
        <InlineNotice>
          {errorMessage(list.error, t("settings.invocations.loadFailed"))}
        </InlineNotice>
      ) : null}
      {!list.isLoading && !list.error && list.data?.items.length === 0 ? (
        <p className="border-y border-border py-8 text-center text-xs text-muted-foreground">
          {t("settings.invocations.empty")}
        </p>
      ) : null}

      <div className="divide-y divide-border border-y border-border">
        {(list.data?.items ?? []).map((invocation) => (
          <InvocationRow
            key={String(invocation.id)}
            invocation={invocation}
            modelLabel={resolveModelLabel(invocation, catalogItemsByCode, t)}
            selected={String(selectedId ?? "") === String(invocation.id)}
            onDetails={() => setSelectedId(invocation.id)}
            onCancel={() => setCancelTarget(invocation)}
            onSave={() =>
              void saveResult
                .mutateAsync(invocation.id)
                .then((result) => {
                  if (result.saved) {
                    toast.success(
                      t("settings.invocations.saved", {
                        fileName: result.fileName ?? "",
                      }),
                    );
                  }
                })
                .catch((saveError: unknown) =>
                  toast.error(
                    errorMessage(saveError, t("settings.invocations.saveFailed")),
                  ),
                )
            }
          />
        ))}
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-[11px] text-muted-foreground">
          {t("settings.invocations.page", { page, pageCount })}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          data-ui-tooltip={t("settings.invocations.previousPage")}
          aria-label={t("settings.invocations.previousPage")}
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          data-ui-tooltip={t("settings.invocations.nextPage")}
          aria-label={t("settings.invocations.nextPage")}
          disabled={page >= pageCount}
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
        >
          <ChevronRight />
        </Button>
      </div>

      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          className="max-h-[80vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
          showCloseButton={false}
        >
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>{t("settings.invocations.detailsTitle")}</DialogTitle>
            <DialogDescription className="text-xs">
              {t("settings.invocations.detailsDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <InvocationDetails
              invocation={details.data}
              catalogItemsByCode={catalogItemsByCode}
              loading={details.isLoading}
              error={details.error}
            />
          </div>
          <DialogFooter className="border-t border-border px-5 py-3">
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t("common.close")}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.invocations.cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.invocations.cancelDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={cancelInvocation.isPending}
              onClick={() => {
                if (!cancelTarget) return;
                const id = cancelTarget.id;
                setCancelTarget(null);
                void cancelInvocation
                  .mutateAsync({
                    id,
                    reason: t("settings.invocations.cancelReason"),
                  })
                  .then(() => toast.success(t("settings.invocations.cancelled")))
                  .catch((cancelError: unknown) =>
                    toast.error(
                      cancelErrorMessage(
                        cancelError,
                        t("settings.invocations.cancelFailed"),
                        t,
                      ),
                    ),
                  );
              }}
            >
              {t("settings.invocations.confirmCancel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function InvocationFilter({
  label,
  valueGroup,
  value,
  values,
  onChange,
}: {
  label: string;
  valueGroup: CommercialValueGroup;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value || "ALL"} onValueChange={(next) => onChange(next === "ALL" ? "" : next ?? "")}>
      <SelectTrigger className="h-7 w-28" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {values.map((item) => (
          <SelectItem key={item || "ALL"} value={item || "ALL"}>
            {item
              ? commercialValueLabel(t, valueGroup, item)
              : t("settings.invocations.all")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InvocationRow({
  invocation,
  modelLabel,
  selected,
  onDetails,
  onCancel,
  onSave,
}: {
  invocation: CommercialInvocation;
  modelLabel: string;
  selected: boolean;
  onDetails: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const quotaSummary =
    isCommercialQuotaPending(invocation.quotaStatus)
      ? t("settings.invocations.reservedSummary", { count: invocation.reservedUnits })
      : invocation.chargedUnits !== undefined
      ? t("settings.invocations.chargedSummary", {
          count: invocation.chargedUnits,
        })
      : invocation.reservedUnits !== undefined
        ? t("settings.invocations.reservedSummary", {
            count: invocation.reservedUnits,
          })
        : "";
  return (
    <div className={selected ? "bg-muted/45 px-1 py-2" : "px-1 py-2"}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {modelLabel}
            </p>
            <StatusBadge status={invocation.status} />
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatDate(invocation.createdAt) ?? String(invocation.id)}
            {invocation.quotaStatus
              ? ` · ${commercialValueLabel(t, "quota", invocation.quotaStatus)}`
              : ""}
            {quotaSummary ? ` · ${quotaSummary}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon-xs" variant="ghost" data-ui-tooltip={t("settings.invocations.details")} aria-label={t("settings.invocations.details")} onClick={onDetails}>
            <Eye />
          </Button>
          {canCancelCommercialInvocation(invocation.status) ? (
            <Button type="button" size="icon-xs" variant="ghost" data-ui-tooltip={t("settings.invocations.cancel")} aria-label={t("settings.invocations.cancel")} onClick={onCancel}>
              <XCircle />
            </Button>
          ) : null}
          {canSaveCommercialInvocationResult(invocation.status) ? (
            <Button type="button" size="icon-xs" variant="ghost" data-ui-tooltip={t("settings.invocations.saveResult")} aria-label={t("settings.invocations.saveResult")} onClick={onSave}>
              <Download />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InvocationDetails({
  invocation,
  catalogItemsByCode,
  loading,
  error,
}: {
  invocation: CommercialInvocation | undefined;
  catalogItemsByCode: ReadonlyMap<string, CommercialModelCatalogItem>;
  loading: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  if (loading) {
    return <div className="flex h-16 items-center justify-center"><Loader2 className="size-4 animate-spin" /></div>;
  }
  if (error) return <InlineNotice>{errorMessage(error, t("settings.invocations.detailsFailed"))}</InlineNotice>;
  if (!invocation) return null;
  const quotaPending = isCommercialQuotaPending(invocation.quotaStatus);
  const pendingLabel = t("settings.invocations.settlementPending");
  const fields = [
    [
      t("settings.invocations.status"),
      commercialValueLabel(t, "status", invocation.status),
    ],
    [
      t("settings.invocations.operation"),
      invocation.operation
        ? commercialValueLabel(t, "operation", invocation.operation)
        : undefined,
    ],
    [
      t("settings.invocations.model"),
      resolveModelLabel(invocation, catalogItemsByCode, t),
    ],
    [
      t("settings.invocations.quotaStatus"),
      invocation.quotaStatus
        ? commercialValueLabel(t, "quota", invocation.quotaStatus)
        : undefined,
    ],
    [
      t("settings.invocations.reservationId"),
      invocation.reservationId === undefined
        ? undefined
        : String(invocation.reservationId),
    ],
    [
      t("settings.invocations.reservedUnits"),
      formatQuotaUnits(invocation.reservedUnits, t),
    ],
    [
      t("settings.invocations.chargedUnits"),
      quotaPending ? pendingLabel : formatQuotaUnits(invocation.chargedUnits, t),
    ],
    [
      t("settings.invocations.refundedUnits"),
      quotaPending ? pendingLabel : formatQuotaUnits(invocation.refundedUnits, t),
    ],
    [
      t("settings.invocations.balanceChange"),
      quotaPending ? pendingLabel : invocation.balanceBefore === undefined || invocation.balanceAfter === undefined
        ? undefined
        : t("settings.invocations.balanceChangeValue", {
            before: invocation.balanceBefore,
            after: invocation.balanceAfter,
          }),
    ],
    [t("settings.invocations.createdAt"), formatDate(invocation.createdAt)],
    [t("settings.invocations.completedAt"), formatDate(invocation.completedAt)],
  ].filter((field): field is [string, string] => Boolean(field[1]));
  return (
    <div>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        {fields.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-all text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {quotaPending ? (
        <p className="mt-4 border-l-2 border-warning pl-3 text-[11px] leading-5 text-muted-foreground">
          {t("settings.invocations.quotaSettlementPending")}
        </p>
      ) : null}
      {invocation.errorMessage ? (
        <p className="mt-3 border-l-2 border-destructive pl-3 text-xs text-destructive">
          {invocation.errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function formatQuotaUnits(
  value: number | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | undefined {
  return value === undefined
    ? undefined
    : t("settings.invocations.quotaUnitsValue", { count: value });
}

function resolveModelLabel(
  invocation: CommercialInvocation,
  catalogItemsByCode: ReadonlyMap<string, CommercialModelCatalogItem>,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const item = catalogItemsByCode.get(normalizeModelCode(invocation.modelCode));
  if (item?.displayName.trim()) return item.displayName.trim();
  return t("settings.invocations.unknownModel");
}

function normalizeModelCode(value: string): string {
  return value.trim().toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const normalized = status.trim().toUpperCase();
  const tone = normalized === "SUCCEEDED" || normalized === "SUCCESS" || normalized === "COMPLETED"
    ? "bg-success/10 text-success"
    : normalized === "FAILED"
      ? "bg-destructive/10 text-destructive"
      : normalized === "CANCELLED" || normalized === "CANCELED"
        ? "bg-muted text-muted-foreground"
        : "bg-warning/10 text-warning";
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>
      {commercialValueLabel(t, "status", status)}
    </span>
  );
}

function InlineNotice({ children }: React.PropsWithChildren) {
  return <div className="border-y border-warning/35 bg-warning/10 px-3 py-3 text-xs text-warning">{children}</div>;
}

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function cancelErrorMessage(
  error: unknown,
  fallback: string,
  t: TFunction,
): string {
  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  const message = errorMessage(error, fallback);
  if (
    status === 409 ||
    message.trim().toLowerCase() ===
      "relay invocation state does not allow this operation"
  ) {
    return t("settings.invocations.cancelStateConflict");
  }
  return message;
}
