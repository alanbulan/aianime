// Copyright (c) 2026 AI anime
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApprovalRequest } from "@/modules/ai_assistant/domain/contracts";

export function ApprovalCard({
  approval,
  onResolve,
}: {
  approval: ApprovalRequest;
  onResolve: (decision: "allow-once" | "allow-always" | "deny") => void;
}) {
  const { t } = useTranslation();
  const remaining = approval.expiresAtMs
    ? Math.max(0, Math.ceil((approval.expiresAtMs - Date.now()) / 1000))
    : null;

  return (
    <div className="border-b border-warning/20 bg-warning/10 px-3 py-3">
      <div className="mb-2 flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{approval.title}</div>
          {remaining !== null && (
            <div className="text-xs text-muted-foreground">
              {t("aiAssistant.approvalExpires", { seconds: remaining })}
            </div>
          )}
        </div>
        <Badge variant="outline" className="rounded-md uppercase">
          {approval.kind}
        </Badge>
      </div>
      {approval.description && (
        <p className="mb-2 text-xs leading-5 text-muted-foreground">{approval.description}</p>
      )}
      {approval.command && (
        <pre className="max-h-32 overflow-auto rounded-md border border-border bg-muted px-2 py-1.5 text-xs whitespace-pre-wrap break-all">
          {approval.command}
        </pre>
      )}
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
        {approval.cwd && <div className="truncate">CWD: {approval.cwd}</div>}
        {approval.host && <div className="truncate">Host: {approval.host}</div>}
        {approval.security && <div className="truncate">Security: {approval.security}</div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="xs" onClick={() => onResolve("allow-once")}>
          {t("aiAssistant.allowOnce")}
        </Button>
        <Button size="xs" variant="outline" onClick={() => onResolve("allow-always")}>
          {t("aiAssistant.allowAlways")}
        </Button>
        <Button size="xs" variant="destructive" onClick={() => onResolve("deny")}>
          {t("aiAssistant.deny")}
        </Button>
      </div>
    </div>
  );
}
