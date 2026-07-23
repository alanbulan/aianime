// Copyright (c) 2026 AI anime
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AssetBeatReferences } from "@/components/assets/asset-beat-references";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PropDialogController } from "@/modules/asset_world/application/use-prop-dialog-controller";

const INPUT_CLASS =
  "h-11 rounded-[8px] border-border bg-muted px-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10";
const TEXTAREA_CLASS =
  "rounded-[8px] border-border bg-muted px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10";

export function PropDialogView({
  controller,
}: {
  controller: PropDialogController;
}) {
  const { t } = useTranslation();
  const {
    close,
    draft,
    initial,
    onOpenChange,
    open,
    project,
    propTypeValues,
    references,
    saveDisabled,
    saving,
    submit,
    title,
    updateDraft,
  } = controller;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 overflow-hidden rounded-2xl border border-border bg-popover/95 p-7 shadow-xl backdrop-blur-3xl sm:max-w-lg">
        <DialogHeader className="gap-2">
          <DialogTitle className="flex items-center gap-2 text-lg font-medium tracking-tight">
            <span>{title}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label className="text-sm">{t("assets.props.fields.name")}</Label>
            <Input
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              className={INPUT_CLASS}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-sm">{t("assets.props.fields.type")}</Label>
            <Select
              value={draft.prop_type || "object"}
              onValueChange={(value) =>
                updateDraft({ prop_type: String(value) })
              }
            >
              <SelectTrigger className={INPUT_CLASS}>
                <SelectValue>
                  {t(`assets.props.types.${draft.prop_type || "object"}`, {
                    defaultValue: draft.prop_type || "object",
                  })}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {propTypeValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`assets.props.types.${value}`, {
                      defaultValue: value,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label className="text-sm">{t("assets.props.fields.owner")}</Label>
            <Input
              value={draft.owner ?? ""}
              onChange={(event) => updateDraft({ owner: event.target.value })}
              className={INPUT_CLASS}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-sm">
              {t("assets.props.fields.visualPrompt")}
            </Label>
            <Textarea
              rows={4}
              value={draft.visual_prompt ?? ""}
              onChange={(event) =>
                updateDraft({ visual_prompt: event.target.value })
              }
              className={TEXTAREA_CLASS}
            />
          </div>
          {initial ? (
            <AssetBeatReferences
              project={project}
              references={references}
              className="border-t border-border pt-4"
            />
          ) : null}
        </div>
        <DialogFooter className="-mx-7 -mb-7 border-t-0 bg-transparent p-7 pt-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={close}
            className="h-10 w-18 rounded-md border-border bg-muted px-0 text-sm font-normal text-foreground/80 hover:border-foreground/30 hover:bg-accent hover:text-foreground"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={saveDisabled}
            className="h-10 w-18 rounded-md bg-primary px-0 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
