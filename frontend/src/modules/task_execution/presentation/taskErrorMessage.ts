// Copyright (c) 2026 AI anime
import type { TFunction } from "i18next";
import {
  backendErrorCodeToastMessage,
  humanizeTaskError,
  REMOTE_MODEL_QUOTA_CODE,
} from "@/shared/api/errors";
import type { TaskState } from "@/modules/task_execution/domain/contracts";

export function taskErrorMessage(task: TaskState, t: TFunction): string {
  const localized = backendErrorCodeToastMessage(
    task.error_code,
    task.error || t("common.error"),
    t,
  );
  if (localized) return localized;
  if (task.error_code === REMOTE_MODEL_QUOTA_CODE) {
    return t("common.modelQuotaExceeded", {
      defaultValue: task.error || t("common.error"),
    });
  }
  return humanizeTaskError(task.error, t);
}
